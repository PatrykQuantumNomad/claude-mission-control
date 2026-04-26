"""Phase 4 HITL router tests — HITL-01..07.

Per Plan 03-01 per-router convention: ALL HITL-* tests live here.
Wave 1 plan 04-02 appends real test cases on top of the smoke below.
"""
from cmc.api.schemas.hitl import DecisionCreate, InboxReplyRequest


def test_phase4_hitl_smoke():
    d = DecisionCreate(dedup_key="dk-1", prompt="test")
    assert d.dedup_key == "dk-1"
    r = InboxReplyRequest(reply="yes")
    assert r.reply == "yes"
