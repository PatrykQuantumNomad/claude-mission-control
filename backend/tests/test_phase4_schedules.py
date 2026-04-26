"""Phase 4 Schedules router tests — SCHD-01..06.

Per Plan 03-01 per-router convention. Wave 1 plan 04-04 appends.
"""
from cmc.api.schemas.schedules import NLCronRequest, ScheduleCreate
from cmc.schedules.cron import validate_cron


def test_phase4_schedules_smoke():
    s = ScheduleCreate(name="daily", cron="0 9 * * *")
    assert s.cron == "0 9 * * *"
    assert validate_cron("0 9 * * *") is True
    assert validate_cron("not a cron") is False
    n = NLCronRequest(description="every weekday at 9am")
    assert "weekday" in n.description
