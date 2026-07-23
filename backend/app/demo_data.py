"""Generate a fresh, clearly synthetic Karnataka crime dataset for demos."""

from __future__ import annotations

import csv
import random
from datetime import datetime, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = ROOT / "data" / "karnataka_crime.csv"

# District centroids are used only to place synthetic demo points on the map.
DISTRICT_CENTERS = {
    "Bagalkote": (16.172, 75.655), "Ballari": (15.140, 76.921),
    "Belagavi": (15.849, 74.498), "Bengaluru Rural": (13.285, 77.607),
    "Bengaluru Urban": (12.972, 77.595), "Bidar": (17.914, 77.519),
    "Chamarajanagar": (11.927, 76.943), "Chikkaballapur": (13.436, 77.731),
    "Chikkamagaluru": (13.316, 75.773), "Chitradurga": (14.225, 76.400),
    "Dakshina Kannada": (12.915, 74.856), "Davanagere": (14.464, 75.922),
    "Dharwad": (15.458, 75.007), "Gadag": (15.432, 75.638),
    "Hassan": (13.007, 76.102), "Haveri": (14.795, 75.404),
    "Kalaburagi": (17.329, 76.834), "Kodagu": (12.424, 75.738),
    "Kolar": (13.136, 78.130), "Koppal": (15.350, 76.155),
    "Mandya": (12.522, 76.896), "Mysuru": (12.295, 76.640),
    "Raichur": (16.208, 77.346), "Ramanagara": (12.722, 77.281),
    "Shivamogga": (13.929, 75.568), "Tumakuru": (13.339, 77.102),
    "Udupi": (13.340, 74.742), "Uttara Kannada": (14.818, 74.129),
    "Vijayapura": (16.830, 75.710), "Vijayanagara": (15.335, 76.461),
    "Yadgir": (16.762, 77.144),
}

CRIMES = [
    ("Theft", 4, 28), ("Assault", 7, 14), ("Burglary", 6, 12),
    ("Fraud", 5, 12), ("Dispute", 3, 15), ("Robbery", 8, 6),
    ("Vandalism", 2, 7), ("Chain Snatching", 7, 6),
]
DEMO_ASSOCIATES = [f"Demo Associate {number:03d}" for number in range(1, 241)]


def generate_demo_csv(count: int = 1800) -> int:
    """Write a new randomized CSV for each local demo startup."""
    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    now = datetime.now().replace(microsecond=0)
    districts = list(DISTRICT_CENTERS.items())
    crime_names = [crime[0] for crime in CRIMES]
    crime_weights = [crime[2] for crime in CRIMES]
    severity_by_crime = {crime[0]: crime[1] for crime in CRIMES}

    with CSV_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            "fir_number", "district", "ward", "crime_type", "severity",
            "latitude", "longitude", "timestamp", "description", "accused_names",
        ])
        writer.writeheader()
        for index in range(1, count + 1):
            district, (lat, lng) = random.choice(districts)
            crime = random.choices(crime_names, weights=crime_weights, k=1)[0]
            incident_time = now - timedelta(minutes=random.randint(0, 60 * 24 * 90))
            group = (districts.index((district, (lat, lng))) % 12) * 20
            associates = random.sample(DEMO_ASSOCIATES[group:group + 20], k=random.choices([1, 2, 3], [35, 45, 20])[0])
            writer.writerow({
                "fir_number": f"DEMO-{now:%Y%m%d}-{index:05d}",
                "district": district,
                "ward": f"{district} Demo Zone {random.randint(1, 4)}",
                "crime_type": crime,
                "severity": max(1, min(10, severity_by_crime[crime] + random.randint(-1, 1))),
                "latitude": round(lat + random.uniform(-0.045, 0.045), 6),
                "longitude": round(lng + random.uniform(-0.045, 0.045), 6),
                "timestamp": incident_time.isoformat(),
                "description": f"Synthetic demo record: {crime.lower()} reported in {district}.",
                "accused_names": "|".join(associates),
            })
    return count


if __name__ == "__main__":
    print(f"[demo] Generated {generate_demo_csv()} synthetic Karnataka incidents")
