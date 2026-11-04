import {
  GRADIENT_SKY_BASE,
  GRADIENT_SKY_COLORS,
  GRADIENT_SKY_LAYERS,
  GRADIENT_SKY_ORDER,
  GRADIENT_SKY_RADIUS,
  GRADIENT_SKY_STOPS,
  type GradientSkyState,
} from './plan'

/** 开关分包和天幕分包各带一份，状态只放在 window 上。 */
export function publishGradientSky(on: boolean, mounted: boolean, state: GradientSkyState): void {
  window.__twinGradientSky = {
    on,
    mounted,
    state,
    impl: 'drei-GradientTexture',
    stops: GRADIENT_SKY_STOPS,
    colors: GRADIENT_SKY_COLORS,
    base: GRADIENT_SKY_BASE,
    radius: GRADIENT_SKY_RADIUS,
    order: GRADIENT_SKY_ORDER,
    layers: GRADIENT_SKY_LAYERS,
    background: 'untouched',
    environment: 'untouched',
    cdn: false,
  }
}
