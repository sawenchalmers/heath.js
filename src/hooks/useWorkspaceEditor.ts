import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { BuildingConfig, BuildingData, BuildingModel, Point3D } from '../types/building';
import type { useBuildingEditSession, BuildingEditDraft } from './useBuildingEditSession';
import { centroid, snapRotation, isOrthogonalFootprint, nearestOnSegment, rectangle, resolveSnap, rotateFootprint, translateFootprint, type ScreenPoint, type Snap } from '../utils/footprintInteraction';
import { validateFootprint } from '../utils/buildingMetrics';
import { WorkspaceHistory } from '../utils/workspaceHistory';

export type EditorTool = 'select' | 'polygon' | 'rectangle' | 'reshape' | 'move' | 'rotate';
interface EditorState {
  tool: EditorTool; points: Point3D[]; cursor: Point3D | null; snap: Snap | null;
  vertex: number | null; insertion: { index: number; point: Point3D } | null;
  error: string | null; feedback: string; dragging: boolean;
}
interface Options {
  containerRef: React.RefObject<HTMLDivElement>; enabled: boolean;
  getCamera: () => THREE.Camera | null;
  setPlanMode: (plan: boolean) => void; setSpacePan: (active: boolean) => void;
  setCameraControlsEnabled: (enabled: boolean) => void;
  edit: ReturnType<typeof useBuildingEditSession>;
  getBuildings: () => BuildingData[]; getBuilding: (id: string) => BuildingData | undefined;
  selectBuilding: (building: BuildingData | null) => void;
  createBuilding: (points: Point3D[], config: BuildingConfig) => BuildingData | undefined;
  deleteBuilding: (id: string) => void;
  captureSnapshot: () => BuildingModel[];
  replaceWorkspace: (models: readonly BuildingModel[]) => BuildingData[];
  config: BuildingConfig; grid: boolean;
  onChange: (selectedId: string | null) => void;
  onSelect: (building: BuildingData | null) => void;
}
interface Gesture {
  kind: 'vertex' | 'move' | 'rotate' | 'draw' | 'select';
  pointerId: number; target: Element; original: Point3D[]; candidate: Point3D[];
  start: Point3D; screen: ScreenPoint; pivot: Point3D; vertex?: number; invalid: string | null;
}
const initialState: EditorState = { tool: 'select', points: [], cursor: null, snap: null, vertex: null, insertion: null, error: null, feedback: '', dragging: false };
const isInput = (target: EventTarget | null) => target instanceof HTMLElement && Boolean(target.closest('input,textarea,select,[contenteditable="true"]'));

