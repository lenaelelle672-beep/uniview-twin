import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  Color,
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
  BADGE_GLYPH_HEIGHT,
  badgeProjectedPixels,
  badgeScreenScale,
  buildBadgeDigitGeometry,
  patchBadgeDigitVertexShader,
  writeBadgeDigitPositions,
} from '../../scene/badgeDigits'
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
const pickMatrix = new Matrix4()
const pickPosition = new Vector3()
const pickQuaternion = new Quaternion()
const pickScale = new Vector3()
const pickView = new Vector3()

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
  const cssHeight = useThree((state) => state.size.height)
  const camera = useThree((state) => state.camera)
  const meshRef = useRef<InstancedMesh>(null)
  const digitRef = useRef<Mesh>(null)
  const viewportHeight = useRef(cssHeight)
  const anchors = useMemo(() => floors.map((floor) => badgeAnchor(floor)), [floors])
  const plateGeometry = useMemo(() => new PlaneGeometry(1, 1), [])
  const plateMaterial = useMemo(() => new MeshBasicMaterial({ toneMapped: false }), [])
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
    const shader = digitMaterial.userData.shader as { uniforms?: { badgeViewportHeight?: { value: number } } } | undefined
    if (shader?.uniforms?.badgeViewportHeight) shader.uniforms.badgeViewportHeight.value = cssHeight
    if (hidden || anchors.length === 0) return
    right.set(1, 0, 0).applyQuaternion(frameCamera.quaternion)
    up.set(0, 1, 0).applyQuaternion(frameCamera.quaternion)
    forward.set(0, 0, 1).applyQuaternion(frameCamera.quaternion)
    const mesh = meshRef.current
    if (mesh) {
      anchors.forEach((anchor, index) => {
        anchorScratch.set(anchor.x, anchor.y, anchor.z)
        writeInstance(mesh, index, anchorScratch, 0, 0.02, BADGE_WIDTH, BADGE_HEIGHT, frameCamera.quaternion)
        writeInstance(mesh, anchors.length + index, anchorScratch, BADGE_ALARM_X, 0.04, BADGE_CHIP_W, BADGE_CHIP_H, frameCamera.quaternion)
        writeInstance(
          mesh,
          anchors.length * 2 + index,
          anchorScratch,
          BADGE_OFFLINE_X,
          0.04,
          BADGE_CHIP_W,
          BADGE_CHIP_H,
          frameCamera.quaternion,
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
        // 底板不随着色器放大，视锥和阴影都关掉。拾取在 raycast 里临时按 k 放大。
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
          // 包围球仍是未放大的几何。关掉视锥剔除，屏幕边上的放大字才不会被整块丢掉。
          // 不投影：深度材质没有顶点补丁。射线也不走这份 CPU 几何。
          frustumCulled={false}
          castShadow={false}
          receiveShadow={false}
          renderOrder={3}
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
  const proj11 = camera.projectionMatrix.elements[5]
  for (let index = 0; index < floorCount; index += 1) {
    mesh.getMatrixAt(index, pickMatrix)
    saved.set(pickMatrix.elements, index * 16)
    pickMatrix.decompose(pickPosition, pickQuaternion, pickScale)
    pickView.copy(pickPosition).applyMatrix4(camera.matrixWorldInverse)
    const pixels = badgeProjectedPixels(BADGE_HEIGHT, -pickView.z, cssHeight, proj11)
    const k = badgeScreenScale(pixels)
    // 命中框跟着数字绕徽标中心放大，高度用字形而不是更高的底板，避免相邻层的拾取体重叠。
    pickScale.x = BADGE_WIDTH * k
    pickScale.y = BADGE_GLYPH_HEIGHT * k
    pickMatrix.compose(pickPosition, pickQuaternion, pickScale)
    mesh.setMatrixAt(index, pickMatrix)
  }
  const previousSphere = mesh.boundingSphere
  mesh.boundingSphere = null
  InstancedMesh.prototype.raycast.call(mesh, raycaster, intersects)
  for (let index = 0; index < floorCount; index += 1) {
    pickMatrix.fromArray(saved, index * 16)
    mesh.setMatrixAt(index, pickMatrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.boundingSphere = previousSphere
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
