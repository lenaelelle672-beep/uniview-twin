import {
  BoxGeometry,
  CanvasTexture,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshDepthMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
} from 'three'
import { LineMaterial, LineSegments2, LineSegmentsGeometry } from 'three-stdlib'
import { DEPTH_PROXY_LAYER, MONITOR_LAYER } from '../overlayOrder'
import {
  ceilingMaterial,
  chairMaterial,
  columnMaterial,
  coreWallMaterial,
  deskMaterial,
  meetingGlassMaterial,
  monitorMaterial,
  slabMaterial,
  woodMaterial,
} from '../stage/materials'
import { configureDepthProxyMaterial } from '../stage/monitorDepthProxy'

export type ShaderGroupBuild = {
  objects: Object3D[]
  dispose: () => void
}

export type ShaderGroup = {
  id: string
  build: () => ShaderGroupBuild
}

const dummy = new Object3D()

function instanced(material: MeshStandardMaterial | MeshBasicMaterial | MeshPhysicalMaterial, opts: {
  castShadow: boolean
  receiveShadow: boolean
  layer?: number
  color?: Color
}) {
  const geometry = new BoxGeometry(0.2, 0.2, 0.2)
  const mesh = new InstancedMesh(geometry, material, 1)
  dummy.position.set(0, 0, 0)
  dummy.rotation.set(0, 0, 0)
  dummy.scale.set(1, 1, 1)
  dummy.updateMatrix()
  mesh.setMatrixAt(0, dummy.matrix)
  mesh.instanceMatrix.needsUpdate = true
  if (opts.color) {
    mesh.setColorAt(0, opts.color)
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }
  mesh.castShadow = opts.castShadow
  mesh.receiveShadow = opts.receiveShadow
  mesh.visible = false
  mesh.frustumCulled = false
  if (opts.layer != null) mesh.layers.set(opts.layer)
  return { mesh, geometry }
}

/**
 * 演示主线 F12→F22→F18→F3→F1 都走 JsonFloorInterior，程序按材质组合去重。
 * 每一组对应一个 program（或同一 program 的一组材质）。
 */
