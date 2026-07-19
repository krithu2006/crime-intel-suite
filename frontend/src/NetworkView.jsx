import { useState, useEffect, useRef, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

// A simple color palette for communities
const COMMUNITY_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
  '#84cc16', '#d946ef', '#0ea5e9', '#f43f5e', '#eab308'
];

function getCommunityColor(id) {
  if (id < 0) return '#475569'; // isolated/unlinked
  return COMMUNITY_COLORS[id % COMMUNITY_COLORS.length];
}

export function NetworkGraph({ network, loading, onNodeSelect }) {
  const fgRef = useRef();
  
  // Filtering and interaction states
  const [selectedWard, setSelectedWard] = useState('All');
  const [highlightedCommunity, setHighlightedCommunity] = useState(null);
  
  // Extract unique wards for dropdown
  const wards = ['All', ...new Set((network?.nodes || []).map(n => n.primary_ward).filter(Boolean))].sort();

  // Reset zoom/pan when data changes or layout stabilizes
  useEffect(() => {
    if (fgRef.current && network?.nodes?.length) {
      // Increase repulsion and link distance to spread clusters apart
      fgRef.current.d3Force('charge')?.strength(-400);
      fgRef.current.d3Force('link')?.distance(80);
      
      // Re-heat simulation to apply the new forces
      fgRef.current.d3ReheatSimulation();
      
      setTimeout(() => {
        fgRef.current.zoomToFit(400, 50);
      }, 800);
    }
  }, [network]);

  if (loading) {
    return (
      <div className="absolute inset-0 z-[1000] bg-surface-900/80 backdrop-blur-sm flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-primary-500/30 border-t-primary-400 rounded-full animate-spin"></div>
          <p className="text-sm text-slate-400">Loading network...</p>
        </div>
      </div>
    );
  }

  if (!network || !network.nodes || network.nodes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 bg-surface-900/50 border border-white/10 rounded-2xl">
        No network data available for this selection.
      </div>
    );
  }

  // Filter logic: top 50 by default, or all in a selected ward
  let filteredNodes = network.nodes;
  if (selectedWard !== 'All') {
    filteredNodes = filteredNodes.filter(n => n.primary_ward === selectedWard);
  } else {
    // Default to top 50 most central
    filteredNodes = filteredNodes.slice(0, 50);
  }
  
  const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
  const filteredLinks = network.edges.filter(e => 
    filteredNodeIds.has(e.source.id || e.source) && filteredNodeIds.has(e.target.id || e.target)
  );

  const graphData = {
    nodes: filteredNodes.map(n => ({ ...n, val: Math.max(1, n.degree * 50) })),
    links: filteredLinks.map(e => ({ 
      source: e.source.id ?? e.source, 
      target: e.target.id ?? e.target, 
      weight: e.weight 
    }))
  };

  const drawNode = useCallback((node, ctx, globalScale) => {
    // Dim if a community is highlighted and this node isn't in it
    const isFaded = highlightedCommunity !== null && node.community_id !== highlightedCommunity;
    const baseColor = getCommunityColor(node.community_id);
    ctx.fillStyle = isFaded ? `${baseColor}22` : baseColor;
    
    ctx.beginPath();
    // Use node.val for area sizing mapping
    const radius = Math.sqrt(node.val) * 2;
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
    ctx.fill();

    // Only draw text labels for important nodes, and if not faded out
    if (!isFaded && (node.tag === 'Central Figure' || node.tag === 'Connector')) {
      const fontSize = 10 / globalScale;
      ctx.font = `${fontSize}px Sans-Serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillText(node.name, node.x, node.y + radius + (4 / globalScale));
    }
  }, [highlightedCommunity]);

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden border border-white/10 bg-surface-900">
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        nodeRelSize={4}
        nodeCanvasObject={drawNode}
        nodePointerAreaPaint={(node, color, ctx) => {
          ctx.fillStyle = color;
          const radius = Math.sqrt(node.val) * 2;
          ctx.beginPath(); ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false); ctx.fill();
        }}
        linkColor={(link) => {
          const s = typeof link.source === 'object' ? link.source : network.nodes.find(n => n.id === link.source);
          const t = typeof link.target === 'object' ? link.target : network.nodes.find(n => n.id === link.target);
          if (highlightedCommunity !== null) {
            if (s?.community_id === highlightedCommunity && t?.community_id === highlightedCommunity) {
              return 'rgba(255,255,255,0.4)';
            }
            return 'rgba(255,255,255,0.02)'; // Fade out
          }
          return 'rgba(255,255,255,0.15)';
        }}
        linkWidth={link => Math.min(3, Math.max(0.5, link.weight * 0.5))}
        onNodeClick={node => onNodeSelect(node.id)}
        cooldownTicks={100}
        onEngineStop={() => fgRef.current?.zoomToFit(400, 50)}
      />
      
      {/* Filters (Top Left) */}
      <div className="absolute top-4 left-4 z-[1000] glass-card px-4 py-3 pointer-events-auto flex items-center gap-3">
        <label className="text-xs font-semibold text-slate-300">Ward Filter</label>
        <select 
          className="bg-surface-800 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-primary-400"
          value={selectedWard}
          onChange={e => { setSelectedWard(e.target.value); setHighlightedCommunity(null); }}
        >
          {wards.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        {selectedWard === 'All' && (
          <span className="text-[10px] text-amber-400 border border-amber-400/20 bg-amber-400/10 px-1.5 py-0.5 rounded">
            Showing Top 50 Only
          </span>
        )}
      </div>
      
      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-[1000] glass-card px-4 py-3 pointer-events-auto">
        <p className="text-xs font-semibold text-slate-300 mb-1">Network Legend (Click to filter)</p>
        <p className="text-[10px] text-slate-500 mb-2">Node size = centrality</p>
        <div className="flex flex-col gap-1 text-[10px] max-h-32 overflow-y-auto pr-2">
          {network.communities.map(c => (
            <button 
              key={c.id} 
              onClick={() => setHighlightedCommunity(highlightedCommunity === c.id ? null : c.id)}
              className={`flex items-center gap-1.5 text-left px-1.5 py-1 rounded transition-colors ${
                highlightedCommunity === c.id ? 'bg-white/10 text-white font-medium' : 'hover:bg-white/5 text-slate-400'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getCommunityColor(c.id) }}></span>
              <span className="truncate">{c.label} ({c.member_count})</span>
            </button>
          ))}
        </div>
      </div>
      
      {/* Summary */}
      <div className="absolute top-4 right-4 z-[1000] glass-card px-4 py-3 pointer-events-none text-right">
        <p className="text-xs font-semibold text-slate-300">
          Showing {filteredNodes.length} Individuals
        </p>
        <p className="text-[10px] text-slate-500">
          {filteredLinks.length} connections
        </p>
        {selectedWard !== 'All' && (
          <p className="text-[10px] text-primary-400 mt-1">Filtered to {selectedWard}</p>
        )}
      </div>
    </div>
  );
}

