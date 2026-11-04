import type { Object3D } from 'three'
import { releaseShellTints, syncShellTints } from './apply'
import { createShellShaderMaterial, type ShellShaderMaterial } from './material'
import type { ShellShaderMix } from './plan'

/**
 * T121：着色运行时。dock 不直接 import 这个文件。
 * shaderMaterial 在 ./material 里，生产构建再把它拆成单独的分包。
 */

let material: ShellShaderMaterial | null = null

export function syncShellShader(scene: Object3D, mixes: ShellShaderMix): number {
  material ??= createShellShaderMaterial()
  return syncShellTints(scene, material, mixes)
}

export function releaseShellShader(scene: Object3D): void {
  releaseShellTints(scene)
  material?.dispose()
  material = null
}
