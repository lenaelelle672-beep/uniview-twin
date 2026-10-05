import { lazy, Suspense } from 'react'
import type { TextProps } from '@react-three/drei/core/Text'

const TroikaText = lazy(async () => {
  const { Text } = await import('./textRuntime')
  return { default: Text }
})

/** 包没到时不画字；引线和楼板已经在 T009 / 主包里。 */
export function LazyText(props: TextProps) {
  return (
    <Suspense fallback={null}>
      <TroikaText {...props} />
    </Suspense>
  )
}
