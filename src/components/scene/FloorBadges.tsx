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
/** 楼体和树用默认 0。底板是 N，数字是 N+1，数字画在底板上面。 */
const BADGE_PLATE_ORDER = 10
const BADGE_DIGIT_ORDER = BADGE_PLATE_ORDER + 1

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
  const meshRef = useRef<InstancedMesh>(null)
  const digitRef = useRef<Mesh>(null)
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
    const material = new MeshBasicMaterial({
      color: '#ffffff',
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
    })
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
      depthTest: false,
      depthWrite: false,
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
      if (meshRef.current) meshRef.current.count = 0
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
    const mesh = meshRef.current
    if (mesh) {
      const floorCount = centers.length
      // 同一次实例调用按序号画。depthTest 关闭后，后面的实例盖住前面的，所以色块必须排在全部底板之后。
      centers.forEach((center, index) => {
        centerScratch.set(center.x, center.y, center.z)
        writeInstance(mesh, index, centerScratch, BADGE_WIDTH, BADGE_HEIGHT, frameCamera.quaternion)
      })
      centers.forEach((center, index) => {
        centerScratch.set(center.x, center.y, center.z)
        writeInstance(mesh, floorCount + index, centerScratch, BADGE_CHIP_W, BADGE_CHIP_H, frameCamera.quaternion)
        writeInstance(mesh, floorCount * 2 + index, centerScratch, BADGE_CHIP_W, BADGE_CHIP_H, frameCamera.quaternion)
      })
      mesh.count = floorCount * 3
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
        visible={show}
        renderOrder={BADGE_PLATE_ORDER}
        raycast={(raycaster, intersects) => {
          if (!show) return
          const mesh = meshRef.current
          const active = raycaster.camera
          if (!mesh || !(active instanceof PerspectiveCamera)) return
          raycastEnlargedPlates(mesh, active, cssHeight, raycaster, intersects)
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
          visible={show}
          renderOrder={BADGE_DIGIT_ORDER}
          raycast={() => null}
        />
      )}
    </group>
  )
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
  const before = intersects.length
  try {
    InstancedMesh.prototype.raycast.call(mesh, raycaster, intersects)
    // 徽标画在楼和树前面，命中也要排在更近的楼体之前。空隙没有交点，留给场景拾取。
    for (let index = before; index < intersects.length; index += 1) {
      intersects[index].distance *= 1e-4
    }
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
