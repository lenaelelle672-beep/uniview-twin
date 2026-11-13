import { CatmullRomCurve3, Vector3 } from 'three'
import { CABLE_RUNS, TUBE_CURVE_TENSION, TUBE_CURVE_TYPE, type CableRun } from './plan'

/**
 * T126：Tube 的 args 只建一次。
 * 曲线、分段、半径都写在模块缓存里。组件每次渲染拿同一份引用，不在渲染里重建。
 */

export interface BuiltTube {
  run: CableRun
  args: [CatmullRomCurve3, number, number, number, false]
}

let cache: BuiltTube[] | null = null

export function cableTubeArgs(): BuiltTube[] {
  if (cache) return cache
  cache = CABLE_RUNS.map((run) => {
    const points = run.points.map(([x, y, z]) => new Vector3(x, y, z))
    const curve = new CatmullRomCurve3(points, false, TUBE_CURVE_TYPE, TUBE_CURVE_TENSION)
    return {
      run,
      args: [curve, run.tubularSegments, run.radius, run.radialSegments, false],
    }
  })
  return cache
}
