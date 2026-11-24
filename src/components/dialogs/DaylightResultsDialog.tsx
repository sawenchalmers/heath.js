import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Sun, Activity, Filter, Zap, Leaf, LayoutDashboard } from 'lucide-react';
import { DaylightRunSummary, DaylightSensorPoint } from '../../types/daylight';
import { EmbodiedCarbonResult } from '../../services/EPSMService';
import { MonthlyHeatBalance } from '../../services/EnergyApiService';
import { MonthlyHeatBalanceChart } from '../MonthlyHeatBalanceChart';

export interface EnergyResults {
  heatingDemand?: number;
  coolingDemand?: number;
  totalEnergy?: number;
  globalWarmingPotential?: number;
  embodiedCarbonBreakdown?: EmbodiedCarbonResult;
  monthlyHeatBalance?: MonthlyHeatBalance;
  status?: 'idle' | 'queued' | 'running' | 'complete' | 'failed';
}

interface DaylightResultsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  buildingName: string;
  result: DaylightRunSummary;
  energyResults?: EnergyResults;
  availableResults?: Array<{ id: string; name: string }>;
  selectedBuildingId?: string;
  onSelectBuildingResult?: (buildingId: string) => void;
  onApplyVisualization: (points: DaylightSensorPoint[], mode: MetricMode) => void;
}

type MetricMode = 'df' | 'sda';
type Tab = 'overview' | 'daylight' | 'energy' | 'lca';

