import { shaderMaterial } from '@react-three/drei/core/shaderMaterial'
import { Color, type ShaderMaterial } from 'three'
import {
  ALARM_TINT,
  NIGHT_EMISSIVE,
  SHELL_SHADER_BLENDING,
} from './plan'

/**
 * T121：drei shaderMaterial 的楼壳薄封装。
 * 只加告警色和夜间自发光，不替换 MeshStandardMaterial，也不重写整套材质。
 * 与 T115 拾取代理分开：那条路自己包了一份 shaderMaterial，这里是业务楼壳叠色。
 * 片段着色器不丢弃片元。不引用反射平面，也不写透射。
 */

export const SHELL_VERTEX = `
varying vec3 vNormal;
void main() {
  vNormal = mat3(modelMatrix) * normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const SHELL_FRAGMENT = `
varying vec3 vNormal;
uniform vec3 uAlarm;
uniform vec3 uNight;
uniform float uAlarmMix;
uniform float uNightMix;
void main() {
  float lenN = length(vNormal);
  float up = lenN < 0.001 ? 0.5 : clamp(vNormal.y / lenN, 0.0, 1.0);
  float lift = 0.35 + 0.65 * up;
  vec3 rgb = uAlarm * uAlarmMix + uNight * uNightMix * lift;
  gl_FragColor = vec4(rgb, 1.0);
}
`

export type ShellShaderMaterial = ShaderMaterial & {
  uAlarm: Color
  uNight: Color
  uAlarmMix: number
  uNightMix: number
}

type ShellShaderCtor = (new () => ShellShaderMaterial) & { key?: string }

let Impl: ShellShaderCtor | null = null

function shellShaderCtor(): ShellShaderCtor {
  Impl ??= shaderMaterial(
    {
      uAlarm: new Color(ALARM_TINT),
      uNight: new Color(NIGHT_EMISSIVE),
      uAlarmMix: 0,
      uNightMix: 0,
    },
    SHELL_VERTEX,
    SHELL_FRAGMENT,
  ) as ShellShaderCtor
  return Impl
}

/** 一份共享材质，多个实体壳共用。加法、不写深度，实体壳原来的光照还在底下。 */
export function createShellShaderMaterial(): ShellShaderMaterial {
  const material = new (shellShaderCtor())()
  material.name = 'ShellShader'
  material.transparent = true
  material.depthWrite = false
  material.depthTest = true
  material.blending = SHELL_SHADER_BLENDING
  material.fog = false
  material.toneMapped = false
  material.polygonOffset = true
  material.polygonOffsetFactor = -4
  material.polygonOffsetUnits = -4
  return material
}

export function shellShaderClassKey(): string {
  return shellShaderCtor().key ?? ''
}