export function useWorkspaceEditor(options: Options) {
  const [state, setState] = useState<EditorState>(initialState);
  const stateRef = useRef(state);
  const optionsRef = useRef(options);
  useLayoutEffect(() => { optionsRef.current = options; });
  const gesture = useRef<Gesture | null>(null);
  const lastPointer = useRef<PointerEvent | null>(null);
  const history = useRef(new WorkspaceHistory());
  const before = useRef<BuildingModel[] | null>(null);
  const selectedId = useRef<string | null>(null);
  const space = useRef(false);
  const drawingRedo = useRef<Point3D[]>([]);
  const [historyVersion, refreshHistory] = useState(0);
  const [ortho, setOrtho] = useState(false);
  const orthoRef = useRef(false);
  const [gridStep, setGridStep] = useState(1);
  const stepRef = useRef(gridStep); stepRef.current = gridStep;
  const [plan, setPlan] = useState(false);
  const [projection, setProjection] = useState<{ points: ScreenPoint[]; cursor: ScreenPoint | null; insertion: ScreenPoint | null; pivot: ScreenPoint | null; guide: ScreenPoint[] }>({ points: [], cursor: null, insertion: null, pivot: null, guide: [] });
  const publish = (patch: Partial<EditorState>) => {
    stateRef.current = { ...stateRef.current, ...patch };
    setState(stateRef.current);
  };
  const project = (point: Point3D): ScreenPoint => {
    const camera = optionsRef.current.getCamera();
    const rect = optionsRef.current.containerRef.current?.getBoundingClientRect();
    if (!camera || !rect) return { x: -10000, y: -10000 };
    const p = new THREE.Vector3(point.x, point.y, point.z).project(camera);
    return { x: (p.x + 1) * rect.width / 2, y: (1 - p.y) * rect.height / 2 };
  };
  const ground = (event: { clientX: number; clientY: number }): Point3D | null => {
    const camera = optionsRef.current.getCamera();
    const rect = optionsRef.current.containerRef.current?.getBoundingClientRect();
    if (!camera || !rect) return null;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
    const p = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    return p ? { x: p.x, y: 0, z: p.z } : null;
  };
  const points = () => optionsRef.current.edit.getDraft()?.points ?? [];
  const otherFootprints = () => optionsRef.current.getBuildings().filter(b => b.id !== selectedId.current).map(b => b.points);
  const begin = () => {
    if (before.current || !selectedId.current) return;
    before.current = optionsRef.current.captureSnapshot();
  };
  const commit = (label = 'Edit building') => {
    const o = optionsRef.current;
    if (!before.current) return;
    o.edit.commit();
    history.current.record(label, before.current, o.captureSnapshot(), selectedId.current);
    before.current = null;
    if (selectedId.current) o.edit.open(selectedId.current);
    refreshHistory(n => n + 1);
    o.onChange(selectedId.current);
  };
  const release = () => {
    const current = gesture.current;
    gesture.current = null;
    if (current?.target.hasPointerCapture?.(current.pointerId)) current.target.releasePointerCapture(current.pointerId);
    optionsRef.current.setCameraControlsEnabled(true);
    publish({ dragging: false, snap: null });
  };
  const cancel = () => {
    const o = optionsRef.current;
    if (before.current) {
      o.edit.cancel();
      if (selectedId.current) o.edit.open(selectedId.current);
    }
    before.current = null;
    release();
    publish({ feedback: '', error: null, insertion: null });
  };
  const select = (building: BuildingData | null) => {
    cancel();
    const o = optionsRef.current;
    o.edit.discard();
    selectedId.current = building?.id ?? null;
    o.selectBuilding(building);
    if (building) o.edit.open(building.id);
    o.onSelect(building);
    publish({ tool: 'select', points: [], cursor: null, vertex: null, insertion: null });
  };
  const view = (isPlan: boolean) => {
    if (gesture.current) cancel();
    optionsRef.current.setPlanMode(isPlan); setPlan(isPlan);
  };
  const activate = (tool: EditorTool) => {
    drawingRedo.current = [];
    cancel();
    if (tool === 'polygon' || tool === 'rectangle') select(null);
    publish({ tool, points: [], vertex: null, cursor: null, insertion: null, feedback: '', error: null });
    if (tool === 'polygon' || tool === 'rectangle' || tool === 'reshape') view(true);
  };
  const create = (candidate: Point3D[]) => {
    const error = validateFootprint(candidate, otherFootprints()) ?? (orthoRef.current && stateRef.current.tool === 'polygon' && !isOrthogonalFootprint(candidate) ? 'Align the final point with the start to close at 90°.' : null);
    if (error) { publish({ error }); return; }
    const o = optionsRef.current;
    const snapshot = o.captureSnapshot();
    const building = o.createBuilding(candidate, o.config);
    if (!building) return;
    history.current.record('Create building', snapshot, o.captureSnapshot(), building.id);
    select(building);
    publish({ tool: 'reshape' });
    refreshHistory(n => n + 1); o.onChange(selectedId.current);
  };
  const finish = () => {
    const s = stateRef.current;
    create(s.tool === 'rectangle' && s.points[0] && s.cursor ? rectangle(s.points[0], s.cursor) : s.points);
  };
  const preview = (candidate: Point3D[]) => {
    const error = validateFootprint(candidate, otherFootprints());
    if (gesture.current) { gesture.current.candidate = candidate; gesture.current.invalid = error; }
    if (!error) optionsRef.current.edit.updateFootprint(candidate);
    publish({ error });
  };
  const applyPoints = (candidate: Point3D[], label: string) => {
    const error = validateFootprint(candidate, otherFootprints());
    if (error) { publish({ error }); return; }
    begin(); optionsRef.current.edit.updateFootprint(candidate); commit(label); publish({ error: null });
  };
  const deleteSelectedBuilding = () => {
      if (!selectedId.current) return;
      cancel();
      const o = optionsRef.current, id = selectedId.current;
      const snapshot = o.captureSnapshot();
      select(null); o.deleteBuilding(id);
      history.current.record('Delete building', snapshot, o.captureSnapshot(), id);
      refreshHistory(n => n + 1); o.onChange(selectedId.current);
  };
  const remove = () => {
    const s = stateRef.current;
    if (s.tool === 'polygon' || s.tool === 'rectangle') {
      publish({ points: s.points.slice(0, -1), error: null }); return;
    }
    if (gesture.current) cancel();
    if (s.tool === 'reshape' && s.vertex !== null) {
      if (points().length <= 3) { publish({ error: 'Keep at least three points in a footprint.' }); return; }
      applyPoints(points().filter((_, i) => i !== s.vertex), 'Remove point');
      publish({ vertex: null });
    } else if (selectedId.current) {
      deleteSelectedBuilding();
    }
  };
  const travel = (redo: boolean) => {
    const previous = stateRef.current;
    if (previous.tool === 'polygon' || previous.tool === 'rectangle') {
      if (!redo && previous.points.length) {
        drawingRedo.current.push(previous.points[previous.points.length - 1]);
        publish({ points: previous.points.slice(0, -1), error: null }); return;
      }
      if (redo && drawingRedo.current.length) {
        publish({ points: [...previous.points, drawingRedo.current.pop()!], error: null }); return;
      }
    }
    cancel();
    const restored = redo ? history.current.redo() : history.current.undo();
    if (!restored) return;
    const o = optionsRef.current;
    o.edit.discard();
    o.replaceWorkspace(restored.models);
    select(restored.selection ? o.getBuilding(restored.selection) ?? null : null);
    if (selectedId.current && ['reshape', 'move', 'rotate'].includes(previous.tool)) publish({ tool: previous.tool, vertex: previous.vertex !== null && previous.vertex < points().length ? previous.vertex : null });
    refreshHistory(n => n + 1); o.onChange(selectedId.current);
  };
  const escape = () => {
    if (gesture.current || before.current) cancel();
    else if (stateRef.current.tool !== 'select') activate('select');
    else select(null);
  };
  const snapPoint = (raw: Point3D, event: PointerEvent, origin?: Point3D) => {
    const s = stateRef.current;
    const drawing = s.tool === 'polygon' || s.tool === 'rectangle';
    const others = optionsRef.current.getBuildings().filter(b => b.id !== selectedId.current).flatMap(b => b.points);
    const own = drawing ? s.points : s.tool === 'move' ? [] : (gesture.current?.original ?? points()).filter((_, i) => i !== s.vertex);
    const snap = resolveSnap(raw, project, [...own, ...others], { closure: s.tool === 'polygon' && s.points.length >= 3 ? s.points[0] : undefined,
      grid: optionsRef.current.grid ? stepRef.current : null, bypass: event.altKey, previous: s.snap, origin, axis: s.tool !== 'rectangle' && (event.shiftKey || orthoRef.current) });
    publish({ snap });
    return snap?.point ?? raw;
  };
  const startGesture = (event: PointerEvent, kind: Gesture['kind'], index?: number, insertion?: Point3D) => {
    if (event.button !== 0 || space.current || gesture.current) return;
    const raw = ground(event);
    if (!raw) return;
    if (document.activeElement instanceof HTMLElement && isInput(document.activeElement)) document.activeElement.blur();
    if (before.current) commit();
    const original = points().map(p => ({ ...p }));
    if (index !== undefined) publish({ vertex: index, insertion: null });
    if (kind !== 'draw' && kind !== 'select') begin();
    const target = optionsRef.current.containerRef.current!;
    gesture.current = { kind, pointerId: event.pointerId, target, original, candidate: original, start: raw,
      screen: { x: event.clientX, y: event.clientY }, pivot: centroid(original), vertex: index, invalid: null };
    if (insertion && index !== undefined) {
      gesture.current.original = [...original.slice(0, index), insertion, ...original.slice(index)];
      preview(gesture.current.original);
    }
    target.setPointerCapture?.(event.pointerId);
    optionsRef.current.setCameraControlsEnabled(false);
    publish({ dragging: true, feedback: '', error: null });
    event.preventDefault(); event.stopPropagation();
  };
  const pointerMove = (event: PointerEvent) => {
    lastPointer.current = event;
    const raw = ground(event);
    if (!raw) return;
    const g = gesture.current, s = stateRef.current;
    if (g && event.pointerId !== g.pointerId) return;
    if (g?.kind === 'vertex') {
      const original = g.original[g.vertex!];
      const p = snapPoint({ x: original.x + raw.x - g.start.x, y: 0, z: original.z + raw.z - g.start.z }, event, original);
      preview(g.original.map((v, i) => i === g.vertex ? p : v));
      publish({ cursor: p });
    } else if (g?.kind === 'move') {
      // Snap the centroid, so the grab offset cannot change the resulting transform.
      const c = { x: g.pivot.x + raw.x - g.start.x, y: 0, z: g.pivot.z + raw.z - g.start.z };
      const p = snapPoint(c, event, g.pivot);
      const dx = p.x - g.pivot.x, dz = p.z - g.pivot.z;
      preview(translateFootprint(g.original, dx, dz));
      publish({ cursor: p });
      publish({ feedback: `ΔX ${dx.toFixed(2)} m · ΔZ ${dz.toFixed(2)} m` });
    } else if (g?.kind === 'rotate') {
      let angle = Math.atan2(raw.z - g.pivot.z, raw.x - g.pivot.x) - Math.atan2(g.start.z - g.pivot.z, g.start.x - g.pivot.x);
      angle = snapRotation(angle, event);
      preview(rotateFootprint(g.original, angle, g.pivot));
      publish({ feedback: `${(angle * 180 / Math.PI).toFixed(1)}°` });
    } else if (s.tool === 'polygon' || s.tool === 'rectangle') {
      const cursor = snapPoint(raw, event, s.points[s.points.length - 1]);
      const candidate = s.tool === 'rectangle' && s.points[0] ? rectangle(s.points[0], cursor) : [...s.points, cursor];
      publish({ cursor, insertion: null, error: candidate.length >= 3 && stateRef.current.snap?.kind !== 'Close' ? validateFootprint(candidate, otherFootprints()) : null });
    } else if (!g && s.tool === 'reshape') {
      const rect = optionsRef.current.containerRef.current!.getBoundingClientRect();
      const mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const candidates = points().map((p, i, all) => {
        const q = all[(i + 1) % all.length];
        const nearest = nearestOnSegment(mouse, project(p), project(q));
        return { ...nearest, index: i + 1, world: { x: p.x + nearest.t * (q.x - p.x), y: 0, z: p.z + nearest.t * (q.z - p.z) } };
      }).filter(c => c.distance < 10 && c.t > 0.04 && c.t < 0.96).sort((a, b) => a.distance - b.distance);
      const c = candidates[0];
      publish({ insertion: c ? { index: c.index, point: c.world } : null });
    }
  };
  const pointerDown = (event: PointerEvent) => {
    if (!optionsRef.current.enabled || event.button !== 0 || space.current) return;
    const s = stateRef.current;
    if (s.tool === 'polygon' || s.tool === 'rectangle') startGesture(event, 'draw');
    else if (s.tool === 'move' && selectedId.current) {
      const p = ground(event), polygon = points();
      let inside = false;
      if (p) polygon.forEach((a, i) => {
        const b = polygon[(i + 1) % polygon.length];
        if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
      });
      startGesture(event, inside ? 'move' : 'select');
    }
    else startGesture(event, 'select');
  };
  const pointerUp = (event: PointerEvent) => {
    const g = gesture.current;
    if (!g) {
      if (before.current && document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'range') commit();
      return;
    }
    if (g.pointerId !== event.pointerId) return;
    pointerMove(event); // Flush the final pointer position before committing, including a pending RAF.
    const s = stateRef.current;
    const moved = Math.hypot(event.clientX - g.screen.x, event.clientY - g.screen.y) > 3;
    if (g.kind === 'vertex' && !moved && g.original.length === before.current?.find(b => b.id === selectedId.current)?.points.length) {
      cancel(); return;
    }
    if (g.kind === 'draw') {
      release();
      const p = s.cursor ?? ground(event);
      if (!p) return;
      if (s.tool === 'rectangle') {
        if (s.points.length) create(rectangle(s.points[0], p));
        else if (moved) create(rectangle(g.start, p));
        else publish({ points: [p] });
      } else if (s.snap?.kind === 'Close') finish();
      else if (!moved && !s.points.some(v => Math.hypot(v.x - p.x, v.z - p.z) < 1e-8)) { drawingRedo.current = []; publish({ points: [...s.points, p], error: null }); }
    } else if (g.kind === 'select') {
      release();
      if (moved) return;
      const o = optionsRef.current, camera = o.getCamera(), rect = o.containerRef.current?.getBoundingClientRect();
      if (!camera || !rect) return;
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
      const hit = ray.intersectObjects(o.getBuildings().map(b => b.mesh), false)[0];
      select(hit ? o.getBuildings().find(b => b.mesh === hit.object) ?? null : null);
    } else if (g.invalid) {
      const error = g.invalid;
      cancel(); publish({ error: `${error} Change reverted.` });
    } else { release(); commit(g.kind === 'vertex' ? 'Reshape footprint' : `${g.kind === 'move' ? 'Move' : 'Rotate'} building`); }
  };
  const apiRef = useRef({ pointerDown, pointerMove, pointerUp, cancel, escape, travel, remove, finish });
  useLayoutEffect(() => { apiRef.current = { pointerDown, pointerMove, pointerUp, cancel, escape, travel, remove, finish }; });

  useEffect(() => {
    const element = optionsRef.current.containerRef.current;
    if (!element || !optionsRef.current.enabled) return;
    let frame: number | null = null;
    let latest: PointerEvent | null = null;
    const down = (e: PointerEvent) => apiRef.current.pointerDown(e);
    const move = (e: PointerEvent) => {
      if (!gesture.current && (!(e.target instanceof Node) || !element.contains(e.target)) && !(e.target instanceof Element && e.target.closest('[data-editor-overlay]'))) return;
      latest = e;
      if (frame !== null) return;
      frame = requestAnimationFrame(() => { frame = null; if (latest) apiRef.current.pointerMove(latest); latest = null; });
    };
    const flush = () => { if (frame !== null) cancelAnimationFrame(frame); frame = null; latest = null; };
    const up = (e: PointerEvent) => { flush(); apiRef.current.pointerUp(e); };
    const abort = () => { flush(); apiRef.current.cancel(); space.current = false; optionsRef.current.setSpacePan(false); };
    const lost = () => { if (gesture.current) abort(); };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); apiRef.current.escape(); return; }
      const bufferedInput = isInput(e.target) && !(e.target instanceof HTMLInputElement && ['range', 'checkbox'].includes(e.target.type));
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !bufferedInput) {
        e.preventDefault(); apiRef.current.travel(e.shiftKey); return;
      }
      if (isInput(e.target)) return;
      if (e.code === 'Space') { e.preventDefault(); space.current = true; optionsRef.current.setSpacePan(true); }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); apiRef.current.remove(); }
      else if (e.key === 'Enter' && ['polygon', 'rectangle'].includes(stateRef.current.tool)) { e.preventDefault(); apiRef.current.finish(); }
    };
    const keyUp = (e: KeyboardEvent) => { if (e.code === 'Space') { space.current = false; optionsRef.current.setSpacePan(false); } };
    const context = (e: Event) => e.preventDefault();
    element.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', abort);
    window.addEventListener('lostpointercapture', lost);
    window.addEventListener('blur', abort);
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', keyUp);
    element.addEventListener('contextmenu', context);
    return () => {
      flush(); apiRef.current.cancel();
      element.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', abort); window.removeEventListener('lostpointercapture', lost);
      window.removeEventListener('blur', abort); window.removeEventListener('keydown', key); window.removeEventListener('keyup', keyUp);
      element.removeEventListener('contextmenu', context);
    };
  }, [options.containerRef, options.enabled]);

  // Projection tracks the live camera; it never owns or changes geometry.
  useEffect(() => {
    if (!optionsRef.current.enabled) return;
    let frame = 0, previous = '', previousCamera = '';
    const tick = () => {
      const s = stateRef.current;
      const drawing = s.tool === 'polygon' || s.tool === 'rectangle';
      const camera = optionsRef.current.getCamera();
      const cameraKey = camera ? `${camera.matrixWorld.elements.join(',')}:${camera.projectionMatrix.elements.join(',')}` : '';
      if (cameraKey !== previousCamera && lastPointer.current && !gesture.current && (drawing || s.tool === 'reshape')) apiRef.current.pointerMove(lastPointer.current);
      previousCamera = cameraKey;
      const pts = drawing ? (s.tool === 'rectangle' && s.points[0] && s.cursor ? rectangle(s.points[0], s.cursor) : s.points) : gesture.current?.candidate ?? optionsRef.current.edit.getDraft()?.points ?? [];
      const guide = s.snap?.kind === 'Align X' ? [-200, 200].map(z => project({ ...s.snap!.point, z: s.snap!.point.z + z })) :
        s.snap?.kind === 'Align Z' ? [-200, 200].map(x => project({ ...s.snap!.point, x: s.snap!.point.x + x })) : [];
      const next = { guide, points: pts.map(project), cursor: s.cursor ? project(s.cursor) : null, insertion: s.insertion ? project(s.insertion.point) : null, pivot: pts.length >= 3 ? project(gesture.current?.pivot ?? centroid(pts)) : null };
      const signature = JSON.stringify(next);
      if (signature !== previous) { previous = signature; setProjection(next); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [options.enabled]);

  useEffect(() => {
    const o = optionsRef.current;
    if (selectedId.current && !o.edit.draft && o.getBuilding(selectedId.current)) o.edit.open(selectedId.current);
  }, [options.edit.draft, options.edit.open, options.getBuilding]);

  return {
    state, projection, plan, view, activate, select, finish, cancel, remove, escape, deleteSelectedBuilding,
    ortho, setOrtho: (value: boolean) => { orthoRef.current = value; setOrtho(value); publish({ snap: null }); },
    gridStep, setGridStep, historyVersion, canUndo: history.current.canUndo || state.points.length > 0, canRedo: history.current.canRedo || drawingRedo.current.length > 0,
    undo: () => travel(false), redo: () => travel(true),
    reset: () => { select(null); history.current.clear(); refreshHistory(n => n + 1); },
    // Capture on the persistent canvas container, including insertion controls that disappear during a drag.
    handlePointer: (event: React.PointerEvent, kind: 'vertex' | 'rotate' | 'move', index?: number, insertion?: Point3D) => {
      startGesture(event.nativeEvent, kind, index, insertion);
    },
    selectVertex: (vertex: number) => publish({ vertex, error: null }),
    insert: (index: number, point: Point3D) => { const p = points(); applyPoints([...p.slice(0, index), point, ...p.slice(index)], 'Insert point'); publish({ vertex: index }); },
    setVertex: (axis: 'x' | 'z', value: number) => { const i = stateRef.current.vertex; if (i !== null) applyPoints(points().map((p, j) => j === i ? { ...p, [axis]: value } : p), 'Position point'); },
    setCentroid: (axis: 'x' | 'z', value: number) => { const c = centroid(points()); applyPoints(translateFootprint(points(), axis === 'x' ? value - c.x : 0, axis === 'z' ? value - c.z : 0), 'Position building'); },
    rotateBy: (degrees: number) => applyPoints(rotateFootprint(points(), degrees * Math.PI / 180), 'Rotate building'),
    beginProperty: begin,
    changeProperty: (draft: BuildingEditDraft, immediate = false) => { begin(); optionsRef.current.edit.updateDraft(draft); if (immediate) commit(); },
    commitProperty: () => commit(),
  };
}
export type WorkspaceEditor = ReturnType<typeof useWorkspaceEditor>;
