import { Select } from '@react-three/drei/web/Select'
import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, type Object3D } from 'three'
import { BoxPickBvh } from '../pick/BoxPickBvh'
import { useTwinStore } from '../../store/store'
import {
  deskIdsFromBoxSelection,
  engageCameraDragLock,
  floorPickProxies,
  releaseCameraDragLock,
  shouldSuspendCameraDrag,
  type BoxSelectHit,
  type CameraDragLock,
} from './boxSelect'
import { EMPTY_BOX_IDS, useBoxSelectStore } from './boxSelectStore'

const proxyGeometry = new BoxGeometry(0.35, 0.35, 0.35)
proxyGeometry.computeBoundingSphere()
const proxyMaterial = new MeshBasicMaterial({ visible: false, depthWrite: false, toneMapped: false })

function ignoreRaycast() {}

function DeskPickProxies({ proxies }: { proxies: ReturnType<typeof floorPickProxies> }) {
  const group = useRef<Group>(null)
  const retire = useRef<Mesh[]>([])
  useLayoutEffect(() => {
    const parent = group.current
    if (!parent) return
    const created: Mesh[] = []
    for (const proxy of proxies) {
      const mesh = new Mesh(proxyGeometry, proxyMaterial)
      mesh.name = 'DeskPickProxy'
      mesh.position.set(proxy.x, 0.4, proxy.z)
      mesh.visible = false
      mesh.raycast = ignoreRaycast
      mesh.userData = { boxPickProxy: true, deskId: proxy.deskId, instanceIndex: proxy.instanceIndex }
      parent.add(mesh)
      created.push(mesh)
    }
    parent.updateMatrixWorld(true)
    return () => {
      // 先留在组里。Bvh 的卸载 effect 还要 traverse 到这些网格，layout 里摘掉就卸不掉树。
      retire.current.push(...created)
    }
  }, [proxies])
  useEffect(() => {
    return () => {
      const stale = retire.current.splice(0, retire.current.length)
      for (const mesh of stale) mesh.removeFromParent()
    }
  }, [proxies])
  return <group ref={group} name="DeskPickProxies" />
}

function swallowPointer(event: { stopPropagation: () => void }) {
  event.stopPropagation()
}

function keepBoxProxies(selected: Object3D[]): Object3D[] {
  return selected.filter((object) => (object as BoxSelectHit).userData?.boxPickProxy === true)
}

/**
 * Shift 拖框期间先关掉 CameraControls，避免画布上的 pointerdown 先开始旋转或平移。
 * drei Select 在 document 冒泡里也会写 controls.enabled，松手时它按挂载时的值恢复。
 * 这里在捕获阶段提前关掉，并在 window 冒泡（晚于 document）把本次接管的锁放开。
 */
function useSuspendCameraDrag() {
  const controls = useThree((state) => state.controls)
  const gl = useThree((state) => state.gl)

  useEffect(() => {
    const canvas = gl.domElement
    const rig = controls as CameraDragLock | null
    let engaged = false
    const onDown = (event: PointerEvent) => {
      if (!shouldSuspendCameraDrag(event, canvas)) return
      engaged = engageCameraDragLock(rig) || engaged
    }
    const onUp = () => {
      if (!engaged) return
      releaseCameraDragLock(rig, engaged)
      engaged = false
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointerup', onUp, false)
    window.addEventListener('pointercancel', onUp, false)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointerup', onUp, false)
      window.removeEventListener('pointercancel', onUp, false)
      releaseCameraDragLock(rig, engaged)
    }
  }, [controls, gl])
}

/**
 * 进层后的工位框选。
 * 不把 WorkstationDesks 放进 Select：那是 InstancedMesh，SelectionBox 只会碰到整网的包围球心。
 * 每张工位一个不可见代理，userData.deskId 对回实例序号。描边仍由 T036 的可挂 mesh 画。
 */
export function DeskBoxSelect({ floorId }: { floorId: string }) {
  const desks = useTwinStore((state) => state.desks)
  const selectedIds = useBoxSelectStore((state) => (state.floorId === floorId ? state.deskIds : EMPTY_BOX_IDS))
  const proxies = useMemo(() => floorPickProxies(floorId, desks), [desks, floorId])
  useSuspendCameraDrag()

  const commit = useCallback(
    (selected: Object3D[]) => {
      useBoxSelectStore.getState().setBoxSelection(floorId, deskIdsFromBoxSelection(selected))
    },
    [floorId],
  )

  useEffect(() => {
    window.__twinBoxSelect = {
      floorId,
      proxies: proxies.length,
      deskIds: [...selectedIds],
    }
    return () => {
      if (window.__twinBoxSelect?.floorId === floorId) delete window.__twinBoxSelect
    }
  }, [floorId, proxies.length, selectedIds])

  useEffect(() => {
    return () => {
      useBoxSelectStore.getState().clearBoxSelection(floorId)
    }
  }, [floorId])

  if (proxies.length === 0) return null
  const version = proxies.map((proxy) => proxy.deskId).join('\n')
  return (
    <Select
      name="DeskBoxSelect"
      box
      multiple
      filter={keepBoxProxies}
      onChange={commit}
      onChangePointerUp={commit}
      onClick={swallowPointer}
      onPointerMissed={swallowPointer}
    >
      <BoxPickBvh version={version}>
        <DeskPickProxies proxies={proxies} />
      </BoxPickBvh>
    </Select>
  )
}
