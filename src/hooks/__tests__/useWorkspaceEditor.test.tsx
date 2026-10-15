import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { useBuildingManager } from '../useBuildingManager';
import { useBuildingEditSession } from '../useBuildingEditSession';
import { useWorkspaceEditor } from '../useWorkspaceEditor';
import { WindowService } from '../../services/WindowService';
import { buildFacadeLayout, getBuildingFacadeParameters } from '../../services/FacadeGeometry';
import type { Point3D } from '../../types/building';
const footprint = [{x:-5,y:0,z:-5},{x:5,y:0,z:-5},{x:5,y:0,z:5},{x:-5,y:0,z:5}];
const config = { floors: 3, floorHeight: 3.5, color: 0xeeeeee, window_to_wall_ratio: .4 };
function setup() {
  const element = document.createElement('div'); document.body.append(element);
  element.getBoundingClientRect = () => ({left:0,top:0,width:800,height:800,right:800,bottom:800,x:0,y:0,toJSON:()=>({})});
  const capture = new Set<number>();
  element.setPointerCapture = id => {capture.add(id)}; element.hasPointerCapture = id => capture.has(id); element.releasePointerCapture = id => {capture.delete(id)};
  const containerRef = {current: element};
  const scene = new THREE.Scene();
  const windows = new WindowService(scene, {windowWidth:1.2,windowHeight:1.5,windowSpacing:0,offsetDistance:.1,frameThickness:.05,maxWindows:5000});
  const camera = new THREE.OrthographicCamera(-20,20,20,-20,.1,1000);
  camera.position.set(0,80,.0001); camera.lookAt(0,0,0); camera.updateMatrixWorld();
  const controls = vi.fn();
  const {result,unmount} = renderHook(() => {
    const manager=useBuildingManager(scene,null,windows);
    const edit=useBuildingEditSession(manager);
    const editor=useWorkspaceEditor({containerRef,enabled:true,getCamera:()=>camera,setPlanMode:vi.fn(),setSpacePan:vi.fn(),setCameraControlsEnabled:controls,edit,...manager,config,grid:false,onChange:vi.fn(),onSelect:vi.fn()});
    return {manager,edit,editor};
  });
  act(() => {const building=result.current.manager.createBuilding(footprint,config)!;result.current.editor.select(building)});
  const screen=(p:Point3D) => {const v=new THREE.Vector3(p.x,p.y,p.z).project(camera);return {clientX:(v.x+1)*400,clientY:(1-v.y)*400}};
  const event=(type:string,p:Point3D) => Object.assign(new MouseEvent(type,{bubbles:true,button:0,...screen(p)}),{pointerId:1}) as PointerEvent;
  const start=(i=0) => act(() => {result.current.editor.handlePointer({nativeEvent:event('pointerdown',result.current.edit.draft!.points[i])} as React.PointerEvent,'vertex',i)});
  const move=(p:Point3D) => act(() => {element.dispatchEvent(event('pointermove',p));vi.advanceTimersByTime(32)});
  const up=(p:Point3D) => act(() => {window.dispatchEvent(event('pointerup',p))});
  return {result,controls,start,move,up,element,event,cleanup:()=>{unmount();windows.dispose();element.remove()}};
}
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers()});
describe('workspace interaction ownership',()=>{
  it('finishes a rectangle on the second click after the preview has rendered', () => {
    const h = setup();
    act(() => h.result.current.editor.activate('rectangle'));
    const a = { x: -15, y: 0, z: -15 }, b = { x: -8, y: 0, z: -9 };
    const click = (p: Point3D) => act(() => {
      h.element.dispatchEvent(h.event('pointerdown', p));
      window.dispatchEvent(h.event('pointerup', p));
    });
    click(a); h.move(b); click(b);
    expect(h.result.current.manager.getBuildings()).toHaveLength(2);
    expect(h.result.current.editor.state.tool).toBe('reshape');
    expect(h.result.current.edit.draft?.points).toHaveLength(4);
    h.cleanup();
  });

  it('defaults Ortho off, constrains drawn segments when enabled, and guards diagonal closure', () => {
    const h = setup();
    expect(h.result.current.editor.ortho).toBe(false);
    act(() => { h.result.current.editor.activate('polygon'); h.result.current.editor.setOrtho(true); });
    const click = (p: Point3D) => act(() => {
      h.element.dispatchEvent(h.event('pointerdown', p)); window.dispatchEvent(h.event('pointerup', p));
    });
    click({x:-15,y:0,z:-15}); click({x:-8,y:0,z:-13});
    expect(h.result.current.editor.state.points[1].z).toBeCloseTo(-15);
    click({x:-7,y:0,z:-8});
    act(() => h.result.current.editor.finish());
    expect(h.result.current.editor.state.error).toMatch(/90°/);
    expect(h.result.current.manager.getBuildings()).toHaveLength(1);
    h.cleanup();
  });

  it('commits one drag once, keeps the final pointer, and restores every layer on undo/redo',()=>{
    const h=setup();
    const before=h.result.current.manager.captureSnapshot();
    h.start();h.move({x:-7,y:0,z:-5});h.move({x:-8,y:0,z:-5});h.up({x:-9,y:0,z:-5});
    const after=h.result.current.manager.captureSnapshot();
    expect(after[0].points[0].x).toBeCloseTo(-9);
    expect(h.result.current.editor.canUndo).toBe(true);
    act(()=>h.result.current.editor.undo());
    expect(h.result.current.manager.captureSnapshot()).toEqual(before);
    expect(h.result.current.editor.canUndo).toBe(false);
    expect(h.result.current.edit.draft).not.toBeNull();
    act(()=>h.result.current.editor.redo());
    expect(h.result.current.manager.captureSnapshot()).toEqual(after);
    expect(h.controls).toHaveBeenLastCalledWith(true);
    h.cleanup();
  });
  it('restores the starting solid and skips history when a drag returns to its origin', () => {
    const h = setup(), before = h.result.current.manager.captureSnapshot();
    const origin = before[0].points[0];
    h.start(); h.move({ ...origin, x: origin.x - 3 }); h.up(origin);
    expect(h.result.current.manager.captureSnapshot()).toEqual(before);
    expect(h.result.current.editor.canUndo).toBe(false);
    const mesh = h.result.current.manager.getBuildings()[0].mesh;
    mesh.geometry.computeBoundingBox();
    expect(mesh.geometry.boundingBox!.max.x - mesh.geometry.boundingBox!.min.x).toBeCloseTo(10);
    h.cleanup();
  });

  it.each(['escape','pointercancel','blur','lostpointercapture'])('rolls back on %s, including a queued preview',kind=>{
    const h=setup(),before=h.result.current.manager.captureSnapshot();
    h.start();h.move({x:-8,y:0,z:-6});
    act(()=>window.dispatchEvent(kind==='escape'?new KeyboardEvent('keydown',{key:'Escape'}):new Event(kind)));
    act(()=>vi.advanceTimersByTime(32));
    expect(h.result.current.manager.captureSnapshot()).toEqual(before);
    expect(h.result.current.edit.draft?.points).toEqual(before[0].points);
    expect(h.result.current.editor.canUndo).toBe(false);
    expect(h.controls).toHaveBeenLastCalledWith(true);
    h.cleanup();
  });
  it('retains a valid solid during an invalid preview and rejects the whole gesture',()=>{
    const h=setup(),before=h.result.current.manager.captureSnapshot();
    h.start();h.move({x:-8,y:0,z:-5});h.move({x:5,y:0,z:5});h.up({x:5,y:0,z:5});
    expect(h.result.current.manager.captureSnapshot()).toEqual(before);
    expect(h.result.current.editor.state.error).toMatch(/reverted/);
    expect(h.result.current.editor.canUndo).toBe(false);h.cleanup();
  });
  it('lets buildings touch but reverts edits that overlap a neighbour',()=>{
    const h=setup();
    act(()=>{h.result.current.manager.createBuilding(footprint.map(p=>({...p,x:p.x+10})),config)});
    expect(h.result.current.manager.getBuildings()).toHaveLength(2);
    const before=h.result.current.manager.captureSnapshot();
    h.start(1);h.move({x:8,y:0,z:-5});h.up({x:8,y:0,z:-5});
    expect(h.result.current.manager.captureSnapshot()).toEqual(before);
    expect(h.result.current.editor.state.error).toMatch(/overlap another building.*reverted/i);
    act(()=>h.result.current.editor.setCentroid('x',3));
    expect(h.result.current.manager.captureSnapshot()).toEqual(before);
    expect(h.result.current.editor.state.error).toMatch(/overlap another building/i);
    expect(h.result.current.editor.canUndo).toBe(false);
    expect(()=>h.result.current.manager.createBuilding(footprint.map(p=>({...p,x:p.x+4})),config)).toThrow(/overlap another building/i);
    h.cleanup();
  });
  it('keeps rotation and property changes independent, preserves facade counts, and scopes deletion',()=>{
    const h=setup();
    act(()=>h.result.current.manager.createBuilding(footprint.map(p=>({...p,x:p.x+20})),config));
    const before=h.result.current.manager.captureSnapshot();
    const count=(m:typeof before[0])=>buildFacadeLayout(m.points,m.floors,m.floorHeight,getBuildingFacadeParameters(m)).apertures.length;
    act(()=>h.result.current.editor.rotateBy(37));
    const rotated=h.result.current.manager.captureSnapshot();
    expect(rotated[0].metrics.footprintArea).toBeCloseTo(before[0].metrics.footprintArea,8);
    expect(count(rotated[0])).toBe(count(before[0]));
    expect(rotated[1]).toEqual(before[1]);
    act(()=>{h.result.current.editor.changeProperty({...h.result.current.edit.draft!,floors:8});h.result.current.editor.commitProperty()});
    expect(h.result.current.manager.getBuildings()[0].floors).toBe(8);
    act(()=>h.result.current.editor.undo());
    expect(h.result.current.manager.getBuildings()[0].floors).toBe(3);
    act(()=>h.result.current.editor.remove());
    expect(h.result.current.manager.getBuildings()).toHaveLength(1);
    act(()=>h.result.current.editor.undo());
    expect(h.result.current.manager.getBuildings()).toHaveLength(2);
    act(()=>h.result.current.editor.reset());
    expect(h.result.current.editor.canUndo).toBe(false);expect(h.result.current.editor.canRedo).toBe(false);
    h.cleanup();
  });
});
