import type { WebGLRenderer } from 'three'

export interface ProgramSnap {
  name: string
  cacheKey: string
}

export function programKeys(gl: WebGLRenderer): string[] {
  return (gl.info.programs ?? []).map((program) => program.cacheKey)
}

export function programCount(gl: WebGLRenderer): number {
  return gl.info.programs?.length ?? 0
}

export function snapshotPrograms(gl: WebGLRenderer, label: string): ProgramSnap[] {
  const snap = (gl.info.programs ?? []).map((program) => ({
    name: program.name,
    cacheKey: program.cacheKey,
  }))
  const bag = window.__twinProgramSnaps ?? (window.__twinProgramSnaps = {})
  bag[label] = snap
  return snap
}
