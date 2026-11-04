import { MeshDiscardMaterial } from '@react-three/drei/core/MeshDiscardMaterial'
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import type { ShaderMaterial } from 'three'
import { releaseDiscardProxies, syncDiscardProxies } from './apply'
import { publishDiscardProxy } from './probe'

/** 打进懒包，生产构建用它确认 drei 材质没有被裁掉。 */
export const DISCARD_PROXY_IMPL = 'drei-MeshDiscardMaterial'

/** 宿主不参与拾取。代理自己的 raycast 仍由框选和 BVH 管。 */
function ignoreHostRaycast() {
  // 不往 intersects 里推。
}

/**
 * T115：已钉版本的 MeshDiscardMaterial。
 * 材质克隆到 DeskPickProxies 里的 boxPickProxy 上，不写颜色、不写深度。
 * 宿主是一毫米盒子且不可见，包围盒有限，避免空几何把场景盒撑成无穷，也不让空顶点着色器进主相机。
 * 不注册逐帧回调，demand 停住之后不续帧。
 */
export function DiscardProxy() {
  const scene = useThree((state) => state.scene)
  const materialRef = useRef<ShaderMaterial>(null)

  useLayoutEffect(() => {
    let stop = false
    const run = () => {
      if (stop) return
      const material = materialRef.current
      if (!material) return
      const count = syncDiscardProxies(scene, material)
      publishDiscardProxy(true, true, count)
    }
    run()
    const id = window.setInterval(run, 200)
    return () => {
      stop = true
      window.clearInterval(id)
      releaseDiscardProxies(scene)
      publishDiscardProxy(true, false, 0)
    }
  }, [scene])

  return (
    <mesh name="MeshDiscardHost" visible={false} frustumCulled={false} raycast={ignoreHostRaycast}>
      <boxGeometry args={[0.001, 0.001, 0.001]} />
      <MeshDiscardMaterial ref={materialRef} colorWrite={false} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}
