import { Color, DoubleSide, FrontSide, MeshPhysicalMaterial, MeshStandardMaterial, type Material } from 'three'

export type SurfaceMode = 'day' | 'night' | 'model'

const GRID_KEY = 'twin-curtain-v1'
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
  const grid = new Color('#f4f8fb')
  const strength = { value: 0.78 }
  const material = new MeshPhysicalMaterial({
    color: '#8eb4d4',
    metalness: 0.72,
    roughness: 0.07,
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
       float edge = min(min(fr.x, 1.0 - fr.x), min(fr.y, 1.0 - fr.y));
       float line = 1.0 - smoothstep(0.03, 0.072, edge);
       gl_FragColor.rgb = mix(gl_FragColor.rgb, uGrid, line * uLine);`,
    )
  }
  material.customProgramCacheKey = () => GRID_KEY
  return material
}

export function createGrilleMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: '#f7f8fa',
    roughness: 0.48,
    metalness: 0.08,
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
export const finMaterial = new MeshStandardMaterial({ color: '#e4e7eb', roughness: 0.5, metalness: 0.08 })
export const stoneMaterial = new MeshStandardMaterial({ color: '#d7d2c8', roughness: 0.86, metalness: 0 })
export const courtWallMaterial = new MeshStandardMaterial({
  color: '#c4bfb4',
  roughness: 0.9,
  metalness: 0,
  side: DoubleSide,
})
export const grassMaterial = new MeshStandardMaterial({ color: '#b7c3ad', roughness: 0.95, metalness: 0 })
export const pavingMaterial = new MeshStandardMaterial({ color: '#e3e0d8', roughness: 0.9, metalness: 0 })
export const deckMaterial = new MeshStandardMaterial({ color: '#d9d5cc', roughness: 0.88, metalness: 0 })
export const roadMaterial = new MeshStandardMaterial({ color: '#3c4148', roughness: 0.92, metalness: 0.02 })
export const sidewalkMaterial = new MeshStandardMaterial({ color: '#c9c3b8', roughness: 0.9, metalness: 0 })
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
    grid.set('#5e656c')
    strength.value = 0.92
    grilleMaterial.color.set('#f5f5f5')
    solidMaterial.color.set('#f3f3f3')
    jointMaterial.color.set('#5e666e')
    finMaterial.color.set('#d5d8dc')
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
    grilleMaterial.color.set('#d5dae0')
    solidMaterial.color.set('#c8ced6')
    jointMaterial.color.set('#e7edf3')
    finMaterial.color.set('#b7bec6')
    stoneMaterial.color.set('#8a867e')
    courtWallMaterial.color.set('#8a867e')
    deckMaterial.color.set('#6e6a64')
    grassMaterial.color.set('#1d2a22')
    pavingMaterial.color.set('#2a2e32')
    roadMaterial.color.set('#1a1d22')
    sidewalkMaterial.color.set('#2c3034')
    zebraMaterial.color.set('#d8d8d4')
  } else {
    curtainMaterial.color.set('#8eb4d4')
    curtainMaterial.metalness = 0.72
    curtainMaterial.roughness = 0.07
    curtainMaterial.envMapIntensity = 1.15
    curtainMaterial.emissive.set('#000000')
    curtainMaterial.emissiveIntensity = 0
    grid.set('#f4f8fb')
    strength.value = 0.8
    grilleMaterial.color.set('#f7f8fa')
    solidMaterial.color.set('#f4f5f7')
    jointMaterial.color.set('#fbfcfd')
    finMaterial.color.set('#e4e7eb')
    stoneMaterial.color.set('#d7d2c8')
    courtWallMaterial.color.set('#c4bfb4')
    deckMaterial.color.set('#d9d5cc')
    grassMaterial.color.set('#b7c3ad')
    pavingMaterial.color.set('#e3e0d8')
    roadMaterial.color.set('#3c4148')
    sidewalkMaterial.color.set('#c9c3b8')
    zebraMaterial.color.set('#f2f2f0')
  }
  const touched: Material[] = [
    curtainMaterial,
    grilleMaterial,
    solidMaterial,
    jointMaterial,
    finMaterial,
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
