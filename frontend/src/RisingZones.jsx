/**
 * RisingZones — Panel listing wards currently flagged as trending up,
 * sorted by escalation score. Shows a time-series sparkline per ward.
 */

export default function RisingZones({ escalation, loading }) {
  if (loading) {
    return (
      <div className="glass-card p-6 h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-accent-amber/30 border-t-accent-amber rounded-full animate-spin"></div>
          <p className="text-sm text-slate-400">Analyzing escalation patterns...</p>
        </div>
      </div>
    );
  }

  if (!escalation || !escalation.wards) {
    return (
      <div className="glass-card p-6 text-center text-slate-500">
        No escalation data available.
      </div>
    );
  }

  const flaggedWards = escalation.wards.filter((w) => w.trending_up);
  const safeWards = escalation.wards.filter((w) => !w.trending_up);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
            Rising Zones
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Minor-crime escalation detection ({escalation.period})
          </p>
        </div>
        <div className="badge bg-rose-500/20 text-rose-300 border border-rose-500/30">
          {flaggedWards.length} flagged
        </div>
      </div>

      {/* Flagged wards list */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
        {flaggedWards.length === 0 ? (
          <div className="glass-card p-4 text-center text-emerald-400 text-sm">
            No wards currently showing abnormal escalation.
          </div>
        ) : (
          flaggedWards.map((ward) => (
            <WardCard key={ward.ward_id} ward={ward} flagged={true} />
          ))
        )}

        {/* Separator */}
        {safeWards.length > 0 && (
          <>
            <div className="flex items-center gap-2 pt-3 pb-1">
              <div className="h-px flex-1 bg-white/10"></div>
              <span className="text-xs text-slate-600 font-medium">Normal</span>
              <div className="h-px flex-1 bg-white/10"></div>
            </div>
            {safeWards.slice(0, 8).map((ward) => (
              <WardCard key={ward.ward_id} ward={ward} flagged={false} />
            ))}
            {safeWards.length > 8 && (
              <p className="text-xs text-slate-600 text-center pt-1">
                + {safeWards.length - 8} more wards
              </p>
            )}
          </>
        )}
      </div>

      {/* Minor crime types info */}
      <div className="text-xs text-slate-600 border-t border-white/5 pt-2">
        Tracking: {escalation.minor_crime_types?.join(', ')}
      </div>
    </div>
  );
}

function WardCard({ ward, flagged }) {
  const ts = ward.time_series || [];
  const maxCount = Math.max(...ts.map((t) => t.count), 1);

  return (
    <div
      className={`ward-card-hover rounded-xl border p-3 ${
        flagged
          ? 'bg-rose-500/5 border-rose-500/20'
          : 'bg-white/[0.02] border-white/5'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white truncate">{ward.ward_name}</p>
            {flagged && (
              <svg className="w-4 h-4 text-rose-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-1.945-1.164c-.143-.226-.426-.347-.677-.247-.25.1-.399.366-.327.623.25.89.693 1.693 1.232 2.365.539.672 1.209 1.236 1.93 1.607C9.667 14.485 11 14.836 12 14.836c2 0 3.5-1.5 4-3 .5-1.5.5-3-1-5-1-1.333-1.833-2.667-2.605-4.283z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          <p className="text-xs text-slate-500">{ward.district}</p>
        </div>

        <div className="text-right flex-shrink-0">
          <p
            className={`text-lg font-bold tabular-nums ${
              flagged
                ? ward.escalation_score >= 3
                  ? 'text-rose-400'
                  : 'text-amber-400'
                : 'text-slate-400'
            }`}
          >
            {ward.escalation_score > 0 ? '+' : ''}{ward.escalation_score.toFixed(1)}
          </p>
          <p className="text-[10px] text-slate-600">z-score</p>
        </div>
      </div>

      {/* Sparkline */}
      {ts.length > 0 && (
        <div className="mt-2 flex items-end gap-px h-6">
          {ts.map((t, i) => {
            const height = Math.max(2, (t.count / maxCount) * 24);
            const isLast = i === ts.length - 1;
            return (
              <div
                key={i}
                className="flex-1 rounded-t-sm transition-all"
                style={{
                  height: `${height}px`,
                  backgroundColor: isLast && flagged
                    ? '#f43f5e'
                    : isLast
                    ? '#94a3b8'
                    : flagged
                    ? 'rgba(244, 63, 94, 0.25)'
                    : 'rgba(148, 163, 184, 0.15)',
                }}
                title={`${t.period}: ${t.count} incidents`}
              />
            );
          })}
        </div>
      )}

      {/* Stats row */}
      <div className="mt-1.5 flex items-center gap-3 text-[10px] text-slate-500">
        <span>Latest: <span className="text-slate-300">{ward.latest_count}</span></span>
        <span>Avg: <span className="text-slate-300">{ward.rolling_mean ?? '—'}</span></span>
        <span>{ward.latest_period}</span>
      </div>
    </div>
  );
}
