import { MeshStandardMaterial, SkinnedMesh, type Camera, type Scene, type WebGLRenderer } from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ROOM_LABEL_FONT } from '../stage/roomLabels'
import { installMeshopt } from '../meshopt'
import { compileObjects } from './compileGroup'

const PEOPLE_URLS = [
  '/models/people/man-in-suit.glb',
  '/models/people/woman-casual.glb',
  '/models/people/man-in-suit-lod1.glb',
  '/models/people/woman-casual-lod1.glb',
]

function syncText(text: { sync: (cb: () => void) => void }): Promise<void> {
  return new Promise((resolve) => {
    text.sync(() => resolve())
  })
}

/** 字体参数与 BatchedRoomLabels 一致，把 SDF 探测 context 和 text program 挤到空闲时。 */
export async function compileTroikaSample(
  gl: WebGLRenderer,
  liveScene: Scene,
  camera: Camera,
  characters: string,
): Promise<void> {
  const { disableTroikaCdnFallback } = await import('../stage/disableTroikaCdn')
  disableTroikaCdnFallback()
  const { BatchedText, Text } = await import('troika-three-text')
  const batch = new BatchedText()
  batch.name = 'TwinPrewarmBatchedText'
  batch.font = ROOM_LABEL_FONT
  batch.color = '#17324d'
  batch.outlineColor = '#f7f4ee'
  batch.anchorX = 'center'
  batch.anchorY = 'middle'
  batch.visible = false
  batch.frustumCulled = false
  const members = ['电梯厅', '洽谈室', '会议室'].map((label) => {
    const text = new Text()
    text.text = label
    text.font = ROOM_LABEL_FONT
    text.fontSize = 0.78
    text.color = '#17324d'
    text.outlineWidth = Math.max(0.03, 0.78 * 0.055)
    text.outlineColor = '#f7f4ee'
    text.anchorX = 'center'
    text.anchorY = 'middle'
    text.characters = characters
    text.frustumCulled = false
    batch.addText(text)
    return text
  })
  try {
    await Promise.all(members.map((text) => syncText(text)))
    await syncText(batch)
    await compileObjects(gl, liveScene, camera, [batch, ...members])
  } finally {
    batch.dispose()
    members.forEach((text) => text.dispose())
  }
}

function preparePeople(gltf: GLTF) {
  const objects: SkinnedMesh[] = []
  gltf.scene.traverse((child) => {
    const mesh = child as SkinnedMesh
    if (!mesh.isSkinnedMesh) return
    mesh.frustumCulled = false
    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.visible = false
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      const standard = material as MeshStandardMaterial
      standard.vertexColors = true
      standard.color?.set('#ffffff')
      standard.needsUpdate = true
    }
    objects.push(mesh)
  })
  return objects
}

export async function compilePeopleGroup(
  gl: WebGLRenderer,
  liveScene: Scene,
  camera: Camera,
  url: string,
): Promise<void> {
  const loader = new GLTFLoader()
  installMeshopt(loader)
  const gltf = await loader.loadAsync(url)
  const objects = preparePeople(gltf)
  if (objects.length === 0) return
  await compileObjects(gl, liveScene, camera, objects)
}

export function peopleModelUrls(includePeople: boolean): string[] {
  return includePeople ? PEOPLE_URLS : []
}
