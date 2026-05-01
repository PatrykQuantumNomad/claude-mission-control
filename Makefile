# Root automation for Claude Mission Control.
#
# The Makefile is intentionally a thin orchestration layer over the project's
# real tools: uv for the backend, pnpm for the frontend, and scripts/cmc for
# launchd operations. Keep application behavior in those tools; keep this file
# focused on repeatable developer and release workflows.

# Use bash with strict flags so failed subcommands stop the target immediately.
SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

# Project layout. Override these only when driving the Makefile from a wrapper
# or from an alternate checkout layout.
BACKEND_DIR ?= backend
FRONTEND_DIR ?= frontend
SCRIPTS_DIR ?= scripts

# Local service ports. The defaults match backend Settings and Vite config.
HOST ?= 127.0.0.1
PORT ?= 8765
FRONTEND_PORT ?= 5173

# Tooling commands and install locations. These are overridable so CI or local
# shells can pin tool paths without editing the Makefile.
UV ?= uv
PNPM ?= pnpm
PRE_COMMIT ?= pre-commit
CMC_HOME ?= $(CURDIR)
INSTALL_PREFIX ?= $(HOME)/.command-centre

# Backend app/test knobs. PYTEST_ARGS and RUFF_ARGS let callers scope checks:
#   make test-backend PYTEST_ARGS="-x tests/test_phase1_boot.py"
#   make lint-backend RUFF_ARGS="cmc/api"
UVICORN_APP ?= cmc.app.factory:create_app
PYTEST_ARGS ?=
RUFF_ARGS ?= cmc tests
PYRIGHT_ARGS ?= cmc
BANDIT_ARGS ?= -r cmc -x tests -s B101,B110,B404,B603,B607
PIP_AUDIT_ARGS ?=

.PHONY: help
help: ## Show this help.
	@awk 'BEGIN {FS = ":.*##"; printf "\nClaude Mission Control targets:\n"} /^##@ / {printf "\n\033[1m%s\033[0m\n", substr($$0, 5); next} /^[a-zA-Z0-9_.-]+:.*##/ {printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2} END {printf "\n"}' $(MAKEFILE_LIST)

# ---------------------------------------------------------------------------
# Dependency setup
# ---------------------------------------------------------------------------
##@ Dependency setup

.PHONY: setup
setup: backend-install frontend-install ## Install backend and frontend development dependencies.

.PHONY: backend-install
backend-install: ## Install backend dependencies with dev extras via uv.
	cd "$(BACKEND_DIR)" && "$(UV)" sync --extra dev

.PHONY: frontend-install
frontend-install: ## Install frontend dependencies via pnpm.
	cd "$(FRONTEND_DIR)" && "$(PNPM)" install --frozen-lockfile

# ---------------------------------------------------------------------------
# Local development servers
# ---------------------------------------------------------------------------
##@ Local development servers

.PHONY: dev-backend
dev-backend: ## Run the FastAPI backend on HOST:PORT.
	cd "$(BACKEND_DIR)" && "$(UV)" run uvicorn "$(UVICORN_APP)" --factory --host "$(HOST)" --port "$(PORT)"

.PHONY: dev-frontend
dev-frontend: ## Run the Vite frontend dev server.
	cd "$(FRONTEND_DIR)" && "$(PNPM)" run dev -- --host "$(HOST)" --port "$(FRONTEND_PORT)"

# ---------------------------------------------------------------------------
# Build and packaging
# ---------------------------------------------------------------------------
##@ Build and packaging

.PHONY: build
build: build-frontend package-backend ## Build frontend assets and backend wheel/sdist.

.PHONY: build-frontend
build-frontend: ## Typecheck and build the frontend into frontend/dist.
	cd "$(FRONTEND_DIR)" && "$(PNPM)" run build

.PHONY: package-backend
package-backend: ## Build backend distribution artifacts.
	cd "$(BACKEND_DIR)" && "$(UV)" build

# ---------------------------------------------------------------------------
# Tests and static checks
# ---------------------------------------------------------------------------
##@ Tests and static checks

.PHONY: test
test: test-backend test-frontend ## Run backend and frontend unit tests.

.PHONY: test-backend
test-backend: ## Run backend pytest suite.
	cd "$(BACKEND_DIR)" && "$(UV)" run pytest $(PYTEST_ARGS)

.PHONY: test-frontend
test-frontend: ## Run frontend unit/component tests.
	cd "$(FRONTEND_DIR)" && "$(PNPM)" test

.PHONY: test-e2e
test-e2e: build-frontend ## Run Playwright E2E tests.
	cd "$(FRONTEND_DIR)" && "$(PNPM)" run test:e2e

.PHONY: typecheck
typecheck: ## Run frontend TypeScript typecheck.
	cd "$(FRONTEND_DIR)" && "$(PNPM)" run typecheck

