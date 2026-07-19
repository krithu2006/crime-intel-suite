"""
Crime Intel Suite — Module 4: Offender Network Analysis

Builds a co-occurrence graph from the incident_accused table:
  - Nodes = accused individuals
  - Edges = co-appearance in the same incident (weighted by shared count)

Computes:
  - Degree centrality, betweenness centrality, PageRank
  - Community detection via greedy modularity
  - Plain-language tags: "Central Figure", "Connector", "Repeat Associate"
"""

import networkx as nx
from collections import defaultdict
from itertools import combinations
from sqlalchemy.orm import Session
from sqlalchemy import select, text
from datetime import datetime

from .models import Incident, Accused, Ward, incident_accused


# ── Plain-language tag thresholds (percentile-based, computed dynamically) ──
def _assign_tag(degree_rank, between_rank, n_incidents):
    """
    Assign a plain-language tag based on centrality percentile ranks.
    degree_rank / between_rank are 0-1 (1 = highest in the network).
    """
    if degree_rank >= 0.95:
        return "Central Figure"
    if between_rank >= 0.90:
        return "Connector"
    if n_incidents >= 3:
        return "Repeat Associate"
    if degree_rank >= 0.70:
        return "Frequent Associate"
    return "Associate"


TAG_DESCRIPTIONS = {
    "Central Figure": "Linked to many individuals across multiple cases",
    "Connector": "Bridges otherwise separate groups of offenders",
    "Repeat Associate": "Appears in multiple cases",
    "Frequent Associate": "Connected to several other individuals",
    "Associate": "Linked to cases in the area",
}

