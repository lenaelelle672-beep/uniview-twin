import type { SurfaceMode } from './materials'

/**
 * T033 总览大气雾。
 *
 * 用 three FogExp2，不用线性 Fog。
 * 线性 near/far 能把「楼」和「远地」切干净，但总览视距约 167 m、拉远上限 520 m：
 * 拉远时楼体整段跨过 near，会整栋吞进雾。Exp2 的雾量是 1 - exp(-(density · z)²)，
 * 近处按视深平方接近 0，远处才起来，拉到最远也是渐强而不是阶跃到全雾。
 * three r152 之后线性雾是 smoothstep，大地面上更易出带；Exp2 更缓，因此不开 dithering。
 *
 * 雾写在材质片元里、色调映射之前。雾色必须与昼夜 background 同一套十六进制，
 * 否则全雾处和清屏色在 AgX 下对不齐，远景会脏一圈天。
 *
 * 视深是 three 的 vFogDepth（-mvPosition.z，米），不是到相机的直线距离。
 * 总览机位 [24, 70, 210] 看向 [0, 36, 48] 时量过：
 * 东楼南缘约 94 m，东楼中段约 148 m，塔楼约 210 m，北侧远草坪约 308–343 m，
 * 画面底部近草约 18 m。进层标签大约几十米。密度按这组视深标定。
 *
 * 白模背景是 #000000。黑雾会把白模体块染脏，和白模干净的底相反，所以 model 不挂雾。
 */

/** 与总览清屏色同一套。Scene 的 background 也读这里，避免雾色和背景各写一遍。 */
export const SCENE_BACKGROUND: Record<SurfaceMode, string> = {
  day: '#bdd2e6',
  night: '#07111c',
  model: '#000000',
}

/**
 * FogExp2 density（1/米）。
 * 昼略高于夜：夜雾色接近纯黑，同样密度会更快吃掉塔楼剪影，所以夜套更稀。
 */
export const FOG_DENSITY: Record<'day' | 'night', number> = {
  day: 0.00112,
  night: 0.00096,
}

/** 标定视深（米）。改密度时对着 fog.test.ts 的雾量窗，不要只改一个数。 */
export const FOG_VIEW_DEPTH = {
  /** 进层标签 / 近景工位。 */
  floorLabel: 40,
  /** 总览东楼南缘，最近的楼体。 */
  nearFacade: 94,
  /** 总览东楼中段。 */
  eastBlock: 148,
  /** 总览塔楼。 */
  tower: 210,
  /** 总览北侧远草坪（用地远缘约 308–343 m 的代表值）。 */
  farGround: 330,
  /** 沿总览方向拉到相机最远时，塔楼的大致视深（520/167×210）。 */
  zoomedOutTower: 650,
} as const

const DAY_FOG = { color: SCENE_BACKGROUND.day, density: FOG_DENSITY.day } as const
const NIGHT_FOG = { color: SCENE_BACKGROUND.night, density: FOG_DENSITY.night } as const

export type OverviewFogPreset = { readonly color: string; readonly density: number }

/** 昼 / 夜各一套稳定对象；白模返回 null，调用方不要挂雾。 */
export function overviewFog(mode: SurfaceMode): OverviewFogPreset | null {
  if (mode === 'day') return DAY_FOG
  if (mode === 'night') return NIGHT_FOG
  return null
}

/** three FogExp2：1 - exp(-(density · viewDepth)²)。viewDepth ≤ 0 时没有雾。 */
export function fogExp2Factor(density: number, viewDepth: number): number {
  if (viewDepth <= 0 || density <= 0) return 0
  const scaled = density * viewDepth
  return 1 - Math.exp(-scaled * scaled)
}
