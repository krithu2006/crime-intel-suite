"""
Crime Intel Suite — FastAPI Application (Modules 1–4).

Endpoints:
  GET /api/health                      → health check + summary stats
  GET /api/incidents                   → paginated incidents list
  GET /api/districts                   → district socio-economic data
  GET /api/wards                       → ward centroids and metadata
  GET /api/hotspots                    → DBSCAN crime hotspots for a date range
  GET /api/escalation                  → minor-crime escalation scores per ward
  GET /api/risk-scores                 → all wards ranked by risk score
  GET /api/risk-score                  → single ward risk score with explanation
  GET /api/network                     → offender co-occurrence graph
  GET /api/network/individual/{id}     → single accused details + connections
"""

from datetime import datetime
from fastapi import FastAPI, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func

from .database import engine, get_db, Base
from .models import Incident, Accused, DistrictSocioEconomic, Ward, incident_accused
from .analytics import detect_hotspots, compute_escalation
from .risk_scoring import compute_risk_scores
from .network_analysis import build_network, get_individual

# Create tables if they don't exist (idempotent)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Crime Intel Suite API",
    description="Backend API for the Karnataka State Police Crime Intelligence platform.",
    version="0.4.0",
)

# CORS — allow all origins for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═══════════════════════════════════════════════════════════════════════════════
#  MODULE 1 ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    """Health check endpoint — returns counts and date range."""
    incident_count = db.query(func.count(Incident.id)).scalar()
    accused_count = db.query(func.count(Accused.id)).scalar()
    ward_count = db.query(func.count(Ward.id)).scalar()
    district_count = db.query(func.count(DistrictSocioEconomic.id)).scalar()

    min_date = db.query(func.min(Incident.timestamp)).scalar()
    max_date = db.query(func.max(Incident.timestamp)).scalar()

    return {
        "status": "ok",
        "incidents": incident_count,
        "accused": accused_count,
        "wards": ward_count,
        "districts": district_count,
        "date_range": {
            "from": min_date.isoformat() if min_date else None,
            "to": max_date.isoformat() if max_date else None,
        },
    }


@app.get("/api/incidents")
def list_incidents(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    crime_type: str = Query(None),
    district: str = Query(None),
    ward_id: int = Query(None),
    min_severity: int = Query(None, ge=1, le=10),
    max_severity: int = Query(None, ge=1, le=10),
    db: Session = Depends(get_db),
):
    """Paginated list of incidents with optional filters."""
    q = db.query(Incident)

    if crime_type:
        q = q.filter(Incident.crime_type == crime_type)
    if district:
        q = q.filter(Incident.district == district)
    if ward_id is not None:
        q = q.filter(Incident.ward_id == ward_id)
    if min_severity is not None:
        q = q.filter(Incident.severity >= min_severity)
    if max_severity is not None:
        q = q.filter(Incident.severity <= max_severity)

    total = q.count()
    incidents = q.order_by(Incident.timestamp.desc()).offset(offset).limit(limit).all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "data": [inc.to_dict() for inc in incidents],
    }


@app.get("/api/districts")
def list_districts(db: Session = Depends(get_db)):
    """List all districts with socio-economic data."""
    districts = db.query(DistrictSocioEconomic).all()
    return {"data": [d.to_dict() for d in districts]}


@app.get("/api/wards")
def list_wards(
    district: str = Query(None),
    db: Session = Depends(get_db),
):
    """List all wards with centroids. Optionally filter by district."""
    q = db.query(Ward)
    if district:
        q = q.filter(Ward.district == district)

    wards = q.order_by(Ward.district, Ward.name).all()
    return {"data": [w.to_dict() for w in wards]}


