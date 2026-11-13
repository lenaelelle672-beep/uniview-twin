import { Tube } from '@react-three/drei/core/shapes'
import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useState } from 'react'
import { cableTubeArgs } from './curve'
import { noteCableMounted } from './probe'
import { interiorPose, sameInteriorPose, type InteriorHost, type InteriorPose } from './pose'

/** 拾取穿过管子，点选仍落到工位。 */
function ignoreTubePick() {
  // 不往 intersects 里推。
}

function isInteriorHost(value: unknown): value is InteriorHost {
  if (!value || typeof value !== 'object') return false
  const host = value as Partial<InteriorHost>
  return typeof host.updateWorldMatrix === 'function' && host.matrixWorld != null
}

/**
 * 模块加载时建好的 Tube args。渲染只把这份引用递进去。
 * 不在函数体内 new 曲线，也不逐帧改 args。
 */
const TUBE_RUNS = cableTubeArgs()

/**
 * T126：三根 drei Tube。
 * 父组抄 FloorInterior 的世界矩阵，曲线留在楼层局部坐标。
 * 室内组还没进场景就过一会儿再读，读到就停。
 */
export function CableTrays({ floorId }: { floorId: string }) {
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)
  const [pose, setPose] = useState<InteriorPose | null>(null)

  useEffect(() => {
    let stop = false
    let timer = 0
    const pull = () => {
      if (stop) return
      const found = scene.getObjectByName('FloorInterior')
      const next = isInteriorHost(found) ? interiorPose(found) : null
      if (!next) return
      stop = true
      window.clearInterval(timer)
      setPose((prev) => (sameInteriorPose(prev, next) ? prev : next))
    }
    pull()
    if (!stop) timer = window.setInterval(pull, 200)
    return () => {
      stop = true
      window.clearInterval(timer)
    }
  }, [floorId, scene])

  useLayoutEffect(() => {
    noteCableMounted(pose != null)
    if (pose) invalidate()
  }, [invalidate, pose])

  useLayoutEffect(() => {
    return () => {
      noteCableMounted(false)
      invalidate()
    }
  }, [invalidate])

  if (!pose) return null

  return (
    <group name="CableTrays" position={pose.position} quaternion={pose.quaternion} scale={pose.scale}>
      {TUBE_RUNS.map((item) => (
        <Tube
          key={item.run.id}
          name={item.run.name}
          args={item.args}
          position={[0, 0, 0]}
          raycast={ignoreTubePick}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color={item.run.color}
            roughness={item.run.roughness}
            metalness={item.run.metalness}
          />
        </Tube>
      ))}
    </group>
  )
}
