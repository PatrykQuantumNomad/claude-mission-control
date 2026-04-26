"""Phase 4 Tasks router tests — TASK-01..07.

Per Plan 03-01 per-router convention. Wave 1 plan 04-03 appends.
"""
from cmc.api.schemas.tasks import TaskCreate
from cmc.tasks.transitions import validate_transition


def test_phase4_tasks_smoke():
    t = TaskCreate(title="hello")
    assert t.title == "hello"
    assert validate_transition("pending", "running") is True
    assert validate_transition("done", "pending") is False