export const FLOOR_SHADER_GROUPS: ShaderGroup[] = [
  {
    id: 'slab-standard-receive',
    build() {
      const geometry = new BoxGeometry(0.4, 0.04, 0.4)
      const mesh = new Mesh(geometry, slabMaterial)
      mesh.castShadow = false
      mesh.receiveShadow = true
      mesh.visible = false
      return {
        objects: [mesh],
        dispose() {
          geometry.dispose()
        },
      }
    },
  },
  {
    id: 'instanced-standard-shadow',
    build() {
      const built = [
        instanced(coreWallMaterial, { castShadow: true, receiveShadow: true }),
        instanced(columnMaterial, { castShadow: true, receiveShadow: true }),
        instanced(woodMaterial, { castShadow: true, receiveShadow: true }),
        instanced(deskMaterial, { castShadow: true, receiveShadow: true }),
        instanced(chairMaterial, { castShadow: true, receiveShadow: true }),
      ]
      return {
        objects: built.map((item) => item.mesh),
        dispose() {
          built.forEach((item) => item.geometry.dispose())
        },
      }
    },
  },
  {
    id: 'instanced-physical-glass',
    build() {
      const built = instanced(meetingGlassMaterial, { castShadow: false, receiveShadow: true })
      return {
        objects: [built.mesh],
        dispose() {
          built.geometry.dispose()
        },
      }
    },
  },
  {
    id: 'instanced-monitor-basic',
    build() {
      const built = instanced(monitorMaterial, {
        castShadow: true,
        receiveShadow: true,
        layer: MONITOR_LAYER,
        color: new Color('#ff6a5c'),
      })
      return {
        objects: [built.mesh],
        dispose() {
          built.geometry.dispose()
        },
      }
    },
  },
  {
    id: 'ceiling-standard',
    build() {
      const geometry = new PlaneGeometry(0.4, 0.4)
      const mesh = new Mesh(geometry, ceilingMaterial)
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.visible = false
      return {
        objects: [mesh],
        dispose() {
          geometry.dispose()
        },
      }
    },
  },
  {
    id: 'desk-flash-basic',
    build() {
      const geometry = new PlaneGeometry(0.3, 0.3)
      const material = new MeshBasicMaterial({
        color: '#ff8a00',
        transparent: true,
        opacity: 1,
        depthWrite: false,
        toneMapped: false,
      })
      const mesh = new Mesh(geometry, material)
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.visible = false
      return {
        objects: [mesh],
        dispose() {
          geometry.dispose()
          material.dispose()
        },
      }
    },
  },
  {
    id: 'depth-proxy',
    build() {
      const geometry = new BoxGeometry(0.2, 0.2, 0.2)
      const material = new MeshDepthMaterial()
      configureDepthProxyMaterial(material, undefined, true)
      const mesh = new InstancedMesh(geometry, material, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(0, dummy.matrix)
      mesh.instanceMatrix.needsUpdate = true
      mesh.layers.set(DEPTH_PROXY_LAYER)
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.visible = false
      mesh.frustumCulled = false
      return {
        objects: [mesh],
        dispose() {
          geometry.dispose()
          material.dispose()
        },
      }
    },
  },
  {
    id: 'device-badge-shader',
    build() {
      const canvas = document.createElement('canvas')
      canvas.width = 8
      canvas.height = 8
      const texture = new CanvasTexture(canvas)
      texture.colorSpace = SRGBColorSpace
      const geometry = new PlaneGeometry(0.16, 0.16)
      geometry.setAttribute('aStatus', new InstancedBufferAttribute(new Float32Array([2]), 1))
      const material = new ShaderMaterial({
        uniforms: {
          uAtlas: { value: texture },
          uTime: { value: 0 },
        },
        vertexShader: `
attribute float aStatus;
uniform float uTime;
varying vec2 vUv;
varying float vStatus;
void main() {
  vUv = uv;
  vStatus = aStatus;
  vec4 worldCenter = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec4 mvPosition = viewMatrix * worldCenter;
  mvPosition.xy += position.xy;
  gl_Position = projectionMatrix * mvPosition;
}`,
        fragmentShader: `
uniform sampler2D uAtlas;
varying vec2 vUv;
varying float vStatus;
void main() {
  vec4 tex = texture2D(uAtlas, vec2((vUv.x + vStatus) / 4.0, vUv.y));
  if (tex.a < 0.45) discard;
  gl_FragColor = linearToOutputTexel(vec4(tex.rgb, 1.0));
}`,
        transparent: false,
        depthWrite: true,
        toneMapped: false,
      })
      const mesh = new InstancedMesh(geometry, material, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(0, dummy.matrix)
      mesh.instanceMatrix.needsUpdate = true
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.visible = false
      mesh.frustumCulled = false
      return {
        objects: [mesh],
        dispose() {
          geometry.dispose()
          material.dispose()
          texture.dispose()
        },
      }
    },
  },
  {
    id: 'room-label-line',
    build() {
      const geometry = new LineSegmentsGeometry()
      geometry.setPositions([0, 0, 0, 0.4, 0.8, 0.2])
      const material = new LineMaterial({
        color: 0x5c6b7c,
        linewidth: 1.5,
        worldUnits: false,
        dashed: false,
      })
      material.resolution.set(
        typeof window !== 'undefined' ? window.innerWidth : 1366,
        typeof window !== 'undefined' ? window.innerHeight : 768,
      )
      const line = new LineSegments2(geometry, material)
      line.computeLineDistances()
      line.visible = false
      return {
        objects: [line],
        dispose() {
          geometry.dispose()
          material.dispose()
        },
      }
    },
  },
]
