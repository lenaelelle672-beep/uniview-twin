import { Color, DoubleSide, FrontSide, MeshPhysicalMaterial, MeshStandardMaterial, type Material } from 'three'

export type SurfaceMode = 'day' | 'night' | 'model'

const GRID_KEY = 'twin-curtain-v2'
const GRILLE_KEY = 'twin-grille-v1'

function injectPositionVarying(shader: { vertexShader: string; fragmentShader: string }, fragmentHeader = '') {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <project_vertex>',
    `#include <project_vertex>
     vTwinPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
     vTwinNor = normalize(mat3(modelMatrix) * normal);`,
  )
  shader.vertexShader = shader.vertexShader.replace(
    '#include <common>',
    '#include <common>\nvarying vec3 vTwinPos;\nvarying vec3 vTwinNor;',
  )
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    `#include <common>\nvarying vec3 vTwinPos;\nvarying vec3 vTwinNor;\n${fragmentHeader}`,
  )
}

function facadeUv(): string {
  return `
    vec3 nrm = normalize(vTwinNor);
    float ax = abs(nrm.x);
    float ay = abs(nrm.y);
    float az = abs(nrm.z);
    vec2 guv = (ay >= ax && ay >= az) ? vTwinPos.xz : (ax >= az ? vTwinPos.zy : vTwinPos.xy);
  `
}

export function createCurtainMaterial(): MeshPhysicalMaterial {
  const grid = new Color('#3d5870')
  const strength = { value: 0.78 }
  const material = new MeshPhysicalMaterial({
    color: '#4a4e52',
    metalness: 0.8,
    roughness: 0.06,
    envMapIntensity: 1.15,
    side: FrontSide,
  })
  material.userData.grid = grid
  material.userData.strength = strength
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrid = { value: grid }
    shader.uniforms.uLine = strength
    injectPositionVarying(shader, 'uniform vec3 uGrid;\nuniform float uLine;')
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>
       ${facadeUv()}
       vec2 fr = fract(guv / 1.55);
       float vEdge = min(fr.x, 1.0 - fr.x);
       float hEdge = min(fr.y, 1.0 - fr.y);
       float vLine = 1.0 - smoothstep(0.028, 0.07, vEdge);
       float hLine = 1.0 - smoothstep(0.045, 0.1, hEdge);
       float line = max(vLine, hLine * 0.42);
       gl_FragColor.rgb = mix(gl_FragColor.rgb, uGrid, line * uLine);`,
    )
  }
  material.customProgramCacheKey = () => GRID_KEY
  return material
}

export function createGrilleMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: '#3a424a',
    roughness: 0.36,
    metalness: 0.78,
    envMapIntensity: 0.7,
  })
  material.onBeforeCompile = (shader) => {
    injectPositionVarying(shader)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>
       ${facadeUv()}
       vec2 cell = fract(guv / 0.78) - 0.5;
       if (length(cell) < 0.22) discard;`,
    )
  }
  material.customProgramCacheKey = () => GRILLE_KEY
  return material
}

