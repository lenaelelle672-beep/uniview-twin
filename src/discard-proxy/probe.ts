/** 开关分包和材质分包各写一份。状态只放在 window 上。 */
export function publishDiscardProxy(on: boolean, mounted: boolean, count: number): void {
  if (typeof window === 'undefined') return
  window.__twinDiscardProxy = {
    on,
    mounted,
    count,
    impl: 'drei-MeshDiscardMaterial',
    colorWrite: false,
    depthWrite: false,
    materialVisible: true,
    raycast: 'untouched',
    objectVisible: 'untouched',
    cdn: false,
  }
}
