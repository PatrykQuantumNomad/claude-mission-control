"""Database models. Importing this module populates SQLModel.metadata.

Every model module MUST be imported here with `# noqa: F401` or
`alembic revision --autogenerate` produces an empty migration because
target_metadata in env.py would be empty.

The imports below cover every database table.
"""
from cmc.db.models.activities import Activity  # noqa: F401
from cmc.db.models.alert_rules import AlertRule  # noqa: F401
from cmc.db.models.alert_state import AlertState  # noqa: F401
from cmc.db.models.decisions import Decision  # noqa: F401
from cmc.db.models.inbox import InboxMessage  # noqa: F401
from cmc.db.models.live_state import LiveState  # noqa: F401
from cmc.db.models.mcp_stats import MCPStat  # noqa: F401
from cmc.db.models.notification_log import NotificationLog  # noqa: F401
from cmc.db.models.otel_events import OtelEvent  # noqa: F401
from cmc.db.models.otel_metrics import OtelMetric  # noqa: F401
from cmc.db.models.pricing import PricingRow  # noqa: F401
from cmc.db.models.schedules import Schedule  # noqa: F401
from cmc.db.models.sessions import Session  # noqa: F401
from cmc.db.models.skills import Skill  # noqa: F401
from cmc.db.models.system_state import SystemState  # noqa: F401
from cmc.db.models.tasks import Task  # noqa: F401
from cmc.db.models.token_usage import TokenUsage  # noqa: F401
from cmc.db.models.tools import ToolCall  # noqa: F401
