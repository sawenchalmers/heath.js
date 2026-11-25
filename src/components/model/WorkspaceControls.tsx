import { useEffect, useRef, useState } from 'react';
import { Undo2, Redo2, MousePointer2, Pentagon, Move, RotateCw } from 'lucide-react';
import type { WorkspaceEditor } from '../../hooks/useWorkspaceEditor';
import type { BuildingEditDraft } from '../../hooks/useBuildingEditSession';
import { centroid, rectangle } from '../../utils/footprintInteraction';
import './workspace-editor.css';

export function ExactField({ label, value, onCommit, reset = false }: { label: string; value: number; onCommit: (value: number) => void; reset?: boolean }) {
  const skipBlur = useRef(false);
  const dirty = useRef(false);
  const [text, setText] = useState(value.toFixed(2));
  useEffect(() => { setText(value.toFixed(2)); dirty.current = false; }, [value]);
  const accept = () => {
    if (skipBlur.current) { skipBlur.current = false; dirty.current = false; return; }
    if (!dirty.current) return;
    dirty.current = false;
    if (text.trim() && Number.isFinite(Number(text))) onCommit(Number(text));
    setText(reset ? '0.00' : value.toFixed(2));
  };
  return <label className="editor-exact"><span>{label}</span><input inputMode="decimal" value={text} onChange={e => { dirty.current = true; setText(e.target.value); }} onBlur={accept} onKeyDown={e => {
    if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
    if (e.key === 'Escape') { e.stopPropagation(); skipBlur.current = true; setText(value.toFixed(2)); e.currentTarget.blur(); }
  }} /></label>;
}

export function GeometryInspector({ editor, draft }: { editor: WorkspaceEditor; draft: BuildingEditDraft }) {
  const { state: s } = editor;
  const selected = s.vertex === null ? null : draft.points[s.vertex];
  const center = centroid(draft.points);
  return <section className="editor-geometry">
    <h3>{selected && s.tool === 'reshape' ? `Point ${s.vertex! + 1}` : s.tool === 'rotate' ? 'Rotation' : 'Footprint'}</h3>
    {selected && s.tool === 'reshape' ? <>
      <div className="editor-coordinates"><ExactField label="Point X (m)" value={selected.x} onCommit={v => editor.setVertex('x', v)} /><ExactField label="Point Z (m)" value={selected.z} onCommit={v => editor.setVertex('z', v)} /></div>
      <button className="editor-text-button mr-4" onClick={() => {
        const next = draft.points[(s.vertex! + 1) % draft.points.length];
        editor.insert(s.vertex! + 1, { x: (selected.x + next.x) / 2, y: 0, z: (selected.z + next.z) / 2 });
      }}>Add point after</button>
      <button className="editor-text-button" onClick={editor.remove}>Remove point</button>
      {draft.points.length === 3 && <p>At least three points are required.</p>}
    </> : <>
      <div className="editor-coordinates"><ExactField label="Centroid X (m)" value={center.x} onCommit={v => editor.setCentroid('x', v)} /><ExactField label="Centroid Z (m)" value={center.z} onCommit={v => editor.setCentroid('z', v)} /></div>
      {s.tool === 'rotate' && <ExactField label="Rotate by (°)" value={0} reset onCommit={editor.rotateBy} />}
      <p>{draft.points.length} points · {s.tool === 'reshape' ? 'Drag points. Hover an edge to add a point.' : s.tool === 'move' ? 'Drag the footprint to move. Shift locks an axis.' : s.tool === 'rotate' ? 'Drag in 5° steps. Shift: 15°. Alt: free rotation.' : 'Choose Reshape to edit the footprint.'}</p>
    </>}
    {s.error && <p role="alert" className="editor-error">{s.error}</p>}
  </section>;
}