export const curtainMaterial = createCurtainMaterial()
export const grilleMaterial = createGrilleMaterial()
export const solidMaterial = new MeshStandardMaterial({ color: '#f4f5f7', roughness: 0.62, metalness: 0.05 })
export const jointMaterial = new MeshStandardMaterial({ color: '#fbfcfd', roughness: 0.5, metalness: 0.04 })
export const revealMaterial = new MeshStandardMaterial({ color: '#5c6772', roughness: 0.72, metalness: 0.08 })
export const highlightCurtainMaterial = new MeshStandardMaterial({
  color: '#ffd7a1',
  emissive: '#e8890c',
  emissiveIntensity: 0.72,
  roughness: 0.42,
  metalness: 0.08,
  toneMapped: false,
})
export const highlightJointMaterial = new MeshStandardMaterial({
  color: '#ffe3a8',
  emissive: '#ff9d1f',
  emissiveIntensity: 1.05,
  roughness: 0.38,
  metalness: 0.06,
  toneMapped: false,
})
export const finMaterial = new MeshStandardMaterial({
  color: '#c5cad3',
  roughness: 0.42,
  metalness: 0.48,
  envMapIntensity: 0.42,
})
/** 弧形檐口铝板带。只赋给裙房那条带，避免把实体墙一起刷白。 */
export const eaveMaterial = new MeshStandardMaterial({
  color: '#e7eef1',
  roughness: 0.46,
  metalness: 0.28,
  envMapIntensity: 0.3,
})
/** 研发中心下层和可见石材基座。 */
export const baseMaterial = new MeshStandardMaterial({
  color: '#8f8c89',
  roughness: 0.86,
  metalness: 0.02,
  envMapIntensity: 0.2,
})
export const stoneMaterial = new MeshStandardMaterial({ color: '#d7d2c8', roughness: 0.86, metalness: 0 })
export const courtWallMaterial = new MeshStandardMaterial({
  color: '#c4bfb4',
  roughness: 0.9,
  metalness: 0,
  side: DoubleSide,
})
export const grassMaterial = new MeshStandardMaterial({ color: '#5d6b38', roughness: 0.96, metalness: 0 })
export const pavingMaterial = new MeshStandardMaterial({ color: '#c5d0d8', roughness: 0.88, metalness: 0 })
export const deckMaterial = new MeshStandardMaterial({ color: '#d9d5cc', roughness: 0.88, metalness: 0 })
export const roadMaterial = new MeshStandardMaterial({ color: '#2c2e3c', roughness: 0.94, metalness: 0.02 })
export const sidewalkMaterial = new MeshStandardMaterial({ color: '#b7c6d0', roughness: 0.88, metalness: 0 })
export const zebraMaterial = new MeshStandardMaterial({ color: '#f2f2f0', roughness: 0.7, metalness: 0 })
export const plinthMaterial = new MeshStandardMaterial({ color: '#8d8d8d', roughness: 0.8, metalness: 0 })

