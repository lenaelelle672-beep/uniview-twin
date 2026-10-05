/** 总览空闲时预取三个按需包。预取请求不算进首屏。 */
export function prefetchLazyChunks(): void {
  void import('./floorDecor')
  void import('./textRuntime')
  void import('../../blueprint/BlueprintView')
}
