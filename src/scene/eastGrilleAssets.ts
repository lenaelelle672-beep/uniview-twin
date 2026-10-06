import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { installMeshopt } from './meshopt'
import type { QualityTier } from '../types'

export const EAST_GRILLE_INTENSITY = 2.05
export const EAST_GRILLE_HI = '/models/east-grille-v4-hi.glb'
export const EAST_GRILLE_LO = '/models/east-grille-v4-lo.glb'

function urlQuality(): QualityTier {
  if (typeof window === 'undefined') return 'balanced'
  const value = new URLSearchParams(window.location.search).get('q')
  if (value === 'perf' || value === 'balanced' || value === 'high') return value
  return 'balanced'
}

/** 首屏按当前档只预加载会立刻用到的那个。三档首次都是 lo，性能档绝不预取 hi。 */
export function preloadEastGrilleForQuality(quality: QualityTier = urlQuality()): void {
  useLoader.preload(GLTFLoader, EAST_GRILLE_LO, installMeshopt)
  if (quality === 'perf') return
}

export function preloadEastGrilleHi(): void {
  useLoader.preload(GLTFLoader, EAST_GRILLE_HI, installMeshopt)
}