.PHONY: typecheck-backend
typecheck-backend: ## Run backend Python typecheck.
	cd "$(BACKEND_DIR)" && "$(UV)" run pyright $(PYRIGHT_ARGS)

.PHONY: lint
lint: lint-backend typecheck ## Run backend lint and frontend typecheck.

.PHONY: hooks-install
hooks-install: ## Install git pre-commit quality hooks.
	cd "$(BACKEND_DIR)" && "$(UV)" run "$(PRE_COMMIT)" install --config ../.pre-commit-config.yaml

.PHONY: pre-commit
pre-commit: ## Run pre-commit quality hooks across all files.
	cd "$(BACKEND_DIR)" && "$(UV)" run "$(PRE_COMMIT)" run --all-files --config ../.pre-commit-config.yaml

.PHONY: lint-backend
lint-backend: typecheck-backend ruff-backend ## Run backend Ruff checks and Python typecheck.

.PHONY: ruff-backend
ruff-backend: ## Run backend Ruff checks.
	cd "$(BACKEND_DIR)" && "$(UV)" run ruff check $(RUFF_ARGS)

.PHONY: security-backend
security-backend: ## Run backend security static/dependency checks.
	cd "$(BACKEND_DIR)" && "$(UV)" run bandit $(BANDIT_ARGS)
	cd "$(BACKEND_DIR)" && "$(UV)" run pip-audit $(PIP_AUDIT_ARGS)

.PHONY: check
check: lint security-backend test build-frontend install-dry-run ## Run production readiness checks.

# ---------------------------------------------------------------------------
# Database and app operations
# ---------------------------------------------------------------------------
##@ Database and app operations

.PHONY: db-upgrade
db-upgrade: ## Apply Alembic migrations to the configured SQLite database.
	cd "$(BACKEND_DIR)" && "$(UV)" run alembic upgrade head

.PHONY: sync
sync: ## Trigger a manual ingestion sync through the local API.
	CMC_HOME="$(CMC_HOME)" "$(SCRIPTS_DIR)/cmc" sync

.PHONY: doctor
doctor: ## Run the project health checker.
	CMC_HOME="$(CMC_HOME)" "$(SCRIPTS_DIR)/cmc" doctor

.PHONY: setup-otel
setup-otel: ## Merge Claude Code OTEL settings into ~/.claude/settings.json.
	CMC_HOME="$(CMC_HOME)" "$(SCRIPTS_DIR)/cmc" setup otel

.PHONY: setup-telegram
setup-telegram: ## Run the Telegram BotFather setup wizard.
	CMC_HOME="$(CMC_HOME)" "$(SCRIPTS_DIR)/cmc" setup telegram

# ---------------------------------------------------------------------------
# Install and launchd lifecycle
# ---------------------------------------------------------------------------
##@ Install and launchd lifecycle

.PHONY: install-dry-run
install-dry-run: ## Smoke check the macOS installer without writing files.
	bash "$(SCRIPTS_DIR)/install.sh" --dry-run

.PHONY: install-dev
install-dev: ## Install launchd plists and cmc shim using this checkout as CMC_HOME.
	bash "$(SCRIPTS_DIR)/install.sh"

.PHONY: install
install: build-frontend ## Install a production copy into INSTALL_PREFIX.
	bash "$(SCRIPTS_DIR)/install.sh" --install --prefix="$(INSTALL_PREFIX)"

.PHONY: start
start: ## Start launchd daemons for the selected CMC_HOME.
	CMC_HOME="$(CMC_HOME)" "$(SCRIPTS_DIR)/cmc" start

.PHONY: stop
stop: ## Stop launchd daemons for the selected CMC_HOME.
	CMC_HOME="$(CMC_HOME)" "$(SCRIPTS_DIR)/cmc" stop

.PHONY: restart
restart: ## Restart launchd daemons for the selected CMC_HOME.
	CMC_HOME="$(CMC_HOME)" "$(SCRIPTS_DIR)/cmc" restart

.PHONY: status
status: ## Show launchd daemon status.
	CMC_HOME="$(CMC_HOME)" "$(SCRIPTS_DIR)/cmc" status

.PHONY: logs
logs: ## Tail daemon logs.
	CMC_HOME="$(CMC_HOME)" "$(SCRIPTS_DIR)/cmc" logs

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
##@ Cleanup

.PHONY: clean
clean: ## Remove generated build and cache artifacts, preserving data and env files.
	rm -rf "$(FRONTEND_DIR)/dist" "$(BACKEND_DIR)/dist" "$(BACKEND_DIR)/build"
	rm -rf "$(BACKEND_DIR)/.pytest_cache" "$(FRONTEND_DIR)/coverage" "$(FRONTEND_DIR)/test-results"
	find "$(BACKEND_DIR)" -type d \( -name __pycache__ -o -name .ruff_cache \) -prune -exec rm -rf {} +
