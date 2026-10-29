/**
 * 生产构建从 Scene 摘掉 T090 接线，入口包与基线逐字节对齐。
 * 开发时这段留在首屏 Suspense 里；产物改由 dock 哈希定稿后再挂。
 */

const BLOCKS = [
  "\nconst PreloadLayer = lazy(() =>\n  import('../shader-preload/PreloadLayer').then((mod) => ({ default: mod.PreloadLayer })),\n)",
  '\n  const [preloadOn, setPreloadOn] = useState(false)',
  '\n      // T090：与 T032 加载条同一道首帧窗口。到点才拉 Preload，躲开首帧前的同步 compile。\n      if (first != null && performance.now() - first >= SOFT_SHADOW_CHUNK_AFTER_FIRST_MS) setPreloadOn(true)',
  '\n        {/* T090：挂在首屏 Suspense 内。内层 fallback 为空，不增加空白计数，AssetLoadOverlay 进度叙事不变。 */}\n        {preloadOn ? (\n          <Suspense fallback={null}>\n            <PreloadLayer />\n          </Suspense>\n        ) : null}',
]

export function stripShaderPreloadSource(code: string): string {
  let next = code
  for (const block of BLOCKS) {
    if (!next.includes(block)) {
      throw new Error('T090：Scene 里的 Preload 接线变了，生产构建无法在哈希前摘干净')
    }
    next = next.replace(block, '')
  }
  if (next.includes('preloadOn') || next.includes('shader-preload') || next.includes('PreloadLayer')) {
    throw new Error('T090：摘完 Scene 仍留着 Preload 接线')
  }
  return next
}
