/**
 * T121：楼壳着色门闩。
 * 这里不 import drei，也不 import three。开关可以进晚加载分包，shaderMaterial 仍留在另一包。
 * 告警色和夜间自发光只叠在已有实体壳上，不另起一套昼夜调色。
 * 白模、蓝图、单层关掉。单层会给实体壳写裁切面，自定义着色器不跟着裁。
 */

/** 与软阴影、点云同一道首帧后窗口。字面量写在这里，懒包不再去引那份模块。 */
export const SHELL_SHADER_AFTER_FIRST_MS = 2600

/**
 * materials.ts 里 solidMaterial 的粗糙度和金属度。
 * applySurfaceMode 只改它的 color，这两项昼夜都不变，用来认出实体壳。
 */
export const SOLID_SHELL_ROUGHNESS = 0.62
export const SOLID_SHELL_METALNESS = 0.05

/** 与传感器点云的告警色同一个色值。叠色很浅，不替换壳的本色。 */
export const ALARM_TINT = '#ff4d4f'

/** 夜间往上的一面多一点冷色，墙面更弱。不改 solidMaterial 的夜间底色。 */
export const NIGHT_EMISSIVE = '#b9d7f2'

/** 加法叠色的上限。再大就会盖住实体壳原来的昼夜颜色。 */
export const SHELL_ALARM_MIX = 0.1
export const SHELL_NIGHT_MIX = 0.22

/** three 的 AdditiveBlending。懒包不从入口包再取这个常量。 */
export const SHELL_SHADER_BLENDING = 2

export type ShellShaderState = 'on' | 'pending' | 'off-switch' | 'off-view' | 'off-model' | 'off-quiet'

export interface ShellShaderGate {
  view: string
  dayNight: string
  presentation: string
  optOut: boolean
  alarmCount: number
}

export interface ShellShaderMix {
  alarm: number
  night: number
}

export function shellAlarmTotal(floors: readonly { alarmCount: number }[]): number {
  let total = 0
  for (const floor of floors) {
    if (floor.alarmCount > 0) total += floor.alarmCount
  }
  return total
}

export function shellAlarmMix(alarmCount: number, presentation: string): number {
  if (presentation === 'model') return 0
  if (alarmCount <= 0) return 0
  return SHELL_ALARM_MIX
}

export function shellNightMix(dayNight: string, presentation: string): number {
  if (presentation === 'model') return 0
  if (dayNight !== 'night') return 0
  return SHELL_NIGHT_MIX
}

export function shellShaderMix(gate: ShellShaderGate): ShellShaderMix {
  return {
    alarm: shellAlarmMix(gate.alarmCount, gate.presentation),
    night: shellNightMix(gate.dayNight, gate.presentation),
  }
}

/**
 * 只在总览、并且真有叠色时打开。
 * 夜景没有告警也开：只要夜间自发光。白天没有告警就不开，避免空着色器。
 * 白模继续走 solidMaterial 本体。单层和蓝图不叠。
 */
export function shellShaderState(gate: ShellShaderGate, due: boolean): ShellShaderState {
  if (gate.optOut) return 'off-switch'
  if (gate.presentation === 'model') return 'off-model'
  if (gate.view !== 'building') return 'off-view'
  const mix = shellShaderMix(gate)
  if (mix.alarm <= 0 && mix.night <= 0) return 'off-quiet'
  if (!due) return 'pending'
  return 'on'
}

export function shellShaderChunkDue(firstFrameAt: number | null | undefined, now: number): boolean {
  if (typeof firstFrameAt !== 'number' || !Number.isFinite(firstFrameAt)) return false
  if (!Number.isFinite(now)) return false
  return now - firstFrameAt >= SHELL_SHADER_AFTER_FIRST_MS
}

/** 窗口过了一次就一直算过。爆炸或 RenderProbe 删掉首帧标记时叠色不闪掉。 */
export function shellShaderDueLatched(
  latched: boolean,
  firstFrameAt: number | null | undefined,
  now: number,
): boolean {
  return latched || shellShaderChunkDue(firstFrameAt, now)
}

export function shellShaderSearchOf(value: string): string {
  if (!value) return ''
  const hash = value.indexOf('#')
  const before = hash >= 0 ? value.slice(0, hash) : value
  const query = before.indexOf('?')
  if (query >= 0) return before.slice(query)
  if (before.includes('=')) return before
  return ''
}

/** `?shellShader=0` 关掉。其它取值不当开关。 */
export function shellShaderOptOut(value: string): boolean {
  const search = shellShaderSearchOf(value)
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).get('shellShader') === '0'
}

/** 地址栏同步会丢掉 shellShader，开关分包又晚于同步加载，所以也看启动地址。 */
export function shellShaderOptOutAtBoot(live: string, navigationUrl: string): boolean {
  return shellShaderOptOut(live) || shellShaderOptOut(navigationUrl)
}
