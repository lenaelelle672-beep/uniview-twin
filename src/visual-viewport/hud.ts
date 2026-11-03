/**
 * T109：HUD 位移只在 .app[data-vv="1"] 下生效。
 * 不写 .stage / .scene-root / .workspace / canvas 的宽高，画布盒子保持原样。
 * 重合时去掉 data-vv，这些规则不参与，既有排版不变。
 */
import { hudCssVars, hudVarNames, type HudViewport } from './metrics'

export const VV_SHEET_ATTR = 'data-vv-sheet'

export const HUD_SHEET = [
  '.app[data-vv="1"] .topbar{translate:var(--vv-x) var(--vv-y)}',
  '.app[data-vv="1"] .floor-rail{translate:var(--vv-x) 0}',
  '.app[data-vv="1"] .floor-panel{top:var(--vv-y);bottom:var(--vv-b)}',
  '.app[data-vv="1"] .detail-panel{translate:calc(-1 * var(--vv-r)) 0}',
  '.app[data-vv="1"] .alarm-drawer{top:calc(56px + var(--vv-y));bottom:var(--vv-b);margin-inline-start:var(--vv-x);max-width:calc(var(--vv-w) - 24px)}',
  '.app[data-vv="1"] .viewmark-row{left:calc(12px + var(--vv-x));bottom:calc(44px + var(--vv-b))}',
  '.app[data-vv="1"] .viewmark-dock{max-height:min(320px,max(0px,calc(var(--vv-h) - 220px)))}',
  '.app[data-vv="1"] .back-button{top:calc(12px + var(--vv-y));left:calc(12px + var(--vv-x))}',
  '.app[data-vv="1"] .explode-button{top:calc(12px + var(--vv-y));right:calc(12px + var(--vv-r))}',
  '.app[data-vv="1"] .banner{top:calc(12px + var(--vv-y));left:calc(12px + var(--vv-x));right:calc(12px + var(--vv-r))}',
  '.app[data-vv="1"] .banner-error.is-second{top:calc(64px + var(--vv-y))}',
  '.app[data-vv="1"] .view-chip{left:calc(12px + var(--vv-x));bottom:calc(12px + var(--vv-b))}',
  '.app[data-vv="1"] .minimap-host{right:calc(12px + var(--vv-r));bottom:calc(40px + var(--vv-b))}',
  '.app[data-vv="1"] .shortcut-host{top:calc(56px + var(--vv-y));right:calc(12px + var(--vv-r));max-height:max(0px,calc(var(--vv-h) - 68px))}',
  '.app[data-vv="1"] .shortcut-sheet{max-height:min(640px,max(0px,calc(var(--vv-h) - 80px)))}',
  '.app[data-vv="1"] .asset-load{top:calc(56px + var(--vv-y))}',
].join('\n')

export interface HudStyleTarget {
  style: {
    setProperty(name: string, value: string): void
    removeProperty(name: string): void
  }
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
  getAttribute(name: string): string | null
}

export function applyHudViewport(node: HudStyleTarget, viewport: HudViewport): void {
  const vars = hudCssVars(viewport)
  for (const name of hudVarNames()) node.style.setProperty(name, vars[name])
  if (viewport.identity) node.removeAttribute('data-vv')
  else node.setAttribute('data-vv', '1')
}

export function clearHudViewport(node: HudStyleTarget): void {
  for (const name of hudVarNames()) node.style.removeProperty(name)
  node.removeAttribute('data-vv')
}
