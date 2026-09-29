import { Detailed, useAnimations } from '@react-three/drei'
import { useFrame, useLoader } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Group, MeshStandardMaterial, SkinnedMesh } from 'three'
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

function CorridorPeopleModels() {
  const loaded = useLoader(GLTFLoader, URLS, installMeshopt) as GLTF[]
  const [man, woman, manLod, womanLod] = loaded
  const roster = useMemo(() => corridorRoster(CORRIDOR_PEOPLE_COUNT), [])
  const path = useMemo(() => towerCorridorPolyline(), [])
  const length = useMemo(() => pathLength(path), [path])
  const refs = useRef<Array<Group | null>>([])

  const place = (time: number) => {
    roster.forEach((person, index) => {
      const group = refs.current[index]
      if (!group) return
      const sample = pointOnPath(path, time * WALK_METERS_PER_SECOND + person.offset * length)
      group.position.set(sample.x, 0, sample.z)
      group.rotation.set(0, sample.heading, 0)
    })
  }

  useLayoutEffect(() => {
    place(0)
  }, [length, path, roster])

  useFrame(({ clock }) => {
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

/** 性能档不挂载，因此不会请求人物 GLB。 */
export function CorridorPeople({ enabled }: { enabled: boolean }) {
  if (!enabled) return null
  return <CorridorPeopleModels />
}
