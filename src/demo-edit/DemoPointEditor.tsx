import { TransformControls } from '@react-three/drei/core/TransformControls'
import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Mesh, MeshBasicMaterial } from 'three'
import { SphereGeometry } from './gizmoLeaves'
import type { TransformControls as TransformControlsImpl } from 'three-stdlib'
import { isFloorId, floorSpec } from '../data/floors'
import { SLAB_M } from '../scene/stage/cut'
import { useTwinStore } from '../store/store'
import {
  addAnchor,
  anchorDrafts,
  anchorMountY,
  anchorTableJson,
  anchorsOnFloor,
  commitAnchorDrag,
  downloadAnchorTable,
  getAnchorSession,
  resolveSelectedId,
  selectAnchor,
  setAnchorCatalog,
  setEditMode,
  subscribeAnchorSession,
  type AnchorDraft,
} from './anchors'
import css from './demoEdit.css?inline'

/**
 * T058 摆点。只在 `?demoEdit=1` 的懒包里挂 drei TransformControls。
 * 镜头已经是画布上的默认控制器，拖手柄时 drei 会暂时停掉相机。
 * 镜头控制器在按下的瞬间就开始拖。命中手柄时先在捕获阶段接住，
 * 这一笔才不会同时转镜头。这个手柄不接管默认控制器，也不写镜头阻尼。
 */
const MARK_RADIUS = 0.48

type GizmoHandle = {
  domElement: HTMLElement | null
  axis: string | null
  pointerHover: (pointer: { x: number; y: number; button: number }) => void
  onPointerDown: (event: PointerEvent) => void
}

function DemoEditPanel() {
  const session = useSyncExternalStore(subscribeAnchorSession, getAnchorSession)
  const view = useTwinStore((state) => state.view)
  const floor = useTwinStore((state) => state.selectedFloor)
  const exploded = useTwinStore((state) => state.exploded)
  const floorId = view === 'floor' && floor && isFloorId(floor) ? floor : ''
  const selectedId = floorId ? resolveSelectedId(floorId, session.catalog, session.selectedId) : null
  const json = anchorTableJson()
  const place = exploded ? '收起爆炸后再摆点' : floorId ? `${floorId} · ${selectedId ?? '这一层还没有点'}` : '进入楼层后摆点'

  return (
    <aside className="demo-edit" data-demo-edit="" aria-label="DEMO 摆点">
      <p className="demo-edit-kicker">DEMO</p>
      <h2>摆点</h2>
      <div className="demo-edit-row" role="group" aria-label="锚点目录">
        <button type="button" aria-pressed={session.catalog === 'cameras-demo'} onClick={() => setAnchorCatalog('cameras-demo')}>
          摄像头
        </button>
        <button type="button" aria-pressed={session.catalog === 'alarms-demo'} onClick={() => setAnchorCatalog('alarms-demo')}>
          告警
        </button>
      </div>
      <div className="demo-edit-row" role="group" aria-label="变换">
        <button type="button" aria-pressed={session.mode === 'translate'} onClick={() => setEditMode('translate')}>
          平移
        </button>
        <button
          type="button"
          aria-pressed={session.mode === 'rotate'}
          disabled={session.catalog !== 'cameras-demo'}
          onClick={() => setEditMode('rotate')}
        >
          朝向
        </button>
      </div>
      <p className="demo-edit-status">{place}</p>
      <div className="demo-edit-row">
        <button type="button" disabled={!floorId || exploded} onClick={() => floorId && addAnchor(floorId)}>
          在本层加一点
        </button>
        <button type="button" className="demo-edit-export" onClick={() => downloadAnchorTable()}>
          导出 JSON
        </button>
      </div>
      <textarea readOnly spellCheck={false} aria-label="锚点表 JSON" value={json} />
      <p className="demo-edit-note">拖动手柄时相机会停住。JSON 写出 cameras-demo 和 alarms-demo 两张锚点表。</p>
    </aside>
  )
}

function AnchorMarker({
  anchor,
  mountY,
  selected,
  geometry,
  idle,
  hot,
  register,
}: {
  anchor: AnchorDraft
  mountY: number
  selected: boolean
  geometry: SphereGeometry
  idle: MeshBasicMaterial
  hot: MeshBasicMaterial
  register: (id: string, node: Mesh | null) => void
}) {
  const ref = useRef<Mesh>(null)
  const setRef = useCallback(
    (node: Mesh | null) => {
      ref.current = node
      register(anchor.id, node)
    },
    [anchor.id, register],
  )
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    mesh.position.set(anchor.x, mountY, anchor.z)
    mesh.rotation.set(0, anchor.heading ?? 0, 0)
    mesh.userData.mountY = mountY
    mesh.userData.id = anchor.id
  }, [anchor.heading, anchor.id, anchor.x, anchor.z, mountY])

  return (
    <mesh
      ref={setRef}
      name="DemoEditAnchor"
      geometry={geometry}
      material={selected ? hot : idle}
      dispose={null}
      castShadow={false}
      receiveShadow={false}
      renderOrder={8}
      userData={{ demo: true, catalog: anchor.catalog, id: anchor.id, floorId: anchor.floorId, mountY }}
      onClick={(event) => {
        event.stopPropagation()
        selectAnchor(anchor.id)
      }}
    />
  )
}

