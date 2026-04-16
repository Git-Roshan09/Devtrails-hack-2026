"""
Severity Engine — Test Suite
─────────────────────────────
Tests for composite severity scoring, sigmoid multiplier, hex-grid calibration,
and trajectory-based bonus loss calculation.

Usage:
  cd services/backend
  python -m pytest tests/test_severity.py -v
"""

import math
import pytest
from engines.severity import (
    compute_composite_severity,
    classify_severity,
    get_continuous_multiplier,
    get_severity_label_and_multiplier,
    _get_rain_percentile,
    _get_traffic_impact,
    _get_duration_factor,
)
from models import DisruptionSeverity


# ══════════════════════════════════════════════════════════════
# COMPOSITE SEVERITY SCORING TESTS
# ══════════════════════════════════════════════════════════════

class TestCompositeSeverity:
    """Test the weighted composite severity scoring formula."""

    def test_zero_inputs_returns_low_score(self):
        score = compute_composite_severity(
            rain_mm=0, traffic_kmh=50, social_confidence=0, duration_hours=0
        )
        assert score == 0.0

    def test_extreme_inputs_returns_high_score(self):
        score = compute_composite_severity(
            rain_mm=150, traffic_kmh=0, social_confidence=1.0, duration_hours=6
        )
        assert score >= 75  # Should be catastrophic

    def test_moderate_rain_only(self):
        score = compute_composite_severity(
            rain_mm=50, traffic_kmh=30, social_confidence=0, duration_hours=0,
            month=11,  # NE Monsoon — 50mm is below P95 (90mm)
        )
        # With only moderate rain and normal traffic, should be low-moderate
        assert 10 <= score <= 50

    def test_traffic_gridlock_amplifies_score(self):
        """Low traffic speed should significantly increase severity."""
        score_normal = compute_composite_severity(
            rain_mm=30, traffic_kmh=25, social_confidence=0, duration_hours=1
        )
        score_gridlock = compute_composite_severity(
            rain_mm=30, traffic_kmh=2, social_confidence=0, duration_hours=1
        )
        assert score_gridlock > score_normal * 1.5

    def test_social_signal_contributes(self):
        """Social disruption signal should add to severity."""
        score_no_social = compute_composite_severity(
            rain_mm=30, traffic_kmh=10, social_confidence=0, duration_hours=1
        )
        score_with_social = compute_composite_severity(
            rain_mm=30, traffic_kmh=10, social_confidence=0.9, duration_hours=1
        )
        assert score_with_social > score_no_social

    def test_duration_factor_capped_at_4h(self):
        """Duration beyond 4 hours should not increase score."""
        score_4h = compute_composite_severity(
            rain_mm=50, traffic_kmh=5, social_confidence=0, duration_hours=4
        )
        score_8h = compute_composite_severity(
            rain_mm=50, traffic_kmh=5, social_confidence=0, duration_hours=8
        )
        assert score_4h == score_8h

    def test_score_capped_at_100(self):
        """Score should never exceed 100."""
        score = compute_composite_severity(
            rain_mm=500, traffic_kmh=0, social_confidence=1.0, duration_hours=10
        )
        assert score <= 100.0

    def test_score_never_negative(self):
        """Score should never go below 0."""
        score = compute_composite_severity(
            rain_mm=-5, traffic_kmh=100, social_confidence=-0.5, duration_hours=-1
        )
        assert score >= 0.0


# ══════════════════════════════════════════════════════════════
# SEVERITY CLASSIFICATION TESTS
# ══════════════════════════════════════════════════════════════

class TestSeverityClassification:
    """Test severity label classification from composite scores."""

    def test_minor_range(self):
        assert classify_severity(0) == DisruptionSeverity.minor
        assert classify_severity(10) == DisruptionSeverity.minor
        assert classify_severity(24.99) == DisruptionSeverity.minor

    def test_moderate_range(self):
        assert classify_severity(25) == DisruptionSeverity.moderate
        assert classify_severity(40) == DisruptionSeverity.moderate
        assert classify_severity(49.99) == DisruptionSeverity.moderate

    def test_severe_range(self):
        assert classify_severity(50) == DisruptionSeverity.severe
        assert classify_severity(60) == DisruptionSeverity.severe
        assert classify_severity(74.99) == DisruptionSeverity.severe

    def test_catastrophic_range(self):
        assert classify_severity(75) == DisruptionSeverity.catastrophic
        assert classify_severity(90) == DisruptionSeverity.catastrophic
        assert classify_severity(100) == DisruptionSeverity.catastrophic


# ══════════════════════════════════════════════════════════════
# SIGMOID MULTIPLIER TESTS
# ══════════════════════════════════════════════════════════════