# Community label letters
COMMUNITY_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def build_network(
    db: Session,
    ward_id: int | None = None,
    district: str | None = None,
    min_edge_weight: int = 1,
) -> dict:
    """
    Build the offender co-occurrence network, compute metrics, detect communities.

    Returns:
      {
        "summary": { n_nodes, n_edges, n_communities, ... },
        "nodes": [ { id, name, alias, age, gender, tag, tag_description,
                     incident_count, community_id, community_label, degree, ... } ],
        "edges": [ { source, target, weight, shared_incidents } ],
        "communities": [ { id, label, member_count, top_ward, members: [...] } ],
      }
    """
    # ── 1. Get relevant incidents (optionally filtered by ward/district) ──
    inc_q = db.query(Incident)
    if ward_id is not None:
        inc_q = inc_q.filter(Incident.ward_id == ward_id)
    if district:
        inc_q = inc_q.filter(Incident.district == district)
    incidents = inc_q.all()
    inc_ids = {inc.id for inc in incidents}

    if not inc_ids:
        return _empty_result()

    # Map incident -> ward for later community labeling
    inc_ward_map = {inc.id: (inc.ward_id, inc.district) for inc in incidents}

    # ── 2. Get incident-accused links ──
    stmt = select(incident_accused.c.incident_id, incident_accused.c.accused_id)
    all_links = db.execute(stmt).fetchall()

    # Filter to relevant incidents
    # Build: incident_id -> [accused_ids]
    inc_to_accused = defaultdict(list)
    accused_incident_count = defaultdict(int)
    accused_wards = defaultdict(set)

    for inc_id, acc_id in all_links:
        if inc_id in inc_ids:
            inc_to_accused[inc_id].append(acc_id)
            accused_incident_count[acc_id] += 1
            wid, dist = inc_ward_map.get(inc_id, (None, None))
            if wid:
                accused_wards[acc_id].add((wid, dist))

    # Collect all accused IDs that appear in our filtered incidents
    all_accused_ids = set()
    for accs in inc_to_accused.values():
        all_accused_ids.update(accs)

    if not all_accused_ids:
        return _empty_result()

    # ── 3. Load accused details ──
    accused_objs = db.query(Accused).filter(Accused.id.in_(list(all_accused_ids))).all()
    accused_map = {a.id: a for a in accused_objs}

    # ── 4. Build graph ──
    G = nx.Graph()

    # Add nodes
    for acc_id in all_accused_ids:
        G.add_node(acc_id)

    # Add edges: co-appearance in same incident
    edge_weights = defaultdict(int)
    for inc_id, acc_ids in inc_to_accused.items():
        if len(acc_ids) >= 2:
            for a, b in combinations(sorted(acc_ids), 2):
                edge_weights[(a, b)] += 1

    for (a, b), weight in edge_weights.items():
        if weight >= min_edge_weight:
            G.add_edge(a, b, weight=weight)

    # Remove isolated nodes (no edges) for cleaner visualization
    isolates = list(nx.isolates(G))
    # Keep isolates in the data but flag them
    isolated_set = set(isolates)

    # ── 5. Compute centrality metrics (on the connected portion) ──
    if G.number_of_edges() > 0:
        degree_cent = nx.degree_centrality(G)
        # For betweenness, limit to connected nodes to avoid errors
        betweenness_cent = nx.betweenness_centrality(G, weight="weight")
        try:
            pagerank = nx.pagerank(G, weight="weight", max_iter=200)
        except Exception:
            pagerank = {n: 1.0 / G.number_of_nodes() for n in G.nodes()}
    else:
        degree_cent = {n: 0.0 for n in G.nodes()}
        betweenness_cent = {n: 0.0 for n in G.nodes()}
        pagerank = {n: 0.0 for n in G.nodes()}

    # ── 6. Community detection ──
    communities = []
    node_community = {}

    # Only detect communities on connected subgraph
    connected_nodes = [n for n in G.nodes() if n not in isolated_set]
    if connected_nodes:
        subG = G.subgraph(connected_nodes).copy()
        if subG.number_of_edges() > 0:
            try:
                community_sets = list(nx.community.greedy_modularity_communities(subG))
            except Exception:
                # Fallback: connected components as communities
                community_sets = list(nx.connected_components(subG))

            for i, comm in enumerate(community_sets):
                for node in comm:
                    node_community[node] = i
        else:
            for n in connected_nodes:
                node_community[n] = 0

    # Assign isolates to community -1
    for n in isolated_set:
        node_community[n] = -1

    # ── 7. Compute percentile ranks for tag assignment ──
    degree_vals = sorted(degree_cent.values())
    between_vals = sorted(betweenness_cent.values())

    def percentile_rank(val, sorted_vals):
        if not sorted_vals or sorted_vals[-1] == sorted_vals[0]:
            return 0.5
        count_below = sum(1 for v in sorted_vals if v < val)
        return count_below / len(sorted_vals)

    # ── 8. Build node list ──
    nodes = []
    # Ward name lookup
    ward_objs = db.query(Ward).all()
    ward_name_map = {w.id: w.name for w in ward_objs}

    for acc_id in all_accused_ids:
        acc = accused_map.get(acc_id)
        if not acc:
            continue

        deg = degree_cent.get(acc_id, 0.0)
        bet = betweenness_cent.get(acc_id, 0.0)
        pr = pagerank.get(acc_id, 0.0)
        inc_count = accused_incident_count.get(acc_id, 0)
        comm_id = node_community.get(acc_id, -1)

        deg_rank = percentile_rank(deg, degree_vals)
        bet_rank = percentile_rank(bet, between_vals)

        tag = _assign_tag(deg_rank, bet_rank, inc_count)

        # Determine primary ward for this accused
        ward_list = list(accused_wards.get(acc_id, set()))
        primary_ward = ward_list[0] if ward_list else (None, None)
        primary_ward_name = ward_name_map.get(primary_ward[0], "Unknown") if primary_ward[0] else "Unknown"

        nodes.append({
            "id": acc_id,
            "name": acc.name,
            "alias": acc.alias,
            "age": acc.age,
            "gender": acc.gender,
            "tag": tag,
            "tag_description": TAG_DESCRIPTIONS.get(tag, ""),
            "incident_count": inc_count,
            "community_id": comm_id,
            "community_label": COMMUNITY_LABELS[comm_id % 26] if comm_id >= 0 else "Unlinked",
            "degree": round(deg, 4),
            "primary_ward": primary_ward_name,
            "is_isolated": acc_id in isolated_set,
        })

    # Sort nodes by degree descending
    nodes.sort(key=lambda n: n["degree"], reverse=True)

    # ── 9. Build edge list ──
    edges = []
    for a, b, data in G.edges(data=True):
        edges.append({
            "source": a,
            "target": b,
            "weight": data.get("weight", 1),
        })

    # ── 10. Build community summaries ──
    comm_members = defaultdict(list)
    for node in nodes:
        if node["community_id"] >= 0:
            comm_members[node["community_id"]].append(node)

    community_summaries = []
    for comm_id in sorted(comm_members.keys()):
        members = comm_members[comm_id]
        # Find most common ward
        ward_counts = defaultdict(int)
        for m in members:
            ward_counts[m["primary_ward"]] += 1
        top_ward = max(ward_counts, key=ward_counts.get) if ward_counts else "Unknown"

        label_letter = COMMUNITY_LABELS[comm_id % 26]
        community_summaries.append({
            "id": comm_id,
            "label": f"Group {label_letter}",
            "description": f"Group {label_letter} -- {len(members)} members, active in {top_ward}",
            "member_count": len(members),
            "top_ward": top_ward,
            "top_members": [{"id": m["id"], "name": m["name"], "tag": m["tag"]}
                           for m in sorted(members, key=lambda x: x["degree"], reverse=True)[:5]],
        })

    # Sort communities by size descending
    community_summaries.sort(key=lambda c: c["member_count"], reverse=True)

    # ── Summary stats ──
    tag_counts = defaultdict(int)
    for n in nodes:
        tag_counts[n["tag"]] += 1

    return {
        "summary": {
            "n_nodes": len(nodes),
            "n_edges": len(edges),
            "n_communities": len(community_summaries),
            "n_isolated": len(isolated_set),
            "tag_breakdown": dict(tag_counts),
        },
        "nodes": nodes,
        "edges": edges,
        "communities": community_summaries,
    }


