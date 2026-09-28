import { useFrame, useLoader } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  Color,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from 'three'
import atlasUrl from '../../assets/badges/badge-digits.png'
import {
  BADGE_ALARM_X,
  BADGE_CHIP_H,
  BADGE_CHIP_W,
  BADGE_HEIGHT,
  BADGE_OFFLINE_X,
  BADGE_WIDTH,
  badgeAnchor,
} from '../../scene/badges'
import { buildBadgeDigitGeometry, writeBadgeDigitPositions } from '../../scene/badgeDigits'
import { useTwinStore } from '../../store/store'

const PLATE = new Color('#172433')
const ALARM = new Color('#b42318')
const OFFLINE = new Color('#5d6775')

const right = new Vector3()
const up = new Vector3()
const forward = new Vector3()
const anchorScratch = new Vector3()
const placed = new Vector3()
const dummy = new Object3D()

function offset(anchor: Vector3, localX: number, localZ: number, target: Vector3) {
  target.copy(anchor).addScaledVector(right, localX).addScaledVector(forward, localZ)
}

export function FloorBadges() {
  const floors = useTwinStore((state) => state.floors)
  const hidden = useTwinStore(
    (state) => state.view !== 'building' || state.presentation === 'model' || state.cam != null,
  )
  const setSelectedFloor = useTwinStore((state) => state.setSelectedFloor)
  const emitFloorFly = useTwinStore((state) => state.emitFloorFly)
  const enterFloor = useTwinStore((state) => state.enterFloor)
  const texture = useLoader(TextureLoader, atlasUrl)
  const meshRef = useRef<InstancedMesh>(null)
  const digitRef = useRef<Mesh>(null)
  const anchors = useMemo(() => floors.map((floor) => badgeAnchor(floor)), [floors])
  const plateGeometry = useMemo(() => new PlaneGeometry(1, 1), [])
  const plateMaterial = useMemo(() => new MeshBasicMaterial({ toneMapped: false }), [])
  const digits = useMemo(() => (floors.length === 0 ? null : buildBadgeDigitGeometry(floors)), [floors])
  const digitMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: '#ffffff',
        map: texture,
        // Far mip levels average edge alpha. 0.2 lets those texels reach
        // alpha-to-coverage so the stroke stays. transparent stays off.
        alphaTest: 0.2,
        alphaToCoverage: true,
        transparent: false,
        toneMapped: false,
      }),
    [texture],
  )
  const capacity = Math.max(anchors.length, 1) * 3

  useLayoutEffect(() => {
    texture.colorSpace = SRGBColorSpace
    texture.flipY = true
    texture.generateMipmaps = true
    texture.needsUpdate = true
  }, [texture])

  useLayoutEffect(() => {
    window.__twinBadges = hidden || anchors.length === 0 ? 0 : anchors.length
    const mesh = meshRef.current
    if (!mesh || hidden || anchors.length === 0) return
    anchors.forEach((_, index) => {
      mesh.setColorAt(index, PLATE)
      mesh.setColorAt(anchors.length + index, ALARM)
      mesh.setColorAt(anchors.length * 2 + index, OFFLINE)
    })
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [anchors, hidden])

  useEffect(() => {
    return () => {
      plateGeometry.dispose()
      plateMaterial.dispose()
    }
  }, [plateGeometry, plateMaterial])

  useEffect(() => {
    return () => {
      digits?.geometry.dispose()
      digitMaterial.dispose()
    }
  }, [digitMaterial, digits])

  useFrame(({ camera }) => {
    if (hidden || anchors.length === 0) return
    right.set(1, 0, 0).applyQuaternion(camera.quaternion)
    up.set(0, 1, 0).applyQuaternion(camera.quaternion)
    forward.set(0, 0, 1).applyQuaternion(camera.quaternion)
    const mesh = meshRef.current
    if (mesh) {
      anchors.forEach((anchor, index) => {
        anchorScratch.set(anchor.x, anchor.y, anchor.z)
        writeInstance(mesh, index, anchorScratch, 0, 0.02, BADGE_WIDTH, BADGE_HEIGHT, camera.quaternion)
        writeInstance(mesh, anchors.length + index, anchorScratch, BADGE_ALARM_X, 0.04, BADGE_CHIP_W, BADGE_CHIP_H, camera.quaternion)
        writeInstance(
          mesh,
          anchors.length * 2 + index,
          anchorScratch,
          BADGE_OFFLINE_X,
          0.04,
          BADGE_CHIP_W,
          BADGE_CHIP_H,
          camera.quaternion,
        )
      })
      mesh.count = anchors.length * 3
      mesh.instanceMatrix.needsUpdate = true
    }
    const digit = digitRef.current
    if (!digit || !digits) return
    const positions = digit.geometry.attributes.position.array as Float32Array
    writeBadgeDigitPositions(positions, digits.local, digits.anchorIndex, anchors, right, up, forward)
    digit.geometry.attributes.position.needsUpdate = true
  })

  const show = !hidden && anchors.length > 0
  return (
    <group name="FloorBadges" visible={show}>
      <instancedMesh
        key={capacity}
        ref={meshRef}
        args={[plateGeometry, plateMaterial, capacity]}
        frustumCulled={false}
        renderOrder={2}
        onClick={(event) => {
          if (!show || event.delta > 2 || event.instanceId == null) return
          event.stopPropagation()
          const floor = floors[event.instanceId % floors.length]
          if (floor) setSelectedFloor(floor.id)
        }}
        onDoubleClick={(event) => {
          if (!show || event.delta > 2 || event.instanceId == null) return
          event.stopPropagation()
          const floor = floors[event.instanceId % floors.length]
          if (!floor) return
          emitFloorFly(floor.id)
          enterFloor(floor.id)
        }}
      />
      {digits && (
        <mesh
          ref={digitRef}
          geometry={digits.geometry}
          material={digitMaterial}
          frustumCulled={false}
          renderOrder={3}
          raycast={() => null}
        />
      )}
    </group>
  )
}

function writeInstance(
  mesh: InstancedMesh,
  index: number,
  anchor: Vector3,
  localX: number,
  localZ: number,
  width: number,
  height: number,
  quaternion: Quaternion,
) {
  offset(anchor, localX, localZ, placed)
  dummy.position.copy(placed)
  dummy.quaternion.copy(quaternion)
  dummy.scale.set(width, height, 1)
  dummy.updateMatrix()
  mesh.setMatrixAt(index, dummy.matrix)
}