export function applySurfaceMode(mode: SurfaceMode) {
  const grid = curtainMaterial.userData.grid as Color
  const strength = curtainMaterial.userData.strength as { value: number }
  if (mode === 'model') {
    curtainMaterial.color.set('#f2f3f4')
    curtainMaterial.metalness = 0.02
    curtainMaterial.roughness = 0.8
    curtainMaterial.envMapIntensity = 0.04
    curtainMaterial.emissive.set('#000000')
    curtainMaterial.emissiveIntensity = 0
    grid.set('#3c444c')
    strength.value = 0.96
    grilleMaterial.color.set('#f5f5f5')
    grilleMaterial.metalness = 0.08
    grilleMaterial.roughness = 0.48
    grilleMaterial.envMapIntensity = 0.2
    solidMaterial.color.set('#f3f3f3')
    jointMaterial.color.set('#f7f7f7')
    jointMaterial.metalness = 0.04
    jointMaterial.roughness = 0.5
    jointMaterial.envMapIntensity = 0.08
    revealMaterial.color.set('#2a3138')
    finMaterial.color.set('#d5d8dc')
    finMaterial.metalness = 0.08
    finMaterial.roughness = 0.5
    finMaterial.envMapIntensity = 0.2
    eaveMaterial.color.set('#f4f5f6')
    eaveMaterial.metalness = 0.04
    eaveMaterial.roughness = 0.55
    eaveMaterial.envMapIntensity = 0.08
    baseMaterial.color.set('#e4e4e4')
    baseMaterial.metalness = 0
    baseMaterial.roughness = 0.8
    baseMaterial.envMapIntensity = 0.08
    stoneMaterial.color.set('#e6e6e6')
    courtWallMaterial.color.set('#e6e6e6')
    deckMaterial.color.set('#dedede')
  } else if (mode === 'night') {
    curtainMaterial.color.set('#173a64')
    curtainMaterial.metalness = 0.48
    curtainMaterial.roughness = 0.2
    curtainMaterial.envMapIntensity = 0.42
    curtainMaterial.emissive.set('#1b4f88')
    curtainMaterial.emissiveIntensity = 0.62
    grid.set('#d7e7f6')
    strength.value = 0.5
    grilleMaterial.color.set('#8d949c')
    grilleMaterial.metalness = 0.55
    grilleMaterial.roughness = 0.4
    grilleMaterial.envMapIntensity = 0.28
    solidMaterial.color.set('#c8ced6')
    jointMaterial.color.set('#f3f6fa')
    revealMaterial.color.set('#1c2430')
    finMaterial.color.set('#9aa0aa')
    finMaterial.metalness = 0.4
    finMaterial.roughness = 0.46
    finMaterial.envMapIntensity = 0.2
    eaveMaterial.color.set('#c5ced4')
    eaveMaterial.metalness = 0.2
    eaveMaterial.roughness = 0.5
    eaveMaterial.envMapIntensity = 0.16
    baseMaterial.color.set('#6a6764')
    baseMaterial.metalness = 0.02
    baseMaterial.roughness = 0.88
    baseMaterial.envMapIntensity = 0.1
    stoneMaterial.color.set('#8a867e')
    courtWallMaterial.color.set('#8a867e')
    deckMaterial.color.set('#6e6a64')
    grassMaterial.color.set('#1d2a22')
    pavingMaterial.color.set('#2a2e32')
    roadMaterial.color.set('#1a1d22')
    sidewalkMaterial.color.set('#2c3034')
    zebraMaterial.color.set('#d8d8d4')
  } else {
    curtainMaterial.color.set('#9aa0a6')
    curtainMaterial.metalness = 0.98
    curtainMaterial.roughness = 0.03
    curtainMaterial.envMapIntensity = 2.05
    curtainMaterial.emissive.set('#000000')
    curtainMaterial.emissiveIntensity = 0
    grid.set('#142636')
    strength.value = 0.92
    grilleMaterial.color.set('#5a6e84')
    grilleMaterial.metalness = 0.55
    grilleMaterial.roughness = 0.4
    grilleMaterial.envMapIntensity = 0.45
    solidMaterial.color.set('#f4f5f7')
    jointMaterial.color.set('#5e7388')
    jointMaterial.metalness = 0.35
    jointMaterial.roughness = 0.5
    jointMaterial.envMapIntensity = 0.35
    revealMaterial.color.set('#5d6874')
    finMaterial.color.set('#a8b0be')
    finMaterial.metalness = 0.22
    finMaterial.roughness = 0.5
    finMaterial.envMapIntensity = 0.36
    eaveMaterial.color.set('#f4f8fa')
    eaveMaterial.metalness = 0.42
    eaveMaterial.roughness = 0.32
    eaveMaterial.envMapIntensity = 0.85
    baseMaterial.color.set('#d4c8bc')
    baseMaterial.metalness = 0.02
    baseMaterial.roughness = 0.88
    baseMaterial.envMapIntensity = 0.15
    stoneMaterial.color.set('#b0ada8')
    courtWallMaterial.color.set('#9a9692')
    deckMaterial.color.set('#d9d5cc')
    grassMaterial.color.set('#52762c')
    pavingMaterial.color.set('#d5e3ec')
    roadMaterial.color.set('#1c1e30')
    sidewalkMaterial.color.set('#e7f1f6')
    zebraMaterial.color.set('#f2f2f0')
  }
  const touched: Material[] = [
    curtainMaterial,
    grilleMaterial,
    solidMaterial,
    jointMaterial,
    revealMaterial,
    finMaterial,
    eaveMaterial,
    baseMaterial,
    stoneMaterial,
    courtWallMaterial,
    grassMaterial,
    pavingMaterial,
    deckMaterial,
    roadMaterial,
    sidewalkMaterial,
    zebraMaterial,
  ]
  touched.forEach((material) => {
    material.needsUpdate = true
  })
}
