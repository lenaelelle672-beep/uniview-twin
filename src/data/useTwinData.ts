import { useEffect } from 'react'
import { JsonAdapter, MockAdapter, isLocalDataPath } from '../data/adapters'
import type { TwinDataAdapter } from '../types'
import { useTwinStore } from '../store/store'

export function useTwinData() {
  const dataUrl = useTwinStore((state) => state.dataUrl)

  useEffect(() => {
    if (dataUrl && !isLocalDataPath(dataUrl)) {
      useTwinStore.getState().setError('数据地址必须是以 / 开头的站内路径')
      return
    }

    let cancelled = false
    const run = async () => {
      useTwinStore.getState().setLoading()
      const adapter: TwinDataAdapter = dataUrl ? new JsonAdapter(dataUrl) : new MockAdapter()
      try {
        const data = await adapter.load()
        if (!cancelled) useTwinStore.getState().setData(data)
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : '加载数据失败'
        useTwinStore.getState().setError(message)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [dataUrl])
}
