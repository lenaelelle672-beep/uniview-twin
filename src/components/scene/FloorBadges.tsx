import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Intersection,
} from 'three'
import atlasUrl from '../../../assets/ready/textures/badge-digits-bold.png'
import {
  BADGE_ALARM_X,
  BADGE_CHIP_H,
  BADGE_CHIP_W,
  BADGE_HEIGHT,
  BADGE_MIN_SCREEN_PX,
  BADGE_OFFLINE_X,
  BADGE_WIDTH,
  badgeAnchor,
} from '../../scene/badges'
import {
  badgeProjectedPixels,
  badgeScreenScale,
  buildBadgeDigitGeometry,
  layoutBadgeCenters,
  patchBadgeDigitVertexShader,
  patchBadgePlateVertexShader,
  writeBadgeDigitPositions,
} from '../../scene/badgeDigits'
import { useTwinStore } from '../../store/store'

const PLATE = new Color('#172433')
const ALARM = new Color('#b42318')
const OFFLINE = new Color('#5d6775')
const PLATE_Z = 0.02
const CHIP_Z = 0.05

const right = new Vector3()
const up = new Vector3()
const viewDir = new Vector3()
const billboardZ = new Vector3()
const centerScratch = new Vector3()
const dummy = new Object3D()
const pickMatrix = new Matrix4()
const pickPosition = new Vector3()
const pickQuaternion = new Quaternion()
const pickScale = new Vector3()
const pickView = new Vector3()
const ndcScratch = new Vector3()
const gapPoint = new Vector3()
const gapNdc = new Vector3()

interface NdcRect {
  cx: number
  cy: number
  hx: number
  hy: number
}

const plateNdc: NdcRect[] = []

type ScaleShader = { uniforms?: { badgeViewportHeight?: { value: number } } }

