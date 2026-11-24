import React, { useMemo, useState } from 'react';
import { MonthlyHeatBalance } from '../services/EnergyApiService';

const POS_COMPONENTS = [
  { key: 'heating',           label: 'Heating',         color: '#7c2d12' },
  { key: 'solar',             label: 'Solar (windows)', color: '#fde047' },
  { key: 'equipment',         label: 'Equipment',       color: '#ef4444' },
  { key: 'lighting',          label: 'Lighting',        color: '#f97316' },
  { key: 'people',            label: 'People',          color: '#fbbf24' },
  { key: 'infiltration_gain', label: 'Infiltration +',  color: '#6ee7b7' },
] as const;

const NEG_COMPONENTS = [
  { key: 'cooling',           label: 'Cooling',         color: '#1d4ed8' },
  { key: 'infiltration_loss', label: 'Infiltration −',  color: '#93c5fd' },
] as const;

const ALL_COMPONENTS = [...POS_COMPONENTS, ...NEG_COMPONENTS];

interface Props { data: MonthlyHeatBalance }

export const MonthlyHeatBalanceChart: React.FC<Props> = ({ data }) => {
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

  const MONTHS = data.months ?? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const n = MONTHS.length;

  // SVG layout
  const W = 560, H = 280;
  const ml = 50, mr = 16, mt = 16, mb = 76;
  const pw = W - ml - mr;
  const ph = H - mt - mb;

  const get = (key: string, i: number): number => {
    const arr = (data as unknown as Record<string, number[]>)[key];
    return arr ? (arr[i] ?? 0) : 0;
  };

  const monthData = useMemo(() => MONTHS.map((_, mi) => {
    let posTop = 0;
    const posSegs: { key: string; label: string; color: string; from: number; to: number; value: number }[] = [];
    for (const c of POS_COMPONENTS) {
      const v = get(c.key, mi);
      if (v > 0.0001) {
        posSegs.push({ ...c, from: posTop, to: posTop + v, value: v });
        posTop += v;
      }
    }
    let negBot = 0;
    const negSegs: { key: string; label: string; color: string; from: number; to: number; value: number }[] = [];
    for (const c of NEG_COMPONENTS) {
      const v = get(c.key, mi);
      if (v > 0.0001) {
        negSegs.push({ ...c, from: negBot, to: negBot - v, value: v });
        negBot -= v;
      }
    }
    return { posSegs, negSegs, posTop, negBot };
  }), [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxPos = Math.max(0.5, ...monthData.map(d => d.posTop));
  const minNeg = Math.min(-0.5, ...monthData.map(d => d.negBot));
  const span = maxPos - minNeg;

  const rawStep = span / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const tickStep = mag * ([1, 2, 5, 10].find(x => x * mag >= rawStep) ?? 10);
  const yMax = Math.ceil(maxPos / tickStep) * tickStep;
  const yMin = Math.floor(minNeg / tickStep) * tickStep;

  const yScale = (v: number) => mt + ph * (1 - (v - yMin) / (yMax - yMin));
  const colW = pw / n;
  const barW = colW * 0.62;
  const cx = (i: number) => ml + (i + 0.5) * colW;

  const ticks: number[] = [];
  for (let t = yMin; t <= yMax + tickStep * 0.01; t = parseFloat((t + tickStep).toFixed(10)))
    ticks.push(parseFloat(t.toFixed(6)));

  const visibleComponents = ALL_COMPONENTS.filter(
    c => MONTHS.some((_, mi) => get(c.key, mi) > 0.001)
  );

  // Build tooltip content + position for hovered month
  const tooltipWidth = 162;
  const tooltip = useMemo(() => {
    if (hoveredMonth === null) return null;
    const d = monthData[hoveredMonth];
    const rows = [
      ...d.posSegs.map(s => ({ label: s.label, color: s.color, value: s.value })),
      ...d.negSegs.map(s => ({ label: s.label, color: s.color, value: s.value })),
    ];
    const tooltipH = 22 + rows.length * 17;
    // Prefer above the tallest stack; clamp to SVG bounds
    const ty = Math.max(mt + 2,
      Math.min(yScale(d.posTop) - tooltipH - 8, H - mb - tooltipH - 2));
    let tx = cx(hoveredMonth) - tooltipWidth / 2;
    tx = Math.max(ml, Math.min(W - mr - tooltipWidth, tx));
    return { tx, ty, tooltipH, rows };
  }, [hoveredMonth, monthData]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="w-full select-none">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ overflow: 'visible' }}>

        {/* Grid + Y-axis */}
        {ticks.map(t => {
          const y = yScale(t);
          const isZero = Math.abs(t) < 0.001;
          return (
            <g key={t}>
              <line x1={ml} x2={W - mr} y1={y} y2={y}
                stroke={isZero ? '#4b5563' : '#1e293b'}
                strokeWidth={isZero ? 1 : 0.5} />
              <text x={ml - 5} y={y + 3.5} textAnchor="end" fontSize={9} fill="#9ca3af">
                {Math.abs(t) < 0.05 ? '0' : t.toFixed(t < 10 && t > -10 ? 1 : 0)}
              </text>
            </g>
          );
        })}
        <text transform={`translate(11,${mt + ph / 2}) rotate(-90)`}
          textAnchor="middle" fontSize={9} fill="#6b7280">kWh/m²</text>

        {/* Bars */}
        {monthData.map((d, mi) => {
          const hovered = hoveredMonth === mi;
          return (
            <g key={mi}>
              {hovered && (
                <rect x={ml + mi * colW + 1} y={mt} width={colW - 2} height={ph}
                  fill="white" fillOpacity={0.05} rx={2} />
              )}
              {d.posSegs.map(s => {
                const y1 = yScale(s.to), y2 = yScale(s.from);
                const h = Math.max(0, y2 - y1);
                return h > 0.5 ? (
                  <rect key={s.key} x={cx(mi) - barW / 2} y={y1} width={barW} height={h}
                    fill={s.color} opacity={hovered ? 1 : 0.85} />
                ) : null;
              })}
              {d.negSegs.map(s => {
                const y1 = yScale(s.from), y2 = yScale(s.to);
                const h = Math.max(0, y2 - y1);
                return h > 0.5 ? (
                  <rect key={s.key} x={cx(mi) - barW / 2} y={y1} width={barW} height={h}
                    fill={s.color} opacity={hovered ? 1 : 0.85} />
                ) : null;
              })}

              {/* Month label — single set only */}
              <text x={cx(mi)} y={yScale(yMin) + 15}
                textAnchor="middle"
                fontSize={10} fontWeight={hovered ? '600' : '400'}
                fill={hovered ? '#e5e7eb' : '#6b7280'}>
                {MONTHS[mi]}
              </text>

              {/* Invisible hover target covering full column */}
              <rect x={ml + mi * colW} y={mt} width={colW} height={ph + 18}
                fill="transparent" style={{ cursor: 'default' }}
                onMouseEnter={() => setHoveredMonth(mi)}
                onMouseLeave={() => setHoveredMonth(null)} />
            </g>
          );
        })}

        {/* Hover tooltip */}
        {tooltip && hoveredMonth !== null && (
          <foreignObject x={tooltip.tx} y={tooltip.ty}
            width={tooltipWidth} height={tooltip.tooltipH + 6}
            style={{ pointerEvents: 'none' }}>
            <div style={{
              background: '#1a2234',
              border: '1px solid #2d3f57',
              borderRadius: '7px',
              padding: '7px 10px 6px',
              fontSize: '10px',
              fontFamily: 'ui-sans-serif,system-ui,sans-serif',
              boxShadow: '0 6px 20px rgba(0,0,0,0.6)',
            }}>
              <div style={{ color: '#f1f5f9', fontWeight: 700, marginBottom: '5px', fontSize: '11px' }}>
                {MONTHS[hoveredMonth]}
              </div>
              {tooltip.rows.map(r => (
                <div key={r.label} style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', gap: '6px', marginBottom: '3px',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#94a3b8' }}>
                    <span style={{
                      display: 'inline-block', width: '8px', height: '8px',
                      borderRadius: '2px', background: r.color, flexShrink: 0,
                    }} />
                    {r.label}
                  </span>
                  <span style={{ color: '#e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {r.value.toFixed(1)} <span style={{ color: '#64748b', fontWeight: 400 }}>kWh/m²</span>
                  </span>
                </div>
              ))}
            </div>
          </foreignObject>
        )}

        {/* Legend */}
        {visibleComponents.map((c, i) => {
          const cols = 4;
          const lx = ml + (i % cols) * 128;
          const ly = H - mb + 30 + Math.floor(i / cols) * 16;
          return (
            <g key={c.key}>
              <rect x={lx} y={ly - 8} width={10} height={9} fill={c.color} rx={1.5} />
              <text x={lx + 14} y={ly} fontSize={9} fill="#9ca3af">{c.label}</text>
            </g>
          );
        })}

      </svg>
    </div>
  );
};