export const DaylightResultsDialog: React.FC<DaylightResultsDialogProps> = ({
  isOpen,
  onClose,
  buildingName,
  result,
  energyResults,
  availableResults = [],
  selectedBuildingId,
  onSelectBuildingResult,
  onApplyVisualization
}) => {
  const [tab, setTab] = useState<Tab>('overview');
  const [mode, setMode] = useState<MetricMode>('df');
  const [showPassingOnly, setShowPassingOnly] = useState(false);
  const [selectedSensorGridIndex, setSelectedSensorGridIndex] = useState(0);

  // Stable ref so the effect below doesn't re-fire when the parent re-creates the callback inline
  const onApplyVisualizationRef = useRef(onApplyVisualization);
  useEffect(() => { onApplyVisualizationRef.current = onApplyVisualization; });

  const hasSda = Boolean(result.sdaPoints && result.sdaPoints.length > 0);

  useEffect(() => {
    setSelectedSensorGridIndex(0);
  }, [result.completedAt]);

  const sensorGrids = useMemo(() => {
    if (result.sensorGrids?.length) {
      return result.sensorGrids;
    }

    // Results saved before multi-floor support have one implicit selected-floor range.
    return [{
      identifier: 'legacy-grid',
      full_identifier: 'legacy-grid',
      room_identifier: 'room',
      floor_number: null,
      start_sensor_index: 0,
      sensor_count: result.points.length
    }];
  }, [result.sensorGrids, result.points.length]);

  const activeSensorGrid = sensorGrids[Math.min(selectedSensorGridIndex, sensorGrids.length - 1)];

  const floorResultArrays = useMemo(() => {
    const start = activeSensorGrid.start_sensor_index;
    const end = start + activeSensorGrid.sensor_count;

    return {
      dfPoints: result.points.slice(start, end),
      sdaPoints: result.sdaPoints?.slice(start, end),
      sdaPassMask: result.sdaPassMask?.slice(start, end)
    };
  }, [activeSensorGrid, result.points, result.sdaPoints, result.sdaPassMask]);

  const visiblePointEntries = useMemo(() => {
    const points = mode === 'sda' && floorResultArrays.sdaPoints
      ? floorResultArrays.sdaPoints
      : floorResultArrays.dfPoints;
    const entries = points.map((point, index) => ({
      point,
      pass: floorResultArrays.sdaPassMask?.[index]
    }));

    return mode === 'sda' && showPassingOnly
      ? entries.filter(({ pass }) => pass === true)
      : entries;
  }, [floorResultArrays, mode, showPassingOnly]);

  const visiblePoints = useMemo(
    () => visiblePointEntries.map(({ point }) => point),
    [visiblePointEntries]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const allFloorPoints = mode === 'sda' && result.sdaPoints
      ? result.sdaPoints
      : result.points;
    onApplyVisualizationRef.current(allFloorPoints, mode);
  }, [isOpen, selectedBuildingId, mode, result]);

  const planView = useMemo(() => {
    if (visiblePointEntries.length === 0) {
      return null;
    }

    const points = visiblePointEntries.map(({ point }) => point);
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minZ = Math.min(...points.map((point) => point.z));
    const maxZ = Math.max(...points.map((point) => point.z));
    const minValue = Math.min(...points.map((point) => point.value));
    const maxValue = Math.max(...points.map((point) => point.value));

    const epsilon = 1e-6;
    const sortedX = [...new Set(points.map((point) => point.x))].sort((a, b) => a - b);
    const sortedZ = [...new Set(points.map((point) => point.z))].sort((a, b) => a - b);

    const minDelta = (values: number[]): number => {
      let best = Number.POSITIVE_INFINITY;
      for (let i = 1; i < values.length; i += 1) {
        const delta = values[i] - values[i - 1];
        if (delta > epsilon && delta < best) {
          best = delta;
        }
      }
      return Number.isFinite(best) ? best : Number.POSITIVE_INFINITY;
    };

    const spacing = Math.min(minDelta(sortedX), minDelta(sortedZ));
    const fallbackSpacing = Math.max(
      (maxX - minX) / Math.max(1, Math.sqrt(floorResultArrays.dfPoints.length)),
      (maxZ - minZ) / Math.max(1, Math.sqrt(floorResultArrays.dfPoints.length)),
      0.4
    );
    const worldCell = Number.isFinite(spacing) ? Math.max(0.1, spacing * 0.9) : fallbackSpacing;

    const viewSize = 320;
    const margin = 14;
    const innerSize = viewSize - margin * 2;
    const worldWidth = Math.max(maxX - minX, worldCell);
    const worldHeight = Math.max(maxZ - minZ, worldCell);
    const scale = Math.min(innerSize / worldWidth, innerSize / worldHeight);
    const contentWidth = worldWidth * scale;
    const contentHeight = worldHeight * scale;
    const offsetX = margin + (innerSize - contentWidth) / 2;
    const offsetY = margin + (innerSize - contentHeight) / 2;
    const cellSizePx = Math.max(2, worldCell * scale);

    const getDfColorForAbsoluteValue = (dfPercent: number): string => {
      const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * Math.max(0, Math.min(1, t)));
      const lerp = (from: [number, number, number], to: [number, number, number], t: number) =>
        `rgb(${mix(from[0], to[0], t)}, ${mix(from[1], to[1], t)}, ${mix(from[2], to[2], t)})`;
      const v = Math.max(0, dfPercent);
      if (v < 1) return lerp([30, 58, 138], [29, 78, 216], v);
      if (v < 2) return lerp([29, 78, 216], [6, 182, 212], v - 1);
      if (v < 5) return lerp([6, 182, 212], [34, 197, 94], (v - 2) / 3);
      if (v < 10) return lerp([34, 197, 94], [245, 158, 11], (v - 5) / 5);
      return lerp([245, 158, 11], [239, 68, 68], Math.min(1, (v - 10) / 5));
    };

    const getSdaColor = (pass: boolean | undefined, pointValue: number): string => {
      if (pass === true) {
        return 'rgb(34, 197, 94)';
      }
      if (pass === false) {
        return 'rgb(239, 68, 68)';
      }
      // Fallback uses LEED sDA thresholds (55% nominal, 75% enhanced)
      const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * Math.max(0, Math.min(1, t)));
      const v = Math.max(0, Math.min(100, pointValue));
      if (v < 55) return `rgb(${mix(239, 249, v / 55)}, ${mix(68, 115, v / 55)}, 22)`;
      if (v < 75) return `rgb(${mix(249, 34, (v - 55) / 20)}, ${mix(115, 197, (v - 55) / 20)}, ${mix(22, 94, (v - 55) / 20)})`;
      return `rgb(${mix(34, 21, (v - 75) / 25)}, ${mix(197, 128, (v - 75) / 25)}, ${mix(94, 61, (v - 75) / 25)})`;
    };

    const cells = visiblePointEntries.map(({ point, pass }) => {
      const x = offsetX + (point.x - minX) * scale - cellSizePx / 2;
      const y = offsetY + (maxZ - point.z) * scale - cellSizePx / 2;
      const color = mode === 'df'
        ? getDfColorForAbsoluteValue(point.value)
        : getSdaColor(pass, point.value);

      return {
        x,
        y,
        color
      };
    });

    return {
      viewSize,
      cellSizePx,
      minValue,
      maxValue,
      cells
    };
  }, [visiblePointEntries, mode, floorResultArrays.dfPoints.length]);

  const activeLegendStats = useMemo(() => {
    if (visiblePoints.length === 0) {
      return null;
    }

    const values = visiblePoints.map((point) => point.value);
    return {
      min: Math.min(...values),
      max: Math.max(...values)
    };
  }, [visiblePoints]);

  if (!isOpen) return null;

  const passingSensors = floorResultArrays.sdaPassMask?.filter(Boolean).length ?? 0;
  const passingPercentage = floorResultArrays.sdaPassMask && floorResultArrays.sdaPassMask.length > 0
    ? (passingSensors / floorResultArrays.sdaPassMask.length) * 100
    : 0;

  const hasEnergy = energyResults?.status === 'complete' || energyResults?.heatingDemand !== undefined;
  const hasGwp = (energyResults?.globalWarmingPotential ?? 0) > 0;

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
    { id: 'daylight', label: 'Daylight', icon: <Sun className="w-3.5 h-3.5" /> },
    { id: 'energy',   label: 'Energy',   icon: <Zap className="w-3.5 h-3.5" /> },
    { id: 'lca',      label: 'LCA / GWP', icon: <Leaf className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-2.5 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold text-slate-900">Results Explorer</h2>
            <p className="text-xs text-slate-500 truncate">{buildingName}</p>
          </div>
          <div className="flex items-center gap-2">
            {availableResults.length > 0 && (
              <select
                aria-label="Result building"
                value={selectedBuildingId}
                onChange={e => onSelectBuildingResult?.(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded-md px-2 py-1.5 text-slate-700"
              >
                {availableResults.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            )}
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-md transition-colors" aria-label="Close results dialog">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 px-4 sm:px-5 pt-2.5 shrink-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === t.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {t.icon}
              {t.label}
              {t.id === 'energy' && !hasEnergy && (
                <span className="ml-1 text-[10px] text-slate-400 italic">—</span>
              )}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">

          {/* ── OVERVIEW ── */}
          {tab === 'overview' && (
            <div className="space-y-4">
              {/* Daylight KPIs */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Sun className="w-4 h-4 text-cyan-600" />
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Daylight</span>
                  <button
                    onClick={() => setTab('daylight')}
                    className="ml-auto text-[10px] text-blue-600 hover:text-blue-700"
                  >Details →</button>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <KpiCard label="Mean DF" value={`${result.meanDF.toFixed(2)}%`} sub="Daylight Factor" color="text-cyan-700" />
                  <KpiCard label="sDA" value={`${result.sda.toFixed(1)}%`} sub="300 lux / 50% yr" color={result.sda >= 55 ? 'text-emerald-700' : 'text-rose-600'} />
                  <KpiCard label="Sensors" value={String(result.points.length)} sub="grid points" />
                </div>
              </div>

              {/* Energy KPIs */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Energy</span>
                  <button onClick={() => setTab('energy')} className="ml-auto text-[10px] text-blue-600 hover:text-blue-700">Details →</button>
                </div>
                {hasEnergy ? (
                  <div className="grid grid-cols-3 gap-2.5">
                    <KpiCard label="Heating" value={energyResults?.heatingDemand != null ? `${energyResults.heatingDemand.toFixed(1)}` : '—'} sub="kWh/m²/yr" color="text-orange-700" />
                    <KpiCard label="Cooling" value={energyResults?.coolingDemand != null ? `${energyResults.coolingDemand.toFixed(1)}` : '—'} sub="kWh/m²/yr" color="text-blue-700" />
                    <KpiCard label="Total" value={energyResults?.totalEnergy != null ? `${energyResults.totalEnergy.toFixed(1)}` : '—'} sub="kWh/m²/yr" color="text-slate-900" />
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 bg-slate-50 rounded-md p-2.5 border border-slate-200">
                    {energyResults?.status === 'queued' || energyResults?.status === 'running'
                      ? `Energy simulation ${energyResults.status}…`
                      : energyResults?.status === 'failed'
                        ? 'Energy simulation failed'
                        : 'Not yet run — click Run in the Design Graph'}
                  </p>
                )}
              </div>

              {/* LCA/GWP KPIs */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Leaf className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Embodied Carbon (A1–A3)</span>
                  <button onClick={() => setTab('lca')} className="ml-auto text-[10px] text-blue-600 hover:text-blue-700">Details →</button>
                </div>
                {hasGwp ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    <KpiCard label="GWP" value={`${energyResults!.globalWarmingPotential!.toFixed(1)}`} sub="kg CO₂e/m² floor" color="text-orange-700" />
                    <KpiCard label="Source" value="EPSM" sub="per construction assembly" color="text-slate-600" />
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 bg-slate-50 rounded-md p-2.5 border border-slate-200">
                    Select constructions in Edit Building to compute embodied carbon
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── DAYLIGHT ── */}
          {tab === 'daylight' && (
            <div className="space-y-5">
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setMode('df')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === 'df' ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  <Sun className="w-4 h-4 inline mr-2" />DF Heatmap
                </button>
                <button
                  onClick={() => setMode('sda')}
                  disabled={!hasSda}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === 'sda' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <Activity className="w-4 h-4 inline mr-2" />sDA View
                </button>
                {sensorGrids.length > 1 && (
                  <label className="ml-auto flex items-center gap-2 text-xs text-slate-500">
                    Plan floor
                    <select
                      aria-label="Plan view floor"
                      value={Math.min(selectedSensorGridIndex, sensorGrids.length - 1)}
                      onChange={(event) => setSelectedSensorGridIndex(Number(event.target.value))}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-slate-700"
                    >
                      {sensorGrids.map((grid, index) => (
                        <option key={`${grid.full_identifier}-${index}`} value={index}>
                          {grid.floor_number === null ? grid.identifier : `Floor ${grid.floor_number}`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              {mode === 'sda' && hasSda && (
                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <input type="checkbox" checked={showPassingOnly} onChange={e => setShowPassingOnly(e.target.checked)} className="rounded border-slate-300 bg-white text-emerald-600" />
                  Show passing sensors only
                </label>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                <KpiCard label="Sensor Count" value={String(visiblePoints.length)} />
                <KpiCard label="Mean DF" value={`${result.meanDF.toFixed(2)}%`} color="text-cyan-700" />
                <KpiCard label="DF Range" value={`${result.minDF?.toFixed(2) ?? '—'}–${result.maxDF?.toFixed(2) ?? '—'}`} />
                <KpiCard label="sDA 300/50" value={`${result.sda.toFixed(1)}%`} color={result.sda >= 55 ? 'text-emerald-700' : 'text-rose-600'} />
              </div>

              {/* Scale bar */}
              <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                {mode === 'df' ? (
                  <>
                    <div className="text-xs text-slate-700 font-medium mb-2">DF Scale — CIBSE/BRE reference</div>
                    <div className="h-3 rounded-md border border-slate-200" style={{ background: 'linear-gradient(90deg,#1e3a8a 0%,#1d4ed8 10%,#06b6d4 20%,#22c55e 50%,#f59e0b 80%,#ef4444 100%)' }} />
                    <div className="relative mt-1 h-5">
                      {[['0%','0%'],['1%','10%'],['2%▲','20%'],['5%','50%'],['10%+','100%']].map(([lbl,pos]) => (
                        <span key={lbl} className={`absolute text-[10px] ${lbl.includes('▲') ? 'text-cyan-700 font-bold' : 'text-slate-500'} -translate-x-1/2`} style={{ left: pos }}>{lbl}</span>
                      ))}
                    </div>
                    {activeLegendStats && <div className="text-[10px] text-slate-500 mt-1">Range: {activeLegendStats.min.toFixed(2)}–{activeLegendStats.max.toFixed(2)}% · ▲ 2% = CIBSE/BRE office target</div>}
                  </>
                ) : (
                  <>
                    <div className="text-xs text-slate-700 font-medium mb-2">sDA Scale — IES LM-83 / LEED v4</div>
                    <div className="h-3 rounded-md border border-slate-200" style={{ background: 'linear-gradient(90deg,#ef4444 0%,#f97316 55%,#22c55e 75%,#15803d 100%)' }} />
                    <div className="relative mt-1 h-5">
                      <span className="absolute left-0 text-[10px] text-slate-500">0%</span>
                      <span className="absolute text-[10px] text-orange-700 font-bold -translate-x-1/2" style={{ left: '55%' }}>55%▲</span>
                      <span className="absolute text-[10px] text-emerald-700 font-bold -translate-x-1/2" style={{ left: '75%' }}>75%▲</span>
                      <span className="absolute right-0 text-[10px] text-slate-500">100%</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">▲ 55% = LEED nominal · 75% = LEED enhanced</div>
                  </>
                )}
              </div>

              {/* Plan view */}
              {planView && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-800">Plan View {mode === 'df' ? 'DF Heatmap' : 'sDA Map'}</h3>
                    <div className="text-xs text-slate-500">
                      {activeSensorGrid.floor_number === null
                        ? activeSensorGrid.identifier
                        : `Floor ${activeSensorGrid.floor_number}`}
                    </div>
                  </div>
                  <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
                    <svg viewBox={`0 0 ${planView.viewSize} ${planView.viewSize}`} className="w-full max-w-[320px] aspect-square rounded-md border border-slate-200 bg-white">
                      {planView.cells.map((cell, index) => (
                        <rect key={index} x={cell.x} y={cell.y} width={planView.cellSizePx} height={planView.cellSizePx} fill={cell.color} opacity={0.95} />
                      ))}
                    </svg>
                    <div className="text-[10px] text-slate-500">
                      <p>Room range: {planView.minValue.toFixed(2)}–{planView.maxValue.toFixed(2)}{mode === 'df' ? '%' : '%'}</p>
                      {hasSda && mode === 'sda' && <p className="mt-1">Passing: {passingSensors}/{floorResultArrays.sdaPassMask?.length} ({passingPercentage.toFixed(1)}%)</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ENERGY ── */}
          {tab === 'energy' && (
            <div className="space-y-4">
              {hasEnergy ? (
                <>
                  <div className="grid grid-cols-3 gap-2.5">
                    <KpiCard label="Heating Demand" value={energyResults?.heatingDemand != null ? `${energyResults.heatingDemand.toFixed(1)}` : '—'} sub="kWh/m²/yr" color="text-orange-700" />
                    <KpiCard label="Cooling Demand" value={energyResults?.coolingDemand != null ? `${energyResults.coolingDemand.toFixed(1)}` : '—'} sub="kWh/m²/yr" color="text-blue-700" />
                    <KpiCard label="Total Energy" value={energyResults?.totalEnergy != null ? `${energyResults.totalEnergy.toFixed(1)}` : '—'} sub="kWh/m²/yr" color="text-slate-900" />
                  </div>

                  {/* Monthly heat balance chart */}
                  {energyResults?.monthlyHeatBalance ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Monthly Heat Balance</p>
                      <MonthlyHeatBalanceChart data={energyResults.monthlyHeatBalance} />
                    </div>
                  ) : (
                    energyResults?.heatingDemand != null && energyResults?.coolingDemand != null && (
                      <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2">
                        <div className="text-xs text-slate-500 font-medium mb-2">Heating vs Cooling split</div>
                        {(() => {
                          const total = (energyResults.heatingDemand ?? 0) + (energyResults.coolingDemand ?? 0);
                          const hPct = total > 0 ? ((energyResults.heatingDemand ?? 0) / total) * 100 : 50;
                          return (
                            <div className="flex rounded-full overflow-hidden h-4">
                              <div className="bg-orange-500/70" style={{ width: `${hPct}%` }} title={`Heating ${hPct.toFixed(0)}%`} />
                              <div className="bg-blue-500/70 flex-1" title={`Cooling ${(100 - hPct).toFixed(0)}%`} />
                            </div>
                          );
                        })()}
                        <div className="flex justify-between text-[10px] text-slate-500">
                          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-orange-500/70" />Heating</span>
                          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-blue-500/70" />Cooling</span>
                        </div>
                      </div>
                    )
                  )}

                  <p className="text-xs text-slate-500">Results from EnergyPlus via EPSM. Values normalised by total floor area.</p>
                </>
              ) : (
                <div className="text-center py-10 text-slate-500">
                  <Zap className="w-8 h-8 mx-auto mb-3 text-slate-400" />
                  <p className="text-sm">
                    {energyResults?.status === 'queued' || energyResults?.status === 'running'
                      ? `Energy simulation ${energyResults.status}…`
                      : energyResults?.status === 'failed'
                        ? 'Energy simulation failed. Try re-running from the Design Graph.'
                        : 'Open the Design Graph and click Run on this node to run an energy simulation.'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── LCA / GWP ── */}
          {tab === 'lca' && (
            <div className="space-y-4">
              {hasGwp ? (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    <KpiCard label="Embodied Carbon" value={`${energyResults!.globalWarmingPotential!.toFixed(1)}`} sub="kg CO₂e / m² floor" color="text-orange-700" />
                    <KpiCard label="Scope" value="A1–A3" sub="Product &amp; transport stages" color="text-slate-600" />
                  </div>

                  {/* Element breakdown */}
                  {energyResults?.embodiedCarbonBreakdown && (
                    <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">Element Breakdown</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                        <span className="text-slate-500">Walls</span>
                        <span className="text-right text-slate-700">{energyResults.embodiedCarbonBreakdown.wall_gwp_kgco2e.toFixed(0)} kg CO₂e</span>
                        <span className="text-slate-500">Floor slabs</span>
                        <span className="text-right text-slate-700">{energyResults.embodiedCarbonBreakdown.floor_gwp_kgco2e.toFixed(0)} kg CO₂e</span>
                        <span className="text-slate-500">Roof</span>
                        <span className="text-right text-slate-700">{energyResults.embodiedCarbonBreakdown.roof_gwp_kgco2e.toFixed(0)} kg CO₂e</span>
                        <span className="text-slate-500">Windows</span>
                        <span className="text-right text-slate-700">{energyResults.embodiedCarbonBreakdown.window_gwp_kgco2e.toFixed(0)} kg CO₂e</span>
                        <span className="border-t border-slate-200 pt-2 font-medium text-slate-700">Total</span>
                        <span className="border-t border-slate-200 pt-2 text-right font-bold text-orange-700">{energyResults.embodiedCarbonBreakdown.total_gwp_kgco2e.toFixed(0)} kg CO₂e</span>
                      </div>
                    </div>
                  )}

                  <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-1.5 text-xs text-slate-500">
                    <p className="font-medium text-slate-700 mb-1">Methodology</p>
                    <p>GWP computed client-side from <span className="text-slate-900">EPSM</span> pre-computed <code className="text-slate-700 bg-slate-100 px-1 rounded">gwp_kgco2e_per_m²</code> × element surface area.</p>
                    <p className="text-slate-500">Σ (gwp/m² × element area) / total floor area</p>
                  </div>
                </>
              ) : (
                <div className="text-center py-10 text-slate-500">
                  <Leaf className="w-8 h-8 mx-auto mb-3 text-slate-400" />
                  <p className="text-sm">Run an energy simulation to compute embodied carbon.</p>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

// ── Small helper ──────────────────────────────────────────────────────────────

const KpiCard: React.FC<{ label: string; value: string; sub?: string; color?: string }> = ({
  label, value, sub, color = 'text-slate-900'
}) => (
  <div className="bg-slate-50 border border-slate-200 rounded-md p-2.5">
    <div className="text-[11px] text-slate-500">{label}</div>
    <div className={`text-base font-semibold ${color}`}>{value}</div>
    {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
  </div>
);
