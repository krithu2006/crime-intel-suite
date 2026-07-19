import { useState, useEffect, useCallback } from 'react';
import HotspotMap from './HotspotMap.jsx';
import RiskScoreMap from './RiskScoreMap.jsx';
import RisingZones from './RisingZones.jsx';
import { NetworkGraph, NetworkSidebar } from './NetworkView.jsx';

function App() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // Module 2 state
  const [hotspots, setHotspots] = useState(null);
  const [hotspotsLoading, setHotspotsLoading] = useState(false);
  const [escalation, setEscalation] = useState(null);
  const [escalationLoading, setEscalationLoading] = useState(false);

  // Module 3 state
  const [riskScores, setRiskScores] = useState(null);
  const [riskLoading, setRiskLoading] = useState(false);

  // Module 4 state
  const [network, setNetwork] = useState(null);
  const [networkLoading, setNetworkLoading] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  // View toggle: 'hotspots', 'risk', or 'network'
  const [mapView, setMapView] = useState('hotspots');

  // Date range
  const [dateFrom, setDateFrom] = useState('2025-01-01');
  const [dateTo, setDateTo] = useState('2025-12-31');

  // District filter
  const [districtsList, setDistrictsList] = useState([]);
  const [selectedDistrict, setSelectedDistrict] = useState('');

  // ── Fetch health ──
  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setHealth(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // ── Fetch districts ──
  useEffect(() => {
    fetch('/api/districts')
      .then((res) => { if (res.ok) return res.json(); })
      .then((data) => { if (data?.data) setDistrictsList(data.data); })
      .catch(console.error);
  }, []);

  // ── Fetch hotspots ──
  const fetchHotspots = useCallback(() => {
    setHotspotsLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    if (selectedDistrict) params.set('district', selectedDistrict);
    fetch(`/api/hotspots?${params}`)
      .then((res) => res.json())
      .then((data) => { setHotspots(data); setHotspotsLoading(false); })
      .catch(() => setHotspotsLoading(false));
  }, [dateFrom, dateTo, selectedDistrict]);

  // ── Fetch escalation ──
  const fetchEscalation = useCallback(() => {
    setEscalationLoading(true);
    fetch('/api/escalation?period=monthly')
      .then((res) => res.json())
      .then((data) => { setEscalation(data); setEscalationLoading(false); })
      .catch(() => setEscalationLoading(false));
  }, []);

  // ── Fetch risk scores ──
  const fetchRiskScores = useCallback(() => {
    setRiskLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    if (selectedDistrict) params.set('district', selectedDistrict);
    fetch(`/api/risk-scores?${params}`)
      .then((res) => res.json())
      .then((data) => { setRiskScores(data); setRiskLoading(false); })
      .catch(() => setRiskLoading(false));
  }, [dateFrom, dateTo, selectedDistrict]);

  // ── Fetch network ──
  const fetchNetwork = useCallback(() => {
    setNetworkLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    if (selectedDistrict) params.set('district', selectedDistrict);
    fetch(`/api/network?${params}`)
      .then((res) => res.json())
      .then((data) => { setNetwork(data); setNetworkLoading(false); })
      .catch(() => setNetworkLoading(false));
  }, [dateFrom, dateTo, selectedDistrict]);

  // Auto-fetch on load
  useEffect(() => {
    if (health && !error) {
      fetchHotspots();
      fetchEscalation();
      fetchRiskScores();
      fetchNetwork();
    }
  }, [health, error, fetchHotspots, fetchEscalation, fetchRiskScores, fetchNetwork]);

  // Determine side panel content based on map view
  let sidePanel = null;
  if (mapView === 'hotspots') {
    sidePanel = <RisingZones escalation={escalation} loading={escalationLoading} />;
  } else if (mapView === 'risk') {
    sidePanel = <RiskRankings riskScores={riskScores} loading={riskLoading} />;
  } else if (mapView === 'network') {
    sidePanel = <NetworkSidebar selectedNodeId={selectedNodeId} network={network} onClear={() => setSelectedNodeId(null)} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ── */}
      <header className="border-b border-white/10 bg-surface-800/60 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-cyan flex items-center justify-center shadow-glow flex-shrink-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight gradient-text truncate">Crime Intel Suite</h1>
              <p className="text-[10px] sm:text-xs text-slate-500 font-medium truncate">Karnataka State Police — Intelligence Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {loading ? (
              <span className="badge bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
                <span className="hidden sm:inline">Connecting...</span>
              </span>
            ) : error ? (
              <span className="badge bg-rose-500/20 text-rose-300 border border-rose-500/30">
                <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                Offline
              </span>
            ) : (
              <span className="badge bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-slow"></span>
                <span className="hidden sm:inline">Backend</span> Online
              </span>
            )}
            <span className="badge bg-amber-500/10 text-amber-300 border border-amber-500/20">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              <span className="hidden sm:inline">Synthetic</span> Demo Data
            </span>
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 max-w-[1600px] mx-auto px-6 py-6 w-full">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-primary-500/30 border-t-primary-400 rounded-full animate-spin"></div>
              <p className="text-slate-400 text-sm">Connecting to backend...</p>
            </div>
          </div>
        ) : error ? (
          <div className="glass-card p-8 text-center max-w-lg mx-auto animate-fade-in">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-rose-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Backend Unreachable</h2>
            <p className="text-slate-400 mb-4">
              Could not connect to the API server. Make sure the backend is running on <code className="font-mono text-primary-400">localhost:8000</code>.
            </p>
            <p className="text-sm text-slate-500 font-mono">Error: {error}</p>
          </div>
        ) : (
          <div className="animate-fade-in space-y-6">
            {/* ── Stats Row ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard icon="🚨" label="Incidents" value={health.incidents?.toLocaleString() ?? '—'}
                color="from-primary-500/20 to-primary-600/10" borderColor="border-primary-500/20" />
              <StatCard icon="👤" label="Accused" value={health.accused?.toLocaleString() ?? '—'}
                color="from-accent-cyan/20 to-accent-cyan/5" borderColor="border-cyan-500/20" />
              <StatCard icon="📍" label="Wards" value={health.wards?.toLocaleString() ?? '—'}
                color="from-accent-emerald/20 to-accent-emerald/5" borderColor="border-emerald-500/20" />
              <StatCard
                icon={mapView === 'risk' ? '🎯' : mapView === 'network' ? '🕸️' : '🔥'}
                label={mapView === 'risk' ? 'High-Risk Wards' : mapView === 'network' ? 'Identified Groups' : 'Hotspot Clusters'}
                value={mapView === 'risk'
                  ? (riskScores?.wards?.filter(w => w.risk_score >= 50).length?.toString() ?? '—')
                  : mapView === 'network'
                  ? (network?.summary?.n_communities?.toLocaleString() ?? '—')
                  : (hotspots?.n_clusters?.toLocaleString() ?? '—')}
                color="from-accent-rose/20 to-accent-rose/5" borderColor="border-rose-500/20"
              />
            </div>

            {/* ── Controls Bar ── */}
            <div className="glass-card px-5 py-3 flex flex-wrap items-center gap-4">
              {/* View Toggle */}
              <div className="flex rounded-lg border border-white/10 overflow-hidden">
                <button
                  onClick={() => setMapView('hotspots')}
                  className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                    mapView === 'hotspots'
                      ? 'bg-primary-600 text-white'
                      : 'bg-transparent text-slate-400 hover:text-slate-300 hover:bg-white/5'
                  }`}
                >
                  Hotspot View
                </button>
                <button
                  onClick={() => setMapView('risk')}
                  className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                    mapView === 'risk'
                      ? 'bg-primary-600 text-white'
                      : 'bg-transparent text-slate-400 hover:text-slate-300 hover:bg-white/5'
                  }`}
                >
                  Risk Score View
                </button>
                <button
                  onClick={() => setMapView('network')}
                  className={`px-4 py-1.5 text-sm font-medium transition-colors border-l border-white/10 ${
                    mapView === 'network'
                      ? 'bg-primary-600 text-white'
                      : 'bg-transparent text-slate-400 hover:text-slate-300 hover:bg-white/5'
                  }`}
                >
                  Network View
                </button>
              </div>

              {/* District Filter (always visible) */}
              <div className="flex items-center gap-2 border-l border-white/10 pl-4">
                <label className="text-xs text-slate-500">District</label>
                <select 
                  value={selectedDistrict} 
                  onChange={(e) => setSelectedDistrict(e.target.value)}
                  className="bg-surface-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-primary-400 focus:ring-1 focus:ring-primary-400/30 outline-none"
                >
                  <option value="">All Districts</option>
                  {districtsList.map(d => (
                    <option key={d.id} value={d.district}>{d.district}</option>
                  ))}
                </select>
              </div>

              {/* Date range (only for hotspot/network view) */}
              {(mapView === 'hotspots' || mapView === 'network') && (
                <>
                  <div className="flex items-center gap-2 border-l border-white/10 pl-4">
                    <label className="text-xs text-slate-500">From</label>
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                      className="bg-surface-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-primary-400 focus:ring-1 focus:ring-primary-400/30 outline-none" />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500">To</label>
                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                      className="bg-surface-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-primary-400 focus:ring-1 focus:ring-primary-400/30 outline-none" />
                  </div>
                  <button onClick={() => { fetchHotspots(); fetchNetwork(); fetchRiskScores(); }} disabled={hotspotsLoading || networkLoading || riskLoading}
                    className="px-4 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {hotspotsLoading || networkLoading || riskLoading ? 'Computing...' : 'Update'}
                  </button>
                </>
              )}

              {/* Risk score info tooltip */}
              {mapView === 'risk' && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <svg className="w-4 h-4 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>
                    Risk Score (0-100) predicts how likely a ward is to see elevated crime based on incident history,
                    offender presence, socio-economic factors, and escalation trends. Click a ward for details.
                  </span>
                </div>
              )}

              {/* Network info tooltip */}
              {mapView === 'network' && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <svg className="w-4 h-4 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>
                    Offender Network reveals co-appearance patterns. Node size indicates centrality (influence); colors represent distinct communities (likely organized groups).
                  </span>
                </div>
              )}

              {/* Data provenance note — always visible across all views */}
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 italic">
                <svg className="w-3.5 h-3.5 text-amber-500/60 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                This prototype uses synthetic data modeled on realistic Karnataka crime patterns. In production, this would integrate with CCTNS and existing e-FIR systems.
              </div>

              {/* Quick range buttons */}
              <div className="flex gap-1 ml-auto">
                {[
                  { label: 'Q1', from: '2025-01-01', to: '2025-03-31' },
                  { label: 'Q2', from: '2025-04-01', to: '2025-06-30' },
                  { label: 'Q3', from: '2025-07-01', to: '2025-09-30' },
                  { label: 'Q4', from: '2025-10-01', to: '2025-12-31' },
                  { label: 'H1', from: '2025-01-01', to: '2025-06-30' },
                  { label: 'H2', from: '2025-07-01', to: '2025-12-31' },
                  { label: 'All', from: '2025-01-01', to: '2025-12-31' },
                ].map(({ label, from, to }) => (
                  <button key={label}
                    onClick={() => { setDateFrom(from); setDateTo(to); }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      dateFrom === from && dateTo === to
                        ? 'bg-primary-500/30 text-primary-300 border border-primary-500/30'
                        : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-300 border border-transparent'
                    }`}
                  >{label}</button>
                ))}
              </div>
            </div>

            {/* ── District Summary Card ── */}
            {selectedDistrict && districtsList.find(d => d.district === selectedDistrict) && (() => {
              const dInfo = districtsList.find(d => d.district === selectedDistrict);
              const dWards = riskScores?.wards || [];
              const highWards = dWards.filter(w => w.risk_score >= 50).length;
              const avgRisk = dWards.length > 0 ? (dWards.reduce((sum, w) => sum + w.risk_score, 0) / dWards.length).toFixed(1) : '—';
              
              return (
                <div className="glass-card p-4 rounded-xl mb-6 bg-primary-900/20 border-primary-500/20 flex flex-wrap items-center justify-between gap-4 view-transition">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <svg className="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {selectedDistrict} District Summary
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">Viewing aggregated stats for the selected district.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-6">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Avg Risk</p>
                      <p className="text-lg font-bold text-orange-400">{avgRisk}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">High-Risk Wards</p>
                      <p className="text-lg font-bold text-red-400">{highWards}</p>
                    </div>
                    <div className="border-l border-white/10 pl-6 hidden sm:block">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Socio-Economic</p>
                      <p className="text-xs text-slate-300 mt-1">
                        Unemployment: {dInfo.unemployment_rate}% &middot; Literacy: {dInfo.literacy_rate}% &middot; Density: {dInfo.population_density}/km²
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── Map + Side Panel (with view transition) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" style={{ height: '600px' }}>
              {/* Map/Graph takes 2/3 */}
              <div className="lg:col-span-2 h-full view-transition">
                {mapView === 'hotspots'
                  ? <HotspotMap hotspots={hotspots} loading={hotspotsLoading} />
                  : mapView === 'risk'
                  ? <RiskScoreMap riskScores={riskScores} loading={riskLoading} />
                  : <NetworkGraph network={network} loading={networkLoading} onNodeSelect={setSelectedNodeId} />
                }
              </div>

              {/* Side panel takes 1/3 — consistent padding/rounding */}
              <div className="h-full overflow-hidden glass-card p-4 sm:p-5 view-transition">
                {sidePanel}
              </div>
            </div>

            {/* ── Date Range Info ── */}
            {health.date_range && (
              <div className="text-center text-xs text-slate-600">
                Dataset: {formatDate(health.date_range.from)} &mdash; {formatDate(health.date_range.to)}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-4 text-center text-xs text-slate-600">
        Crime Intel Suite v0.4 — Karnataka State Police Datathon
      </footer>
    </div>
  );
}

// ── Risk Rankings side panel (shown when Risk Score View is active) ──
function RiskRankings({ riskScores, loading }) {
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-amber-500/30 border-t-amber-400 rounded-full animate-spin"></div>
          <p className="text-sm text-slate-400">Computing risk scores...</p>
        </div>
      </div>
    );
  }

  if (!riskScores?.wards) return <div className="text-slate-500 text-sm text-center">No data</div>;

  const wards = riskScores.wards;

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            Risk Rankings
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Ward-level predictive risk scores (0-100)
          </p>
        </div>
        <div className="badge bg-amber-500/20 text-amber-300 border border-amber-500/30">
          {wards.filter(w => w.risk_score >= 50).length} high-risk
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
        {wards.length === 0 ? (
          <div className="glass-card p-4 text-center text-slate-500 text-sm">
            No risk data available for this selection.
          </div>
        ) : (
          wards.map((ward) => (
            <RiskWardCard key={ward.ward_id} ward={ward} />
          ))
        )}
      </div>

      <div className="text-xs text-slate-600 border-t border-white/5 pt-2">
        Powered by XGBoost + SHAP explainability
      </div>
    </div>
  );
}

function RiskWardCard({ ward }) {
  const scoreColor = ward.risk_score >= 75 ? 'text-red-400'
    : ward.risk_score >= 50 ? 'text-orange-400'
    : ward.risk_score >= 25 ? 'text-yellow-400'
    : 'text-emerald-400';

  const bgColor = ward.risk_score >= 75 ? 'bg-red-500/5 border-red-500/20'
    : ward.risk_score >= 50 ? 'bg-orange-500/5 border-orange-500/15'
    : 'bg-white/[0.02] border-white/5';

  const levelLabel = ward.risk_level === 'critical' ? 'CRITICAL'
    : ward.risk_level === 'high' ? 'HIGH'
    : ward.risk_level === 'moderate' ? 'MOD'
    : 'LOW';

  return (
    <div className={`ward-card-hover rounded-xl border p-3 ${bgColor}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white truncate">{ward.ward_name}</p>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
              ward.risk_score >= 75 ? 'bg-red-500/20 text-red-300'
              : ward.risk_score >= 50 ? 'bg-orange-500/20 text-orange-300'
              : ward.risk_score >= 25 ? 'bg-yellow-500/20 text-yellow-300'
              : 'bg-emerald-500/20 text-emerald-300'
            }`}>{levelLabel}</span>
          </div>
          <p className="text-xs text-slate-500">{ward.district}</p>
        </div>
        <p className={`text-2xl font-bold tabular-nums ${scoreColor}`}>
          {Math.round(ward.risk_score)}
        </p>
      </div>

      {/* Explanation */}
      <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed line-clamp-2">
        {ward.explanation}
      </p>

      {/* Top factors as compact tags */}
      {ward.top_factors && (
        <div className="flex flex-wrap gap-1 mt-2">
          {ward.top_factors.map((f, i) => (
            <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
              f.direction === 'up'
                ? 'bg-red-500/10 text-red-300 border border-red-500/20'
                : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
            }`}>
              {f.direction === 'up' ? '↑' : '↓'} {f.description}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color, borderColor }) {
  return (
    <div className={`glass-card-hover p-4 ${borderColor} animate-slide-up`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-xl`}>
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p>
        </div>
      </div>
    </div>
  );
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default App;
