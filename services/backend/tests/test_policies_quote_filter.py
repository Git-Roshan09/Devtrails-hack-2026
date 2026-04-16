from api.policies import _to_premium_quote_fields


def test_to_premium_quote_fields_filters_unknown_keys():
    raw = {
        "zone": "chennai",
        "ai_risk_score": 0.42,
        "basic_premium": 19.0,
        "plus_premium": 39.0,
        "pro_premium": 59.0,
        "forecast_json": {"source": "heuristic"},
        "risk_factors": ["rain"],
        "data_sources": ["calendar_heuristic"],
    }

    filtered = _to_premium_quote_fields(raw)

    assert set(filtered.keys()) == {
        "zone",
        "ai_risk_score",
        "basic_premium",
        "plus_premium",
        "pro_premium",
        "forecast_json",
    }
    assert "risk_factors" not in filtered
    assert "data_sources" not in filtered