function syncViewport(material: MeshBasicMaterial, cssHeight: number) {
  const shader = material.userData.shader as ScaleShader | undefined
  if (shader?.uniforms?.badgeViewportHeight) shader.uniforms.badgeViewportHeight.value = cssHeight
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
  const cssWidth = useThree((state) => state.size.width)
  const cssHeight = useThree((state) => state.size.height)
  const camera = useThree((state) => state.camera)
  const meshRef = useRef<InstancedMesh>(null)
  const digitRef = useRef<Mesh>(null)
  const gapRef = useRef<Mesh>(null)
  const viewportHeight = useRef(cssHeight)
  const anchors = useMemo(() => floors.map((floor) => badgeAnchor(floor)), [floors])
  const plateGeometry = useMemo(() => {
    const geometry = new PlaneGeometry(1, 1)
    const floorCount = Math.max(Math.floor(Math.max(anchors.length, 1)), 1)
    const capacity = floorCount * 3
    const shifts = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
    for (let index = 0; index < floorCount; index += 1) {
      shifts.setXYZ(index, 0, 0, PLATE_Z)
      shifts.setXYZ(floorCount + index, BADGE_ALARM_X / BADGE_CHIP_W, 0, CHIP_Z)
      shifts.setXYZ(floorCount * 2 + index, BADGE_OFFLINE_X / BADGE_CHIP_W, 0, CHIP_Z)
    }
    geometry.setAttribute('badgeShift', shifts)
    return geometry
  }, [anchors.length])
  const plateMaterial = useMemo(() => {
    const material = new MeshBasicMaterial({ color: '#ffffff', toneMapped: false })
    material.customProgramCacheKey = () => 'badge-plate-screen-floor'
    material.onBeforeCompile = (shader) => {
      patchBadgePlateVertexShader(shader, viewportHeight.current)
      material.userData.shader = shader
    }
    return material
  }, [])
  const digits = useMemo(() => (floors.length === 0 ? null : buildBadgeDigitGeometry(floors)), [floors])
  const digitMaterial = useMemo(() => {
    const material = new MeshBasicMaterial({
      color: '#ffffff',
      map: texture,
      // Far mip levels average edge alpha. 0.2 lets those texels reach
      // alpha-to-coverage so the stroke stays. transparent stays off.
      alphaTest: 0.2,
      alphaToCoverage: true,
      transparent: false,
      toneMapped: false,
    })
    material.customProgramCacheKey = () => 'badge-digit-screen-floor'
    material.onBeforeCompile = (shader) => {
      patchBadgeDigitVertexShader(shader, viewportHeight.current)
      material.userData.shader = shader
    }
    return material
  }, [texture])
  const capacity = Math.max(anchors.length, 1) * 3

  useLayoutEffect(() => {
    viewportHeight.current = cssHeight
  }, [cssHeight])

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

  useFrame(({ camera: frameCamera }) => {
    viewportHeight.current = cssHeight
    syncViewport(plateMaterial, cssHeight)
    syncViewport(digitMaterial, cssHeight)
    if (hidden || anchors.length === 0 || !(frameCamera instanceof PerspectiveCamera)) {
      window.__twinBadgeCenters = []
      plateNdc.length = 0
      return
    }
    right.set(1, 0, 0).applyQuaternion(frameCamera.quaternion)
    up.set(0, 1, 0).applyQuaternion(frameCamera.quaternion)
    viewDir.set(0, 0, -1).applyQuaternion(frameCamera.quaternion)
    const proj11 = frameCamera.projectionMatrix.elements[5]
    const centers = layoutBadgeCenters(
      floors,
      right,
      viewDir,
      frameCamera.position,
      proj11,
      cssHeight,
      cssWidth,
    )
    window.__twinBadgeCenters = centers
    plateNdc.length = 0
    if (cssWidth > 0 && cssHeight > 0) {
      for (const center of centers) {
        const depth = Math.max(
          centerScratch.set(center.x, center.y, center.z).sub(frameCamera.position).dot(viewDir),
          1e-3,
        )
        const pixels = badgeProjectedPixels(BADGE_HEIGHT, depth, cssHeight, proj11)
        const heightPx = Math.max(pixels, BADGE_MIN_SCREEN_PX)
        const widthPx = heightPx * (BADGE_WIDTH / BADGE_HEIGHT)
        ndcScratch.set(center.x, center.y, center.z).project(frameCamera)
        plateNdc.push({ cx: ndcScratch.x, cy: ndcScratch.y, hx: widthPx / cssWidth, hy: heightPx / cssHeight })
      }
    }
    const mesh = meshRef.current
    if (mesh) {
      centers.forEach((center, index) => {
        centerScratch.set(center.x, center.y, center.z)
        writeInstance(mesh, index, centerScratch, BADGE_WIDTH, BADGE_HEIGHT, frameCamera.quaternion)
        writeInstance(mesh, centers.length + index, centerScratch, BADGE_CHIP_W, BADGE_CHIP_H, frameCamera.quaternion)
        writeInstance(mesh, centers.length * 2 + index, centerScratch, BADGE_CHIP_W, BADGE_CHIP_H, frameCamera.quaternion)
      })
      mesh.count = centers.length * 3
      mesh.instanceMatrix.needsUpdate = true
    }
    const digit = digitRef.current
    if (!digit || !digits) return
    const positions = digit.geometry.attributes.position.array as Float32Array
    billboardZ.copy(viewDir).negate()
    writeBadgeDigitPositions(positions, digits.local, digits.anchorIndex, centers, right, up, billboardZ)
    digit.geometry.attributes.position.needsUpdate = true
    const centerAttr = digit.geometry.getAttribute('badgeCenter')
    for (let index = 0; index < digits.anchorIndex.length; index += 1) {
      const center = centers[digits.anchorIndex[index]]
      centerAttr.setXYZ(index, center.x, center.y, center.z)
    }
    centerAttr.needsUpdate = true
  })

  const show = !hidden && anchors.length > 0
  return (
    <group name="FloorBadges" visible={show}>
      <instancedMesh
        key={capacity}
        ref={meshRef}
        args={[plateGeometry, plateMaterial, capacity]}
        frustumCulled={false}
        castShadow={false}
        receiveShadow={false}
        renderOrder={2}
        raycast={(raycaster, intersects) => {
          const mesh = meshRef.current
          if (!mesh || !(camera instanceof PerspectiveCamera)) return
          raycastEnlargedPlates(mesh, camera, cssHeight, raycaster, intersects)
        }}
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
          castShadow={false}
          receiveShadow={false}
          renderOrder={3}
          raycast={() => null}
        />
      )}
      <mesh
        ref={gapRef}
        visible={false}
        frustumCulled={false}
        raycast={(raycaster, intersects) => raycastBadgeGap(gapRef.current, raycaster, intersects)}
        onClick={swallow}
        onDoubleClick={swallow}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial />
      </mesh>
    </group>
  )
}