export function WorkspaceControls({ editor, draft, grid, onToggleGridSnap }: { editor: WorkspaceEditor; draft: BuildingEditDraft | null; grid: boolean; onToggleGridSnap: () => void }) {
  const { state: s, projection: p } = editor;
  const drawing = s.tool === 'polygon' || s.tool === 'rectangle';
  // While a placed point is dragged, the outline is the placed points only, without the cursor.
  const draggingDrawn = s.tool === 'polygon' && s.dragging && s.vertex !== null;
  const candidate = s.tool === 'polygon' && p.cursor && !draggingDrawn ? [...p.points, p.cursor] : p.points;
  const path = candidate.map(v => `${v.x},${v.y}`).join(' ');
  const activePoint = s.vertex ?? (drawing ? s.points.length - 1 : null);
  const dimensions = candidate.map((a, i) => {
    const b = candidate[(i + 1) % candidate.length];
    const world = drawing ? (s.tool === 'polygon' && s.cursor && !draggingDrawn ? [...s.points, s.cursor] : s.points[0] && s.cursor ? rectangle(s.points[0], s.cursor) : s.points) : draft?.points ?? [];
    if (!a || !b || !world[i] || !world[(i + 1) % world.length]) return null;
    // A dragged drawing point shows the lengths of its two edges, as in Reshape.
    if ((!drawing || draggingDrawn) && i !== activePoint && (i + 1) % candidate.length !== activePoint) return null;
    if (drawing && !draggingDrawn && i < candidate.length - 2) return null;
    const q = world[(i + 1) % world.length], w = world[i];
    return <span key={i} className="editor-dimension" style={{ left: (a.x + b.x) / 2, top: (a.y + b.y) / 2 - 15 }}>{Math.hypot(w.x - q.x, w.z - q.z).toFixed(2)} m</span>;
  });
  return <>
    <div data-editor-overlay className="editor-overlay" aria-label="Footprint controls">
      <svg className="editor-svg" aria-hidden="true">
        {p.guide.length === 2 && <line x1={p.guide[0].x} y1={p.guide[0].y} x2={p.guide[1].x} y2={p.guide[1].y} stroke="#047857" strokeWidth="1" strokeDasharray="4 4" />}
        {candidate.length > 1 && <polygon points={path} fill={drawing ? '#2563eb0d' : '#2563eb05'} stroke={s.error ? '#dc2626' : '#2563eb'} strokeWidth="1.5" strokeDasharray={drawing ? '5 4' : undefined} />}
        {s.snap && p.cursor && <><line x1={p.cursor.x - 16} y1={p.cursor.y} x2={p.cursor.x + 16} y2={p.cursor.y} stroke="#047857" /><line x1={p.cursor.x} y1={p.cursor.y - 16} x2={p.cursor.x} y2={p.cursor.y + 16} stroke="#047857" /></>}
      </svg>
      {dimensions}
      {(s.tool === 'reshape' || drawing) && p.points.map((v, i) => {
        const style = { left: v.x, top: v.y };
        // Preview corners must pass through pointer events, especially the second rectangle corner.
        if (drawing && s.tool !== 'polygon') return <span key={i} aria-hidden="true" className="editor-handle editor-preview-handle" style={style} />;
        // A polygon's placed points can be dragged while drawing; clicking the first one closes it.
        return <button key={i} aria-pressed={drawing ? undefined : s.vertex === i} aria-label={drawing ? (i === 0 ? 'Close footprint, or drag to move point 1' : `Drag to move point ${i + 1}`) : `Point ${i + 1}`} className={`editor-handle ${s.vertex === i ? 'is-selected' : ''}`} style={style}
          tabIndex={drawing && i !== 0 ? -1 : undefined}
          onPointerDown={e => editor.handlePointer(e, drawing ? 'drawingVertex' : 'vertex', i)}
          onClick={e => { if (e.detail !== 0) return; if (drawing) { if (i === 0) editor.finish(); } else editor.selectVertex(i); }} />;
      })}
      {(drawing || s.dragging) && p.cursor && <span className={`editor-cursor ${s.snap ? 'is-snapped' : ''}`} style={{ left: p.cursor.x, top: p.cursor.y }} />}
      {drawing && p.cursor && s.snap && (s.snap.kind === 'Close' && s.error
        ? <span className="editor-snap-label is-invalid" style={{ left: p.cursor.x + 16, top: p.cursor.y + 12 }}>Can't close</span>
        : <span className="editor-snap-label" style={{ left: p.cursor.x + 16, top: p.cursor.y + 12 }}>{s.snap.kind}</span>)}
      {s.tool === 'reshape' && s.insertion && p.insertion && !s.dragging && <button className="editor-insert" aria-label="Insert point on edge" style={{ left: p.insertion.x, top: p.insertion.y }} onPointerDown={e => editor.handlePointer(e, 'vertex', s.insertion!.index, s.insertion!.point)} onClick={e => { if (e.detail === 0) editor.insert(s.insertion!.index, s.insertion!.point); }}>+</button>}
      {s.tool === 'move' && p.pivot && <button aria-label="Move building" className="editor-move-handle" style={{ left: p.pivot.x, top: p.pivot.y }} onPointerDown={e => editor.handlePointer(e, 'move')}><Move size={18} /></button>}
      {s.tool === 'rotate' && p.pivot && <>
        <svg className="editor-rotation-ring-svg" style={{ left: p.pivot.x, top: p.pivot.y }} viewBox="0 0 176 176" aria-hidden="true">
          <circle cx="88" cy="88" r="72" fill="none" stroke="#2563eb" strokeWidth="1" />
          <circle cx="88" cy="88" r="72" fill="none" stroke="transparent" strokeWidth="24" style={{ pointerEvents: 'stroke', touchAction: 'none', cursor: 'grab' }} onPointerDown={e => editor.handlePointer(e, 'rotate')} />
        </svg>
        <span className="editor-pivot" style={{ left: p.pivot.x, top: p.pivot.y }} />
        {[0, 1, 2, 3].map(i => <button key={i} className="editor-rotation-handle" aria-label={`Rotate building ${['east', 'south', 'west', 'north'][i]}`} style={{ left: p.pivot!.x + 72 * Math.cos(i * Math.PI / 2), top: p.pivot!.y + 72 * Math.sin(i * Math.PI / 2) }} onPointerDown={e => editor.handlePointer(e, 'rotate')} onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); editor.rotateBy((e.key === 'ArrowRight' ? 1 : -1) * (e.altKey ? 1 : e.shiftKey ? 15 : 5)); } }}><RotateCw size={12} /></button>)}
      </>}
    </div>
    <div className={`editor-command-bar ${draft ? 'has-selection' : ''}`} role="toolbar" aria-label="Building tools">
      {drawing ? <>
        <button aria-pressed={s.tool === 'polygon'} onClick={() => editor.activate('polygon')}>Polygon</button>
        <button aria-pressed={s.tool === 'rectangle'} onClick={() => editor.activate('rectangle')}>Rectangle</button>
        <button title="Cancel drawing · Esc" onClick={() => editor.activate('select')}>Cancel</button>
        <button disabled={Boolean(editor.finishError)} className="editor-finish" onClick={editor.finish}>Finish</button>
      </> : draft ? <>
        <button aria-label="Select tool" aria-pressed={s.tool === 'select'} onClick={() => editor.activate('select')}><MousePointer2 size={15} /></button>
        <button aria-pressed={s.tool === 'reshape'} onClick={() => editor.activate('reshape')}><Pentagon size={15} />Reshape</button>
        <button aria-pressed={s.tool === 'move'} onClick={() => editor.activate('move')}><Move size={15} />Move</button>
        <button aria-pressed={s.tool === 'rotate'} onClick={() => editor.activate('rotate')}><RotateCw size={15} />Rotate</button>
      </> : <button onClick={() => editor.activate('polygon')}><Pentagon size={15} />Draw footprint</button>}
      <span className="editor-separator" />
      <button aria-label="Undo" title="Undo · Ctrl/Cmd Z" disabled={!editor.canUndo} onClick={editor.undo}><Undo2 size={16} /></button>
      <button aria-label="Redo" title="Redo · Shift Ctrl/Cmd Z" disabled={!editor.canRedo} onClick={editor.redo}><Redo2 size={16} /></button>
    </div>
    <div className="editor-view-switch" role="group" aria-label="View">
      <button aria-pressed={editor.plan} onClick={() => editor.view(true)}>2D</button><button aria-pressed={!editor.plan} onClick={() => editor.view(false)}>3D</button>
    </div>
    {(drawing || (draft && s.tool !== 'select')) && <div className="editor-status">
      <span role="status">{s.error ?? (s.feedback || (drawing ? (s.points.length ? s.tool === 'rectangle' ? 'Click opposite corner to finish' : 'Click to add · Enter to finish · Esc to exit' : 'Click to place the first point') : s.tool === 'rotate' ? '5° snap · Shift 15° · Alt free' : s.snap ? `${s.snap.kind} snap` : 'Shift constrains · Alt bypasses snapping'))}</span>
      {s.tool !== 'rotate' && <label title="Constrain polygon segments and movement to X/Z axes. Rectangles already have right angles."><input type="checkbox" checked={editor.ortho} onChange={e => editor.setOrtho(e.target.checked)} /> Ortho 90°</label>}
      <label><input type="checkbox" checked={grid} onChange={onToggleGridSnap} /> Grid snap</label>
      <select aria-label="Grid snap increment" value={editor.gridStep} onChange={e => editor.setGridStep(Number(e.target.value))}>{[0.1, 0.5, 1, 5].map(v => <option key={v} value={v}>{v} m</option>)}</select>
    </div>}
  </>;
}
