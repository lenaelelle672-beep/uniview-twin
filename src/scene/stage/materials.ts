import { DoubleSide, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial } from 'three'

/** 三维屏显示色。蓝图仍用 STATUS_HEX；这里单独写成显示色，保证告警/在线亮度比 ≥1.5。 */
export const MONITOR_DISPLAY_SRGB = {
  alarm: '#ff6b66',
  online: '#21864f',
  idle: '#2b58b3',
  offline: '#757b82',
} as const

function srgbVec3(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16)
  const r = ((value >> 16) & 255) / 255
  const g = ((value >> 8) & 255) / 255
  const b = (value & 255) / 255
  return `vec3(${r.toFixed(6)}, ${g.toFixed(6)}, ${b.toFixed(6)})`
}

export const slabMaterial = new MeshStandardMaterial({ color: '#e6e1d8', roughness: 0.86, metalness: 0.02 })
export const coreMaterial = new MeshStandardMaterial({ color: '#d5dbe3', roughness: 0.78, metalness: 0.04 })
export const coreWallMaterial = new MeshStandardMaterial({ color: '#eef1f4', roughness: 0.72, metalness: 0.05 })
export const darkMaterial = new MeshStandardMaterial({ color: '#2a313a', roughness: 0.55, metalness: 0.18 })
export const woodMaterial = new MeshStandardMaterial({ color: '#d7c4a8', roughness: 0.68, metalness: 0.04 })
export const metalMaterial = new MeshStandardMaterial({ color: '#9aa3ad', roughness: 0.38, metalness: 0.55 })
export const columnMaterial = new MeshStandardMaterial({ color: '#f7f8fa', roughness: 0.58, metalness: 0.08 })
export const ceilingMaterial = new MeshStandardMaterial({ color: '#f3f5f7', roughness: 0.9, metalness: 0, side: DoubleSide })
export const deskMaterial = new MeshStandardMaterial({ color: '#d9d0c3', roughness: 0.7, metalness: 0.04 })
export const chairMaterial = new MeshStandardMaterial({ color: '#3c4654', roughness: 0.62, metalness: 0.08 })
export const monitorMaterial = new MeshBasicMaterial({
  color: '#ffffff',
  vertexColors: true,
  // 本网格在合成器之后、NoToneMapping 通道里画。这里写死显示色，三层亮度一致。
  toneMapped: false,
})
monitorMaterial.onBeforeCompile = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <opaque_fragment>',
    `#include <opaque_fragment>
     #ifdef USE_COLOR
     float alarmMask = step(0.72, vColor.r) * step(vColor.g, 0.42) * step(vColor.b, 0.42);
     float onlineMask = step(0.35, vColor.g) * step(vColor.r + 0.15, vColor.g) * step(vColor.b + 0.05, vColor.g);
     float idleMask = step(0.55, vColor.b) * step(vColor.r, 0.45) * step(vColor.g, 0.45);
     vec3 rest = ${srgbVec3(MONITOR_DISPLAY_SRGB.offline)};
     rest = mix(rest, ${srgbVec3(MONITOR_DISPLAY_SRGB.idle)}, idleMask);
     rest = mix(rest, ${srgbVec3(MONITOR_DISPLAY_SRGB.online)}, onlineMask);
     gl_FragColor.rgb = mix(rest, ${srgbVec3(MONITOR_DISPLAY_SRGB.alarm)}, alarmMask);
     #endif`,
  )
}
monitorMaterial.customProgramCacheKey = () => 'monitor-untoned-display'
export const kitchenMaterial = new MeshStandardMaterial({ color: '#d5dbdf', roughness: 0.42, metalness: 0.35 })
export const fanFloorMaterial = new MeshStandardMaterial({ color: '#3e4652', roughness: 0.84, metalness: 0.04 })
export const seatMaterial = new MeshStandardMaterial({ color: '#c43648', roughness: 0.62, metalness: 0.06 })
export const stageMaterial = new MeshStandardMaterial({ color: '#c4a27a', roughness: 0.6, metalness: 0.06 })
export const atriumMaterial = new MeshStandardMaterial({ color: '#c5d0c8', roughness: 0.9, metalness: 0 })
export const atriumInnerMaterial = new MeshStandardMaterial({ color: '#8ea097', roughness: 0.92, metalness: 0 })
export const canteenMaterial = new MeshStandardMaterial({ color: '#efd3a4', roughness: 0.72, metalness: 0.04 })
export const receptionMaterial = new MeshStandardMaterial({ color: '#1d4e89', roughness: 0.45, metalness: 0.12 })
export const pantryMaterial = new MeshStandardMaterial({ color: '#e0a15a', roughness: 0.62, metalness: 0.05 })
export const meetingGlassMaterial = new MeshPhysicalMaterial({
  color: '#d5edf8',
  roughness: 0.06,
  metalness: 0.02,
  transparent: true,
  opacity: 0.34,
  depthWrite: false,
  envMapIntensity: 0.7,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
})