class TestSigmoidMultiplier:
    """Test continuous sigmoid payout multiplier curve."""

    def test_zero_score_gives_minimum(self):
        mult = get_continuous_multiplier(0)
        assert 0.29 <= mult <= 0.32  # Should be near 0.3

    def test_mid_score_gives_transitional(self):
        mult = get_continuous_multiplier(50)
        assert 0.35 <= mult <= 0.55  # Still in lower portion of curve

    def test_high_score_gives_near_max(self):
        mult = get_continuous_multiplier(90)
        assert mult >= 1.3  # Should be approaching 1.5

    def test_max_score_gives_maximum(self):
        mult = get_continuous_multiplier(100)
        assert 1.45 <= mult <= 1.50  # Should be near 1.5

    def test_monotonically_increasing(self):
        """Multiplier should always increase with higher scores."""
        prev = 0
        for score in range(0, 101, 5):
            mult = get_continuous_multiplier(score)
            assert mult >= prev, f"Non-monotonic at score={score}"
            prev = mult

    def test_no_cliff_effects(self):
        """No large jumps between adjacent scores (max 0.1 per point)."""
        for score in range(0, 100):
            m1 = get_continuous_multiplier(score)
            m2 = get_continuous_multiplier(score + 1)
            assert abs(m2 - m1) < 0.1, f"Cliff at score={score}: {m1:.4f}→{m2:.4f}"

    def test_formula_consistency(self):
        """Verify the sigmoid formula produces expected values at key points."""
        # At normalized_score = 0.6 → exponent = 0 → sigmoid = 0.5
        # multiplier = 0.3 + 1.2 * 0.5 = 0.9
        mult = get_continuous_multiplier(60)
        assert 0.85 <= mult <= 0.95


# ══════════════════════════════════════════════════════════════
# SIGNAL PROCESSOR TESTS
# ══════════════════════════════════════════════════════════════

class TestRainPercentile:
    """Test rain percentile calculation."""

    def test_zero_rain(self):
        assert _get_rain_percentile(0, None, 11) == 0.0

    def test_threshold_rain_gives_50th(self):
        """Rain at exactly the seasonal threshold should be ~50th percentile."""
        pct = _get_rain_percentile(90.0, None, 11)  # P95 for Nov = 90mm
        assert 45 <= pct <= 55

    def test_double_threshold_very_high(self):
        """Rain at 2× threshold should be very high percentile."""
        pct = _get_rain_percentile(180.0, None, 11)
        assert pct >= 80


class TestTrafficImpact:
    """Test inverted traffic impact calculation."""

    def test_normal_speed_zero_impact(self):
        assert _get_traffic_impact(30) == 0.0
        assert _get_traffic_impact(50) == 0.0

    def test_zero_speed_max_impact(self):
        assert _get_traffic_impact(0) == 100.0

    def test_gridlock_high_impact(self):
        impact = _get_traffic_impact(3)
        assert impact >= 70

    def test_slow_moderate_impact(self):
        impact = _get_traffic_impact(15)
        assert 15 <= impact <= 40


class TestDurationFactor:
    """Test duration factor calculation."""

    def test_zero_hours(self):
        assert _get_duration_factor(0) == 0.0

    def test_one_hour(self):
        assert _get_duration_factor(1) == 25.0

    def test_four_hours(self):
        assert _get_duration_factor(4) == 100.0

    def test_capped_beyond_four(self):
        assert _get_duration_factor(8) == 100.0


# ══════════════════════════════════════════════════════════════
# INTEGRATION TESTS
# ══════════════════════════════════════════════════════════════

class TestIntegration:
    """End-to-end severity-to-multiplier tests."""

    def test_full_pipeline(self):
        result = get_severity_label_and_multiplier(
            rain_mm=80, traffic_kmh=2, social_confidence=0.5, duration_hours=3
        )
        assert "composite_score" in result
        assert "severity" in result
        assert "multiplier" in result
        assert result["composite_score"] >= 0
        assert result["multiplier"] >= 0.3

    def test_minor_event_gets_low_multiplier(self):
        result = get_severity_label_and_multiplier(
            rain_mm=5, traffic_kmh=25, social_confidence=0, duration_hours=0.5
        )
        assert result["severity"] == DisruptionSeverity.minor
        assert result["multiplier"] < 0.5

    def test_catastrophic_event_gets_high_multiplier(self):
        result = get_severity_label_and_multiplier(
            rain_mm=200, traffic_kmh=0, social_confidence=0.95, duration_hours=5
        )
        assert result["severity"] == DisruptionSeverity.catastrophic
        assert result["multiplier"] >= 1.2

    def test_payout_scaling_example(self):
        """Simulate the README example: Hari at ₹100/hr, 3h idle."""
        hourly_rate = 100.0
        idle_hours = 3.0

        # Minor event
        minor = get_severity_label_and_multiplier(rain_mm=10, traffic_kmh=20)
        minor_payout = hourly_rate * idle_hours * minor["multiplier"]

        # Catastrophic event
        catastrophic = get_severity_label_and_multiplier(
            rain_mm=150, traffic_kmh=0, social_confidence=0.9, duration_hours=4
        )
        catastrophic_payout = hourly_rate * idle_hours * catastrophic["multiplier"]

        # Catastrophic should pay significantly more
        assert catastrophic_payout > minor_payout * 2
        print(f"\n  Minor:        ₹{minor_payout:.0f} (×{minor['multiplier']:.2f})")
        print(f"  Catastrophic: ₹{catastrophic_payout:.0f} (×{catastrophic['multiplier']:.2f})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
