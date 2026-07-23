"""
Crime Intel Suite — Module 2: Hotspot Detection & Escalation Analysis

Contains:
  1. Spatial hotspot detection via DBSCAN clustering on incident lat/lng
  2. Escalation / early-warning detection via rolling z-score on minor-crime
     frequency per ward (weekly/monthly), producing escalation_score and
     trending_up flag.
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from sklearn.cluster import DBSCAN
from sqlalchemy.orm import Session
from sqlalchemy import and_

from .models import Incident, Ward


# ═══════════════════════════════════════════════════════════════════════════════
#  1. SPATIAL HOTSPOT DETECTION (DBSCAN)
# ═══════════════════════════════════════════════════════════════════════════════

# DBSCAN parameters tuned for Bengaluru ward-scale data:
#   eps ≈ 0.008 degrees (~800m radius at this latitude)
#   min_samples = 8  (need at least 8 incidents to form a hotspot)
DEFAULT_EPS = 0.008
DEFAULT_MIN_SAMPLES = 8


def detect_hotspots(
    db: Session,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    eps: float = DEFAULT_EPS,
    min_samples: int = DEFAULT_MIN_SAMPLES,
    crime_type: str | None = None,
    district: str | None = None,
) -> dict:
    """
    Run DBSCAN on incidents within the given time window.

    Returns:
      {
        "params": { eps, min_samples, date_from, date_to },
        "n_incidents": int,
        "n_clusters": int,
        "n_noise": int,
        "clusters": [
            {
                "cluster_id": int,
                "centroid": { "lat": float, "lng": float },
                "incident_count": int,
                "radius_m": float,
                "dominant_crime_type": str,
                "avg_severity": float,
                "points": [ { "lat", "lng", "crime_type", "severity", "timestamp" }, ... ]
            }, ...
        ]
      }
    """
    # ── Build query with optional filters ──
    q = db.query(Incident)

    if date_from:
        q = q.filter(Incident.timestamp >= date_from)
    if date_to:
        q = q.filter(Incident.timestamp <= date_to)
    if crime_type:
        q = q.filter(Incident.crime_type == crime_type)
    if district:
        q = q.filter(Incident.district == district)

    incidents = q.all()

    point_details = [_incident_point(inc) for inc in incidents]

    if len(incidents) < min_samples:
        return {
            "params": _params_dict(eps, min_samples, date_from, date_to),
            "n_incidents": len(incidents),
            "n_clusters": 0,
            "n_noise": len(incidents),
            "clusters": [],
            "points": point_details,
        }

    # ── Prepare coordinate matrix ──
    coords = np.array([[inc.lat, inc.lng] for inc in incidents])

    # ── Run DBSCAN ──
    db_model = DBSCAN(eps=eps, min_samples=min_samples, metric="euclidean")
    labels = db_model.fit_predict(coords)

    n_clusters = len(set(labels) - {-1})
    n_noise = int(np.sum(labels == -1))

    # ── Build cluster summaries ──
    clusters = []
    for cid in range(n_clusters):
        mask = labels == cid
        cluster_incidents = [inc for inc, lbl in zip(incidents, labels) if lbl == cid]
        cluster_coords = coords[mask]

        centroid_lat = float(np.mean(cluster_coords[:, 0]))
        centroid_lng = float(np.mean(cluster_coords[:, 1]))

        # Approximate radius in meters (1 degree lat ≈ 111,320m at equator)
        max_dist_deg = float(np.max(np.sqrt(
            (cluster_coords[:, 0] - centroid_lat) ** 2 +
            (cluster_coords[:, 1] - centroid_lng) ** 2
        )))
        radius_m = round(max_dist_deg * 111_320, 1)

        # Dominant crime type
        crime_counts = {}
        severities = []
        for inc in cluster_incidents:
            crime_counts[inc.crime_type] = crime_counts.get(inc.crime_type, 0) + 1
            severities.append(inc.severity)
        dominant = max(crime_counts, key=crime_counts.get)

        # Point details (limit to avoid huge payloads — send up to 200 per cluster)
        cluster_points = [_incident_point(inc) for inc in cluster_incidents[:200]]

        clusters.append({
            "cluster_id": cid,
            "centroid": {"lat": centroid_lat, "lng": centroid_lng},
            "incident_count": len(cluster_incidents),
            "radius_m": radius_m,
            "dominant_crime_type": dominant,
            "avg_severity": round(float(np.mean(severities)), 2),
            "crime_breakdown": crime_counts,
            "points": cluster_points,
        })

    # Sort clusters by incident count descending
    clusters.sort(key=lambda c: c["incident_count"], reverse=True)

    return {
        "params": _params_dict(eps, min_samples, date_from, date_to),
        "n_incidents": len(incidents),
        "n_clusters": n_clusters,
        "n_noise": n_noise,
        "clusters": clusters,
        "points": point_details,
    }


def _incident_point(incident: Incident) -> dict:
    return {
        "lat": incident.lat,
        "lng": incident.lng,
        "crime_type": incident.crime_type,
        "severity": incident.severity,
        "timestamp": incident.timestamp.isoformat(),
    }


def _params_dict(eps, min_samples, date_from, date_to):
    return {
        "eps": eps,
        "min_samples": min_samples,
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  2. ESCALATION / EARLY-WARNING DETECTION
# ═══════════════════════════════════════════════════════════════════════════════
#
# Strategy:
#   For each ward, build a time series of MINOR crime frequency (Dispute,
#   Vandalism, Eve Teasing) aggregated by period (weekly or monthly).
#   Apply a rolling z-score to detect wards where minor-crime frequency is
#   rising abnormally — a leading indicator before major incidents.
#
#   - rolling_window = 4 periods (4 weeks or 4 months)
#   - escalation_score = z-score of the latest period relative to the
#     rolling mean/std of the preceding window
#   - trending_up = True if escalation_score > threshold (default 1.0)

MINOR_CRIME_TYPES = {"Dispute", "Vandalism", "Eve Teasing"}
DEFAULT_ROLLING_WINDOW = 4
DEFAULT_ESCALATION_THRESHOLD = 1.0


def compute_escalation(
    db: Session,
    ward_id: int | None = None,
    period: str = "monthly",      # "weekly" or "monthly"
    rolling_window: int = DEFAULT_ROLLING_WINDOW,
    threshold: float = DEFAULT_ESCALATION_THRESHOLD,
) -> dict:
    """
    Compute escalation scores for wards based on minor-crime frequency trends.

    Returns:
      {
        "period": "monthly" | "weekly",
        "rolling_window": int,
        "threshold": float,
        "minor_crime_types": [...],
        "wards": [
            {
                "ward_id": int,
                "ward_name": str,
                "district": str,
                "escalation_score": float,
                "trending_up": bool,
                "latest_period": str,
                "latest_count": int,
                "rolling_mean": float,
                "rolling_std": float,
                "time_series": [ { "period": str, "count": int }, ... ]
            }, ...
        ]
      }
    """
    # ── Fetch all minor-crime incidents ──
    q = db.query(Incident).filter(Incident.crime_type.in_(MINOR_CRIME_TYPES))
    if ward_id is not None:
        q = q.filter(Incident.ward_id == ward_id)

    incidents = q.all()

    if not incidents:
        return _empty_escalation_result(period, rolling_window, threshold)

    # ── Build a DataFrame ──
    rows = [{"ward_id": inc.ward_id, "timestamp": inc.timestamp} for inc in incidents]
    df = pd.DataFrame(rows)
    df["timestamp"] = pd.to_datetime(df["timestamp"])

    # ── Determine period grouping key ──
    if period == "weekly":
        df["period_key"] = df["timestamp"].dt.isocalendar().year.astype(str) + "-W" + \
                           df["timestamp"].dt.isocalendar().week.astype(str).str.zfill(2)
        df["period_sort"] = df["timestamp"].dt.isocalendar().year * 100 + \
                            df["timestamp"].dt.isocalendar().week
    else:  # monthly
        df["period_key"] = df["timestamp"].dt.strftime("%Y-%m")
        df["period_sort"] = df["timestamp"].dt.year * 100 + df["timestamp"].dt.month

    # ── Get all wards ──
    ward_q = db.query(Ward)
    if ward_id is not None:
        ward_q = ward_q.filter(Ward.id == ward_id)
    wards = ward_q.all()
    ward_map = {w.id: w for w in wards}

    # ── Generate the full set of periods so wards with 0 counts still show ──
    all_periods = sorted(df[["period_key", "period_sort"]].drop_duplicates()
                         .values.tolist(), key=lambda x: x[1])

    # ── Compute per-ward escalation ──
    ward_results = []

    for w in wards:
        wdf = df[df["ward_id"] == w.id]

        # Build complete time series with 0-filled gaps
        ts_map = wdf.groupby("period_key").size().to_dict()
        ts = [{"period": pk, "count": ts_map.get(pk, 0)} for pk, _ in all_periods]

        counts = [t["count"] for t in ts]

        if len(counts) < rolling_window + 1:
            # Not enough data for a meaningful z-score
            ward_results.append({
                "ward_id": w.id,
                "ward_name": w.name,
                "district": w.district,
                "escalation_score": 0.0,
                "trending_up": False,
                "latest_period": ts[-1]["period"] if ts else None,
                "latest_count": counts[-1] if counts else 0,
                "rolling_mean": None,
                "rolling_std": None,
                "time_series": ts,
            })
            continue

        # Rolling stats over the window preceding the latest period
        window_counts = counts[-(rolling_window + 1):-1]
        latest_count = counts[-1]
        r_mean = float(np.mean(window_counts))
        r_std = float(np.std(window_counts, ddof=1)) if len(window_counts) > 1 else 0.0

        # Z-score
        if r_std > 0:
            z = (latest_count - r_mean) / r_std
        else:
            # If std is 0 (constant counts), any increase is anomalous
            z = float(latest_count - r_mean) * 2.0 if latest_count > r_mean else 0.0

        escalation_score = round(z, 3)
        trending_up = escalation_score > threshold

        ward_results.append({
            "ward_id": w.id,
            "ward_name": w.name,
            "district": w.district,
            "escalation_score": escalation_score,
            "trending_up": trending_up,
            "latest_period": ts[-1]["period"],
            "latest_count": latest_count,
            "rolling_mean": round(r_mean, 2),
            "rolling_std": round(r_std, 2),
            "time_series": ts,
        })

    # Sort by escalation score descending
    ward_results.sort(key=lambda w: w["escalation_score"], reverse=True)

    return {
        "period": period,
        "rolling_window": rolling_window,
        "threshold": threshold,
        "minor_crime_types": sorted(MINOR_CRIME_TYPES),
        "wards": ward_results,
    }


def _empty_escalation_result(period, rolling_window, threshold):
    return {
        "period": period,
        "rolling_window": rolling_window,
        "threshold": threshold,
        "minor_crime_types": sorted(MINOR_CRIME_TYPES),
        "wards": [],
    }