# ═══════════════════════════════════════════════════════════════════════════════
#  MODULE 2 ENDPOINTS — Hotspot Detection & Escalation
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/hotspots")
def get_hotspots(
    date_from: str = Query(None, alias="from",
                           description="Start date ISO format, e.g. 2025-01-01"),
    date_to: str = Query(None, alias="to",
                         description="End date ISO format, e.g. 2025-06-30"),
    eps: float = Query(0.008, description="DBSCAN eps (degrees, ~0.008 = 800m)"),
    min_samples: int = Query(8, ge=2, description="DBSCAN min_samples"),
    crime_type: str = Query(None, description="Optional crime type filter"),
    district: str = Query(None, description="Optional district filter"),
    db: Session = Depends(get_db),
):
    """
    Compute DBSCAN hotspot clusters for incidents within a date range.
    Hotspots shift when the time window changes — nothing is pre-computed.
    """
    dt_from = _parse_date(date_from)
    dt_to = _parse_date(date_to)

    result = detect_hotspots(
        db,
        date_from=dt_from,
        date_to=dt_to,
        eps=eps,
        min_samples=min_samples,
        crime_type=crime_type,
        district=district,
    )
    return result


@app.get("/api/escalation")
def get_escalation(
    ward_id: int = Query(None, description="Optional ward ID to filter"),
    period: str = Query("monthly", description="Aggregation period: 'weekly' or 'monthly'"),
    rolling_window: int = Query(4, ge=2, le=12,
                                description="Number of periods for rolling stats"),
    threshold: float = Query(1.0, ge=0,
                             description="Z-score threshold for trending_up flag"),
    db: Session = Depends(get_db),
):
    """
    Compute escalation scores for wards based on minor-crime frequency trends.
    Minor crimes (Dispute, Vandalism, Eve Teasing) are tracked as leading
    indicators — a rising trend signals potential escalation before major crimes.
    """
    result = compute_escalation(
        db,
        ward_id=ward_id,
        period=period,
        rolling_window=rolling_window,
        threshold=threshold,
    )
    return result


# ═══════════════════════════════════════════════════════════════════════════════
#  MODULE 3 ENDPOINTS — Risk Scoring + Explainability
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/risk-scores")
def get_risk_scores(
    date_from: str = Query(None, alias="from",
                           description="Start date ISO format, e.g. 2025-01-01"),
    date_to: str = Query(None, alias="to",
                         description="End date ISO format, e.g. 2025-12-31"),
    district: str = Query(None, description="Optional district filter"),
    db: Session = Depends(get_db),
):
    """
    Compute risk scores for ALL wards using XGBoost + SHAP.
    Returns wards ranked by risk score (0-100) with plain-language explanations.
    """
    dt_from = _parse_date(date_from)
    dt_to = _parse_date(date_to)
    result = compute_risk_scores(db, date_from=dt_from, date_to=dt_to)
    if district and result and "wards" in result:
        result["wards"] = [w for w in result["wards"] if w["district"] == district]
    return result


@app.get("/api/risk-score")
def get_risk_score(
    ward_id: int = Query(..., description="Ward ID to score"),
    date_from: str = Query(None, alias="from",
                           description="Start date ISO format"),
    date_to: str = Query(None, alias="to",
                         description="End date ISO format"),
    db: Session = Depends(get_db),
):
    """
    Compute risk score for a SINGLE ward with full SHAP explanation.
    """
    dt_from = _parse_date(date_from)
    dt_to = _parse_date(date_to)
    result = compute_risk_scores(db, date_from=dt_from, date_to=dt_to, ward_id=ward_id)
    if result["wards"]:
        return result["wards"][0]
    return {"error": "Ward not found", "ward_id": ward_id}


# ═══════════════════════════════════════════════════════════════════════════════
#  MODULE 4 ENDPOINTS — Offender Network Analysis
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/network")
def get_network(
    ward_id: int = Query(None, description="Filter to incidents in this ward"),
    district: str = Query(None, description="Filter to incidents in this district"),
    db: Session = Depends(get_db),
):
    """
    Build the offender co-occurrence network graph.
    Returns nodes with plain-language tags, edges, and community groupings.
    """
    return build_network(db, ward_id=ward_id, district=district)


@app.get("/api/network/individual/{accused_id}")
def get_network_individual(
    accused_id: int,
    db: Session = Depends(get_db),
):
    """
    Get details for a single accused: connections, incidents, community.
    """
    result = get_individual(db, accused_id)
    if result is None:
        return {"error": "Individual not found", "accused_id": accused_id}
    return result


def _parse_date(s: str | None) -> datetime | None:
    """Parse an ISO date string or return None."""
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None