def get_individual(db: Session, accused_id: int) -> dict | None:
    """
    Get detailed info for a single accused individual including their
    network connections and community membership.
    """
    acc = db.query(Accused).filter(Accused.id == accused_id).first()
    if not acc:
        return None

    # Get all incidents for this person
    stmt = select(incident_accused.c.incident_id).where(
        incident_accused.c.accused_id == accused_id
    )
    inc_links = db.execute(stmt).fetchall()
    inc_ids = {r[0] for r in inc_links}

    # Get co-accused from those incidents
    all_links = db.execute(
        select(incident_accused.c.incident_id, incident_accused.c.accused_id)
    ).fetchall()

    co_accused_counts = defaultdict(int)
    for inc_id, acc_id in all_links:
        if inc_id in inc_ids and acc_id != accused_id:
            co_accused_counts[acc_id] += 1

    # Load co-accused details
    co_ids = list(co_accused_counts.keys())
    co_accused_objs = db.query(Accused).filter(Accused.id.in_(co_ids)).all() if co_ids else []
    co_map = {a.id: a for a in co_accused_objs}

    connections = []
    for co_id, shared in sorted(co_accused_counts.items(), key=lambda x: x[1], reverse=True):
        co = co_map.get(co_id)
        if co:
            connections.append({
                "id": co.id,
                "name": co.name,
                "alias": co.alias,
                "shared_incidents": shared,
            })

    # Get incident details
    incidents_detail = []
    if inc_ids:
        incs = db.query(Incident).filter(Incident.id.in_(list(inc_ids))).all()
        for inc in incs:
            incidents_detail.append({
                "id": inc.id,
                "fir_number": inc.fir_number,
                "crime_type": inc.crime_type,
                "severity": inc.severity,
                "ward": inc.ward_rel.name if inc.ward_rel else None,
                "district": inc.district,
                "timestamp": inc.timestamp.isoformat(),
            })

    # Calculate RFS Score (Recency, Frequency, Severity)
    frequency = len(inc_ids)
    freq_score = min(100, frequency * 20)  # 5+ incidents = 100

    severity_avg = sum(inc.severity for inc in incs) / len(incs) if incs else 0
    sev_score = min(100, severity_avg * 10)  # 0-10 -> 0-100

    max_ts = max((inc.timestamp for inc in incs if inc.timestamp), default=None)
    if max_ts:
        # Base recency off Dec 31 2025 since seed data is in 2025
        anchor_date = datetime(2025, 12, 31)
        days_ago = max(0, (anchor_date - max_ts).days)
        rec_score = max(0.0, 100.0 - (days_ago / 3.65))
    else:
        rec_score = 0.0

    rfs_score = round((freq_score + sev_score + rec_score) / 3, 1)

    return {
        "id": acc.id,
        "name": acc.name,
        "alias": acc.alias,
        "age": acc.age,
        "gender": acc.gender,
        "incident_count": len(inc_ids),
        "connection_count": len(connections),
        "connections": connections[:20],  # Limit to top 20
        "incidents": incidents_detail,
        "rfs_score": rfs_score,
    }


def _empty_result():
    return {
        "summary": {"n_nodes": 0, "n_edges": 0, "n_communities": 0, "n_isolated": 0, "tag_breakdown": {}},
        "nodes": [],
        "edges": [],
        "communities": [],
    }
