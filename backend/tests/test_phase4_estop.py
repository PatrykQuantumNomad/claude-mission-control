"""Phase 4 Emergency Stop tests — ESTOP-01..04.

Per Plan 03-01 per-router convention. Wave 1 plan 04-05 appends.
"""
from cmc.api.schemas.system import EmergencyResumeResponse, EmergencyStopResponse
from cmc.core.process import emergency_stop_all


def test_phase4_estop_smoke(tmp_pid_dir):
    # No PID files in tmp dir -> empty summary, all lists empty.
    summary = emergency_stop_all(pid_directory=tmp_pid_dir)
    assert summary["terminated"] == []
    assert summary["skipped"] == []
    assert summary["missing"] == []
    r = EmergencyStopResponse(
        emergency_stop=True,
        terminated_pids=[],
        skipped_pids=[],
        missing_pids=[],
        failed_running_tasks=0,
    )
    assert r.emergency_stop is True
    rr = EmergencyResumeResponse(emergency_stop=False)
    assert rr.emergency_stop is False