function swallow(event: { stopPropagation: () => void }) {
  event.stopPropagation()
}

function raycastBadgeGap(mesh: Mesh | null, raycaster: Raycaster, intersects: Intersection[]) {
  if (!mesh || plateNdc.length === 0 || !raycaster.camera) return
  gapNdc.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, 8)
  gapNdc.project(raycaster.camera)
  const x = gapNdc.x
  const y = gapNdc.y
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const rect of plateNdc) {
    minX = Math.min(minX, rect.cx - rect.hx)
    maxX = Math.max(maxX, rect.cx + rect.hx)
    minY = Math.min(minY, rect.cy - rect.hy)
    maxY = Math.max(maxY, rect.cy + rect.hy)
    if (Math.abs(x - rect.cx) <= rect.hx && Math.abs(y - rect.cy) <= rect.hy) return
  }
  if (x < minX || x > maxX || y < minY || y > maxY) return
  const distance = 1
  intersects.push({
    distance,
    point: gapPoint.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, distance),
    object: mesh,
  })
}

function raycastEnlargedPlates(
  mesh: InstancedMesh,
  camera: PerspectiveCamera,
  cssHeight: number,
  raycaster: Raycaster,
  intersects: Intersection[],
) {
  const floorCount = Math.floor(mesh.count / 3)
  if (floorCount === 0) return
  const saved = new Float32Array(floorCount * 16)
  const savedCount = mesh.count
  const proj11 = camera.projectionMatrix.elements[5]
  for (let index = 0; index < floorCount; index += 1) {
    mesh.getMatrixAt(index, pickMatrix)
    saved.set(pickMatrix.elements, index * 16)
    pickMatrix.decompose(pickPosition, pickQuaternion, pickScale)
    pickView.copy(pickPosition).applyMatrix4(camera.matrixWorldInverse)
    const pixels = badgeProjectedPixels(BADGE_HEIGHT, -pickView.z, cssHeight, proj11)
    const k = badgeScreenScale(pixels)
    pickScale.set(BADGE_WIDTH * k, BADGE_HEIGHT * k, 1)
    pickMatrix.compose(pickPosition, pickQuaternion, pickScale)
    mesh.setMatrixAt(index, pickMatrix)
  }
  const previousSphere = mesh.boundingSphere
  mesh.count = floorCount
  mesh.boundingSphere = null
  try {
    InstancedMesh.prototype.raycast.call(mesh, raycaster, intersects)
  } finally {
    for (let index = 0; index < floorCount; index += 1) {
      pickMatrix.fromArray(saved, index * 16)
      mesh.setMatrixAt(index, pickMatrix)
    }
    mesh.count = savedCount
    mesh.instanceMatrix.needsUpdate = true
    mesh.boundingSphere = previousSphere
  }
}

function writeInstance(
  mesh: InstancedMesh,
  index: number,
  position: Vector3,
  width: number,
  height: number,
  quaternion: Quaternion,
) {
  dummy.position.copy(position)
  dummy.quaternion.copy(quaternion)
  dummy.scale.set(width, height, 1)
  dummy.updateMatrix()
  mesh.setMatrixAt(index, dummy.matrix)
}
