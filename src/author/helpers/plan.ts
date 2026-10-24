/**
 * 要挂哪些 three 辅助。纯数据，不 import three / drei。
 * RectAreaLight 留给 T068，这里看见也不画。
 */

export type AuthorHelperKind = 'camera' | 'shadow' | 'directional' | 'hemisphere' | 'point' | 'spot'

export interface AuthorHelperTarget {
  kind: AuthorHelperKind
  object: object
}

export const AUTHOR_HELPER_SIZE = {
  directional: 24,
  hemisphere: 16,
  point: 4,
} as const

export const AUTHOR_HELPER_COLOR = {
  directional: '#ffb020',
  point: '#7ec8ff',
  spot: '#d58bff',
} as const

/** 阴影相机的视锥和主相机的橙色视锥分开。 */
export const AUTHOR_SHADOW_COLOR = { r: 0.24, g: 0.84, b: 0.55 } as const

interface LightNode {
  isDirectionalLight?: boolean
  isHemisphereLight?: boolean
  isPointLight?: boolean
  isSpotLight?: boolean
  isRectAreaLight?: boolean
  shadow?: { camera?: object | null }
}

interface Walkable {
  traverse: (visit: (node: LightNode) => void) => void
}

export function authorHelperName(kind: AuthorHelperKind): string {
  switch (kind) {
    case 'camera':
      return 'AuthorCameraHelper'
    case 'shadow':
      return 'AuthorShadowHelper'
    case 'directional':
      return 'AuthorDirectionalHelper'
    case 'hemisphere':
      return 'AuthorHemisphereHelper'
    case 'point':
      return 'AuthorPointHelper'
    case 'spot':
      return 'AuthorSpotHelper'
  }
}

export function authorHelperKey(plan: AuthorHelperTarget, index: number): string {
  const uuid = (plan.object as { uuid?: string }).uuid
  return `${plan.kind}:${uuid ?? index}`
}

export function planAuthorHelpers(scene: object, camera: object | null): AuthorHelperTarget[] {
  const plans: AuthorHelperTarget[] = []
  if (camera) plans.push({ kind: 'camera', object: camera })
  const walk = scene as Walkable
  walk.traverse((node) => {
    if (node.isRectAreaLight) return
    if (node.isDirectionalLight) {
      plans.push({ kind: 'directional', object: node })
      const shadow = node.shadow?.camera
      if (shadow && shadow !== camera) plans.push({ kind: 'shadow', object: shadow })
      return
    }
    if (node.isHemisphereLight) {
      plans.push({ kind: 'hemisphere', object: node })
      return
    }
    if (node.isPointLight) {
      plans.push({ kind: 'point', object: node })
      return
    }
    if (node.isSpotLight) plans.push({ kind: 'spot', object: node })
  })
  return plans
}
