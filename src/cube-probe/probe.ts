import {
  CUBE_PROBE_FRAMES,
  CUBE_PROBE_LAYERS,
  CUBE_PROBE_NEAR,
  CUBE_PROBE_RESOLUTION,
  type CubeProbeState,
} from './plan'

/** 开关分包和探针分包各带一份，状态只放在 window 上。 */
export function publishCubeProbe(next: {
  switchOn: boolean
  on: boolean
  mounted: boolean
  baked: boolean
  stopped: boolean
  updates: number
  state: CubeProbeState
  floorId: string | null
  mesh: string | null
  far: number | null
}): void {
  window.__twinCubeProbe = {
    ...next,
    frames: CUBE_PROBE_FRAMES,
    resolution: CUBE_PROBE_RESOLUTION,
    near: CUBE_PROBE_NEAR,
    continuous: false,
    impl: 'drei-cube-camera',
    cdn: false,
    reflector: false,
    transmissive: false,
    layers: CUBE_PROBE_LAYERS,
  }
}

/** 烘完一次之后只补 baked / stopped / updates，不把开关和让位原因盖掉。 */
export function noteCubeBake(mesh: string | null, far: number | null): void {
  const prev = window.__twinCubeProbe
  if (!prev) return
  window.__twinCubeProbe = {
    ...prev,
    on: true,
    mounted: true,
    baked: true,
    stopped: true,
    updates: CUBE_PROBE_FRAMES,
    mesh: mesh ?? prev.mesh,
    far: far ?? prev.far,
    frames: CUBE_PROBE_FRAMES,
    continuous: false,
  }
}
