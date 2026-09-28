import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  Color,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three'
import { BatchedText, Text, preloadFont } from 'troika-three-text'
import badgeFont from '../../assets/fonts/DejaVuSans-Bold.ttf'
import { BADGE_HEIGHT, BADGE_WIDTH, badgeAnchor } from '../../scene/badges'
import { useTwinStore } from '../../store/store'

const GLYPHS = 'BF0123456789'
const PLATE = new Color('#172433')
const ALARM = new Color('#b42318')
const OFFLINE = new Color('#5d6775')
const ID_X = -2.85
const ALARM_X = 0.25
const OFFLINE_X = 2.6
const CHIP_W = 2.15
const CHIP_H = 1.85

preloadFont({ font: badgeFont, characters: GLYPHS }, () => {})

const right = new Vector3()
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
  const meshRef = useRef<InstancedMesh>(null)
  const textsRef = useRef<Text[]>([])
  const anchors = useMemo(() => floors.map((floor) => badgeAnchor(floor)), [floors])
  const batch = useMemo(() => {
    const text = new BatchedText()
    text.font = badgeFont
    text.renderOrder = 3
    return text
  }, [])
  const geometry = useMemo(() => new PlaneGeometry(1, 1), [])
  const material = useMemo(() => new MeshBasicMaterial({ toneMapped: false }), [])
  const capacity = Math.max(anchors.length, 1) * 3

  useLayoutEffect(() => {
    let cancelled = false
    window.__twinBadges = 0
    if (hidden || anchors.length === 0) return

    const created: Text[] = []
    const addLabel = (value: string, x: number, y: number, z: number, color: number) => {
      const text = new Text()
      text.font = badgeFont
      text.text = value
      text.fontSize = 1.15
      text.color = color
      text.anchorX = 'center'
      text.anchorY = 'middle'
      text.position.set(x, y, z)
      text.raycast = () => {}
      batch.add(text)
      created.push(text)
    }

    anchors.forEach((anchor, index) => {
      const floor = floors[index]
      addLabel(floor.id, anchor.x, anchor.y, anchor.z, 0xf7fafc)
      addLabel(String(floor.alarmCount), anchor.x, anchor.y, anchor.z, 0xffffff)
      addLabel(String(floor.offlineCount), anchor.x, anchor.y, anchor.z, 0xffffff)
    })
    textsRef.current = created
    batch.sync(() => {
      if (cancelled) return
      const mat = batch.material
      if (mat && !Array.isArray(mat)) mat.toneMapped = false
      window.__twinBadges = anchors.length
    })

    const mesh = meshRef.current
    if (mesh) {
      anchors.forEach((_, index) => {
        mesh.setColorAt(index, PLATE)
        mesh.setColorAt(anchors.length + index, ALARM)
        mesh.setColorAt(anchors.length * 2 + index, OFFLINE)
      })
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }

    return () => {
      cancelled = true
      created.forEach((text) => {
        batch.remove(text)
        text.dispose()
      })
      if (textsRef.current === created) textsRef.current = []
      window.__twinBadges = 0
    }
  }, [anchors, batch, floors, hidden])

  useFrame(({ camera }) => {
    if (hidden || anchors.length === 0) return
    right.set(1, 0, 0).applyQuaternion(camera.quaternion)
    forward.set(0, 0, 1).applyQuaternion(camera.quaternion)
    const quaternion = camera.quaternion
    const mesh = meshRef.current
    if (mesh) {
      anchors.forEach((anchor, index) => {
        anchorScratch.set(anchor.x, anchor.y, anchor.z)
        writeInstance(mesh, index, anchorScratch, 0, 0.02, BADGE_WIDTH, BADGE_HEIGHT, quaternion)
        writeInstance(mesh, anchors.length + index, anchorScratch, ALARM_X, 0.04, CHIP_W, CHIP_H, quaternion)
        writeInstance(mesh, anchors.length * 2 + index, anchorScratch, OFFLINE_X, 0.04, CHIP_W, CHIP_H, quaternion)
      })
      mesh.count = anchors.length * 3
      mesh.instanceMatrix.needsUpdate = true
    }

    textsRef.current.forEach((text, index) => {
      const anchor = anchors[Math.floor(index / 3)]
      if (!anchor) return
      const column = index % 3
      const localX = column === 0 ? ID_X : column === 1 ? ALARM_X : OFFLINE_X
      anchorScratch.set(anchor.x, anchor.y, anchor.z)
      offset(anchorScratch, localX, 0.08, text.position)
      text.quaternion.copy(quaternion)
    })
  })

  const show = !hidden && anchors.length > 0
  return (
    <group name="FloorBadges" visible={show}>
      <instancedMesh
        key={capacity}
        ref={meshRef}
        args={[geometry, material, capacity]}
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
      <primitive object={batch} />
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