export function NetworkSidebar({ selectedNodeId, network, onClear }) {
  const [person, setPerson] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedNodeId) {
      setPerson(null);
      return;
    }
    setLoading(true);
    fetch(`/api/network/individual/${selectedNodeId}`)
      .then(r => r.json())
      .then(data => {
        setPerson(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedNodeId]);

  if (!selectedNodeId && !person) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
        <svg className="w-12 h-12 mb-4 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
        </svg>
        <p className="text-sm font-medium text-slate-400">Select an individual</p>
        <p className="text-xs mt-2">Click a node on the graph to view their network profile and criminal history.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary-500/30 border-t-primary-400 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!person) return null;

  // Find the node in the overall network to get their tag and community
  const nodeInfo = network?.nodes?.find(n => n.id === selectedNodeId) || {};
  const commInfo = network?.communities?.find(c => c.id === nodeInfo.community_id);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white">{person.name}</h3>
          {person.alias && <p className="text-xs text-slate-400">Alias: {person.alias}</p>}
        </div>
        <button onClick={onClear} className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-4">
        {/* Profile Card */}
        <div className="glass-card p-4 rounded-xl border border-white/5 bg-white/[0.02]">
          {person.rfs_score !== undefined && (
            <div className="mb-4 p-3 rounded-lg bg-surface-900/50 border border-white/10 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Concern Level</p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {person.rfs_score >= 75 ? 'High concern — frequent, severe, and recent incidents' 
                   : person.rfs_score >= 40 ? 'Moderate concern — active associate'
                   : 'Low concern — infrequent or older incidents'}
                </p>
              </div>
              <div className={`text-2xl font-bold ${
                person.rfs_score >= 75 ? 'text-red-400' 
                : person.rfs_score >= 40 ? 'text-orange-400' 
                : 'text-emerald-400'
              }`}>
                {person.rfs_score}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className={`px-2 py-1 rounded text-[10px] font-bold tracking-wide uppercase
              ${nodeInfo.tag === 'Central Figure' ? 'bg-red-500/20 text-red-300 border border-red-500/20' 
              : nodeInfo.tag === 'Connector' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/20'
              : 'bg-primary-500/20 text-primary-300 border border-primary-500/20'}`}>
              {nodeInfo.tag || 'Associate'}
            </span>
            {commInfo && (
              <span className="px-2 py-1 rounded text-[10px] font-medium bg-white/5 text-slate-300 border border-white/10 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{backgroundColor: getCommunityColor(commInfo.id)}}></span>
                {commInfo.label}
              </span>
            )}
          </div>
          
          <p className="text-xs text-slate-400 mb-2">{nodeInfo.tag_description}</p>
          
          <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
            <div className="bg-surface-800 p-2 rounded-lg text-center">
              <p className="text-slate-500">Age / Gender</p>
              <p className="text-slate-300 font-medium">{person.age || '?'} / {person.gender?.[0] || '?'}</p>
            </div>
            <div className="bg-surface-800 p-2 rounded-lg text-center">
              <p className="text-slate-500">Total Incidents</p>
              <p className="text-slate-300 font-medium">{person.incident_count}</p>
            </div>
          </div>
        </div>

        {/* Connections List */}
        <div>
          <h4 className="text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">Top Connections ({person.connection_count})</h4>
          <div className="space-y-1">
            {person.connections?.slice(0, 5).map(c => (
              <div key={c.id} className="flex justify-between items-center text-xs p-2 rounded bg-white/[0.02] border border-white/5">
                <span className="text-slate-300 truncate pr-2">{c.name}</span>
                <span className="text-slate-500 whitespace-nowrap bg-surface-800 px-1.5 py-0.5 rounded text-[10px]">
                  {c.shared_incidents} shared
                </span>
              </div>
            ))}
            {(person.connections?.length > 5) && (
              <p className="text-center text-[10px] text-slate-500 pt-1">+{person.connections.length - 5} more</p>
            )}
            {person.connections?.length === 0 && (
              <p className="text-xs text-slate-500 italic">No co-accused recorded.</p>
            )}
          </div>
        </div>

        {/* Incident History */}
        <div>
          <h4 className="text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">Incident History</h4>
          <div className="space-y-2 border-l-2 border-white/10 pl-3 ml-1">
            {person.incidents?.map(inc => (
              <div key={inc.id} className="relative">
                <div className="absolute w-2 h-2 rounded-full bg-white/20 -left-[17px] top-1.5 border border-surface-900"></div>
                <p className="text-xs font-medium text-slate-300">{inc.crime_type}</p>
                <div className="flex justify-between items-center mt-0.5">
                  <p className="text-[10px] text-slate-500">{inc.ward || inc.district}</p>
                  <p className="text-[10px] font-mono text-slate-600">{new Date(inc.timestamp).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
