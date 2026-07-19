# Crime Intel Suite

AI-driven crime analytics platform for law enforcement — predicts crime
escalation before it peaks using hotspot detection, explainable risk scoring
(XGBoost + SHAP), and offender network analysis.

> While traditional systems show what already happened, Crime Intel Suite
> predicts where crime is escalating before it peaks, explains why in plain
> language, and highlights who's likely involved — turning fragmented crime
> records into actionable intelligence.

## Problem Statement

Current crime analytics systems rely on siloed data and manual reporting,
limiting advanced analytics and proactive policing capabilities. This project
addresses that gap with a modern AI-powered analytics platform that transforms
fragmented records into actionable intelligence.

## Key Features

| Feature | How it's implemented |
|---|---|
| Interactive dashboards & geospatial maps | React + Leaflet map with date-range and district filters |
| Crime hotspot detection | DBSCAN clustering, recomputed live per selected time window |
| District-level drilldowns | District selector with aggregated summary stats, drilling into ward-level detail |
| Trend alerts & anomaly detection | Rolling z-score on minor-crime frequency per ward — an early-warning signal before major incidents |
| Network & link analysis of criminals | NetworkX co-accused graph with centrality metrics and community detection |
| Repeat offender tracking | Per-individual profile with a Recency-Frequency-Severity concern score |
| Socio-economic crime correlation | District literacy, unemployment, and population density feed directly into the risk model |
| Predictive risk scoring | XGBoost model producing a 0–100 risk score per ward |
| AI/ML-based pattern detection | DBSCAN (spatial), rolling z-score (temporal), XGBoost (predictive), NetworkX (relational) |
| Explainable AI | SHAP values converted into plain-language explanations — no jargon shown to the user |

## Tech Stack

**Frontend:** React (Vite), Tailwind CSS, Leaflet.js, Recharts, react-force-graph
**Backend:** Python, FastAPI, SQLAlchemy
**Database:** SQLite
**ML/Data:** Pandas, NumPy, scikit-learn, XGBoost, SHAP, NetworkX

## Data

This prototype uses synthetic data modeled on realistic crime patterns
(incident locations, timestamps, crime types, severity, and co-accused
linkages), combined with publicly available socio-economic indicators. In a
production deployment, this would integrate with existing systems such as
CCTNS and e-FIR platforms rather than requiring new data collection.

## Getting Started

### Backend
```bash
cd backend
pip install -r requirements.txt
python app/seed.py    # generates the synthetic dataset
python run.py         # starts the API on http://localhost:8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev           # starts the app on http://localhost:5173
```

### Verify
- `http://localhost:8000/api/health` — should return status and record counts
- `http://localhost:5173` — the dashboard, with Hotspot / Risk Score / Network views

## API Overview

| Endpoint | Description |
|---|---|
| `GET /api/health` | Health check + summary stats |
| `GET /api/incidents` | Paginated, filterable incident list |
| `GET /api/districts` | District socio-economic data |
| `GET /api/wards` | Ward centroids and metadata |
| `GET /api/hotspots` | DBSCAN hotspot clusters for a date range |
| `GET /api/escalation` | Minor-crime escalation scores per ward |
| `GET /api/risk-scores` | All wards ranked by predictive risk score |
| `GET /api/risk-score` | Single ward risk score with SHAP explanation |
| `GET /api/network` | Offender co-occurrence network graph |
| `GET /api/network/individual/{id}` | Individual profile, connections, and concern score |

## Disclaimer

All data in this prototype is synthetic and generated for demonstration
purposes only. It does not represent real individuals, incidents, or law
enforcement records.
