import { Detailed } from '@react-three/drei/core/Detailed'
import { useAnimations } from '@react-three/drei/core/useAnimations'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Group, MeshStandardMaterial, SkinnedMesh } from 'three'
import { channelDue, channelIntervalMs, retainFrameChannel } from '../frameSchedule'
import { useLayerShown } from '../layerGate'
import { useTwinStore } from '../../store/store'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { installMeshopt } from '../meshopt'
import {
  CORRIDOR_PEOPLE_COUNT,
  corridorRoster,
  pathLength,
  PERSON_SCALE,
  pointOnPath,
  towerCorridorPolyline,
  WALK_METERS_PER_SECOND,
  type Point,
} from './corridor'

const MAN_HI = '/models/people/man-in-suit.glb'
const WOMAN_HI = '/models/people/woman-casual.glb'
const MAN_LO = '/models/people/man-in-suit-lod1.glb'
const WOMAN_LO = '/models/people/woman-casual-lod1.glb'
const URLS = [MAN_HI, WOMAN_HI, MAN_LO, WOMAN_LO]

const CLIP = {
  man: 'HumanArmature|Man_Walk',
  woman: 'HumanArmature|Female_Walk',
} as const

function prepareFigure(gltf: GLTF) {
  const object = cloneSkeleton(gltf.scene)
  object.traverse((child) => {
    const mesh = child as SkinnedMesh
    if (!mesh.isSkinnedMesh) return
    mesh.frustumCulled = false
    mesh.castShadow = false
    mesh.receiveShadow = false
    // 性能档人物不投影（本组件仅在非性能档挂载；即使挂上也保持不投影）。
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      const standard = material as MeshStandardMaterial
      standard.vertexColors = true
      standard.color?.set('#ffffff')
    }
  })
  return object
}

function Figure({ gltf, clip }: { gltf: GLTF; clip: string }) {
  const root = useRef<Group>(null)
  const clone = useMemo(() => prepareFigure(gltf), [gltf])
  const { actions } = useAnimations(gltf.animations, root)
  useEffect(() => {
    const action = actions[clip]
    if (!action) return undefined
    action.reset().play()
    return () => {
      action.stop()
    }
  }, [actions, clip])
  return (
    <group ref={root}>
      <primitive object={clone} />
    </group>
  )
}

function CorridorPeopleModels({ paths }: { paths: Point[][] }) {
  const loaded = useLoader(GLTFLoader, URLS, installMeshopt) as GLTF[]
  const [man, woman, manLod, womanLod] = loaded
  const roster = useMemo(() => corridorRoster(CORRIDOR_PEOPLE_COUNT), [])
  const lengths = useMemo(() => paths.map((path) => pathLength(path)), [paths])
  const refs = useRef<Array<Group | null>>([])
  const lastPlace = useRef(0)

  useEffect(() => retainFrameChannel('people'), [])

  const place = (time: number) => {
    roster.forEach((person, index) => {
      const group = refs.current[index]
      const path = paths[index % paths.length]
      const length = lengths[index % paths.length]
      if (!group || !path || length <= 0) return
      const sample = pointOnPath(path, time * WALK_METERS_PER_SECOND + person.offset * length)
      group.position.set(sample.x, 0, sample.z)
      group.rotation.set(0, sample.heading, 0)
    })
  }

  useLayoutEffect(() => {
    place(0)
  }, [lengths, paths, roster])

  useFrame(({ clock }) => {
    const now = performance.now()
    const quality = useTwinStore.getState().quality
    const interval = channelIntervalMs('people', quality)
    if (!channelDue(lastPlace.current, now, interval)) return
    lastPlace.current = now
    place(clock.elapsedTime)
  })

  return (
    <group name="CorridorPeople">
      {roster.map((person, index) => {
        const hi = person.model === 'man' ? man : woman
        const lo = person.model === 'man' ? manLod : womanLod
        const clip = CLIP[person.model]
        return (
          <group
            key={`${person.model}-${index}`}
            ref={(node) => {
              refs.current[index] = node
            }}
            name={`Person-${index}`}
            scale={PERSON_SCALE[person.model]}
          >
            <Detailed distances={[0, 80]}>
              <Figure gltf={hi} clip={clip} />
              <Figure gltf={lo} clip={clip} />
            </Detailed>
          </group>
        )
      })}
    </group>
  )
}

/** 性能档或人流图层关闭时不挂载，因此不会请求人物 GLB。walkPaths 为空则不放人。 */
export function CorridorPeople({ enabled, paths }: { enabled: boolean; paths?: Point[][] }) {
  const people = useLayerShown('people')
  const invalidate = useThree((state) => state.invalidate)
  const visible = enabled && people
  useLayoutEffect(() => {
    invalidate()
    return () => {
      invalidate()
    }
  }, [invalidate, visible])
  const resolved = paths && paths.length > 0 ? paths : paths === undefined ? [towerCorridorPolyline()] : []
  if (!visible || resolved.length === 0) return null
  return <CorridorPeopleModels paths={resolved} />
}
