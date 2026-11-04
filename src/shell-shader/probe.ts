import {
  SOLID_SHELL_METALNESS,
  SOLID_SHELL_ROUGHNESS,
  type ShellShaderState,
} from './plan'

/** 开关分包写到 window 上。着色分包不写这份探针。 */
export function publishShellShader(patch: {
  on: boolean
  mounted: boolean
  state: ShellShaderState
  meshes?: number
  alarmMix?: number
  nightMix?: number
}): void {
  const prev = window.__twinShellShader
  window.__twinShellShader = {
    on: patch.on,
    mounted: patch.mounted,
    state: patch.state,
    impl: 'drei-shaderMaterial',
    meshes: patch.meshes ?? prev?.meshes ?? 0,
    alarmMix: patch.alarmMix ?? prev?.alarmMix ?? 0,
    nightMix: patch.nightMix ?? prev?.nightMix ?? 0,
    roughness: SOLID_SHELL_ROUGHNESS,
    metalness: SOLID_SHELL_METALNESS,
    replacesSolid: false,
    cdn: false,
  }
}
