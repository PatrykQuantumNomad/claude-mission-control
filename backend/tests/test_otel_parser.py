"""Phase 13 INGST-11 / INGST-13 — pure-function unit tests for the new
attribute extractors. Exercises iter_attrs end-to-end (real OTLP list shape)
so any future regression in iter_attrs surfaces here, not at integration time.
"""
from cmc.ingest.otel_parser import extract_event_sequence, extract_skill_attr


def test_extract_skill_attr_real_otlp_shape():
    """Real OTLP attributes list -> iter_attrs -> extract_skill_attr."""
    record = {
        "attributes": [
            {"key": "event.name",  "value": {"stringValue": "skill_activated"}},
            {"key": "skill_name",  "value": {"stringValue": "data:analyze"}},
            {"key": "session.id",  "value": {"stringValue": "sess-1"}},
        ]
    }
    assert extract_skill_attr(record) == "data:analyze"


def test_extract_skill_attr_falls_back_to_dotted():
    record = {
        "attributes": [
            {"key": "skill.name", "value": {"stringValue": "fb-dotted"}},
        ]
    }
    assert extract_skill_attr(record) == "fb-dotted"


def test_extract_skill_attr_falls_back_to_bare_name():
    record = {
        "attributes": [
            {"key": "name", "value": {"stringValue": "fb-bare"}},
        ]
    }
    assert extract_skill_attr(record) == "fb-bare"


def test_extract_skill_attr_returns_none_when_absent():
    assert extract_skill_attr({"attributes": []}) is None
    assert extract_skill_attr({}) is None


def test_extract_event_sequence_int_value():
    record = {"attributes": [{"key": "event.sequence", "value": {"intValue": 42}}]}
    assert extract_event_sequence(record) == 42


def test_extract_event_sequence_string_intvalue_wire_safety():
    """OTLP int64 may arrive as JSON string for wire safety — must coerce."""
    record = {"attributes": [{"key": "event.sequence", "value": {"intValue": "7349"}}]}
    assert extract_event_sequence(record) == 7349


def test_extract_event_sequence_returns_none_when_absent():
    assert extract_event_sequence({"attributes": []}) is None
    assert extract_event_sequence({}) is None