function DemoEditRig() {
  const invalidate = useThree((state) => state.invalidate)
  const session = useSyncExternalStore(subscribeAnchorSession, getAnchorSession)
  const floor = useTwinStore((state) => state.selectedFloor)
  const view = useTwinStore((state) => state.view)
  const exploded = useTwinStore((state) => state.exploded)
  const floorId = view === 'floor' && floor && isFloorId(floor) && !exploded ? floor : ''
  const markers = floorId ? anchorsOnFloor(floorId, session.catalog) : []
  const selectedId = floorId ? resolveSelectedId(floorId, session.catalog, session.selectedId) : null
  const refs = useRef(new Map<string, Mesh>())
  const controlsRef = useRef<TransformControlsImpl | null>(null)
  const register = useCallback((id: string, node: Mesh | null) => {
    if (node) refs.current.set(id, node)
    else refs.current.delete(id)
  }, [])
  const [attached, setAttached] = useState<Mesh | null>(null)
  const attachedRef = useRef<Mesh | null>(null)
  const modeRef = useRef(session.mode)
  modeRef.current = session.mode
  attachedRef.current = attached

  const geometry = useMemo(() => new SphereGeometry(MARK_RADIUS, 16, 12), [])
  const cameraIdle = useMemo(() => new MeshBasicMaterial({ color: '#3df0ff', toneMapped: false, fog: false }), [])
  const cameraHot = useMemo(() => new MeshBasicMaterial({ color: '#ffe08a', toneMapped: false, fog: false }), [])
  const alarmIdle = useMemo(() => new MeshBasicMaterial({ color: '#ff4d4f', toneMapped: false, fog: false }), [])
  const alarmHot = useMemo(() => new MeshBasicMaterial({ color: '#ffd0a6', toneMapped: false, fog: false }), [])
  const idle = session.catalog === 'cameras-demo' ? cameraIdle : alarmIdle
  const hot = session.catalog === 'cameras-demo' ? cameraHot : alarmHot
  const mountY = anchorMountY(session.catalog)

  useLayoutEffect(() => {
    return () => {
      geometry.dispose()
      cameraIdle.dispose()
      cameraHot.dispose()
      alarmIdle.dispose()
      alarmHot.dispose()
    }
  }, [alarmHot, alarmIdle, cameraHot, cameraIdle, geometry])

  useLayoutEffect(() => {
    setAttached(selectedId ? (refs.current.get(selectedId) ?? null) : null)
  }, [markers.length, selectedId, session.revision, floorId])

  useLayoutEffect(() => {
    if (!floorId) {
      delete window.__twinDemoEdit
      return
    }
    const rows = anchorDrafts()
    window.__twinDemoEdit = {
      demo: true,
      floorId,
      catalog: session.catalog,
      mode: session.mode,
      selectedId,
      cameraCount: rows.filter((row) => row.catalog === 'cameras-demo' && row.floorId === floorId).length,
      alarmCount: rows.filter((row) => row.catalog === 'alarms-demo' && row.floorId === floorId).length,
      gizmo: Boolean(controlsRef.current),
    }
    invalidate()
    return () => {
      if (window.__twinDemoEdit?.floorId === floorId) delete window.__twinDemoEdit
    }
  }, [attached, floorId, invalidate, selectedId, session.catalog, session.mode, session.revision])

  useLayoutEffect(() => {
    const controls = controlsRef.current as GizmoHandle | null
    const dom = controls?.domElement
    if (!controls || !dom) return
    const claimHandle = (event: PointerEvent) => {
      if (event.button !== 0) return
      const rect = dom.getBoundingClientRect()
      const width = rect.width || 1
      const height = rect.height || 1
      controls.pointerHover({
        x: ((event.clientX - rect.left) / width) * 2 - 1,
        y: -((event.clientY - rect.top) / height) * 2 + 1,
        button: event.button,
      })
      if (controls.axis == null) return
      event.stopPropagation()
      controls.onPointerDown(event)
    }
    dom.addEventListener('pointerdown', claimHandle, true)
    return () => dom.removeEventListener('pointerdown', claimHandle, true)
  }, [attached])

  const onObjectChange = useCallback(() => {
    const mesh = attachedRef.current
    if (!mesh) return
    const nextY = mesh.userData.mountY
    if (typeof nextY === 'number') mesh.position.y = nextY
  }, [])

  const onMouseUp = useCallback(() => {
    const mesh = attachedRef.current
    const id = mesh?.userData.id
    if (!mesh || typeof id !== 'string') return
    const nextY = mesh.userData.mountY
    if (typeof nextY === 'number') mesh.position.y = nextY
    commitAnchorDrag(id, mesh.position.x, mesh.position.z, mesh.rotation.y, modeRef.current === 'rotate')
    invalidate()
  }, [invalidate])

  if (!floorId) return null
  const baseY = floorSpec(floorId).elevation + SLAB_M

  return (
    <>
      <group name="DemoEditAnchors" position={[0, baseY, 0]}>
        {markers.map((anchor) => (
          <AnchorMarker
            key={anchor.id}
            anchor={anchor}
            mountY={mountY}
            selected={anchor.id === selectedId}
            geometry={geometry}
            idle={idle}
            hot={hot}
            register={register}
          />
        ))}
      </group>
      {attached ? (
        <TransformControls
          ref={controlsRef}
          object={attached}
          mode={session.mode}
          space={session.mode === 'rotate' ? 'local' : 'world'}
          showX={session.mode !== 'rotate'}
          showY={session.mode === 'rotate'}
          showZ={session.mode !== 'rotate'}
          onObjectChange={onObjectChange}
          onMouseUp={onMouseUp}
        />
      ) : null}
    </>
  )
}

export function DemoPointEditor() {
  useEffect(() => {
    const stage = document.querySelector('.stage')
    if (!stage) return
    const host = document.createElement('div')
    host.dataset.demoEdit = '1'
    stage.appendChild(host)
    const style = document.createElement('style')
    style.dataset.demoEdit = '1'
    style.textContent = css
    document.head.appendChild(style)
    const root: Root = createRoot(host)
    root.render(<DemoEditPanel />)
    return () => {
      root.unmount()
      host.remove()
      style.remove()
    }
  }, [])

  return <DemoEditRig />
}
