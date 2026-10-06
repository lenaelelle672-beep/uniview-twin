import { useEffect, useState, type ComponentType } from 'react'
import { schedulePrefetchAfterFirstFrame } from '../scene/stage/prefetchLazyChunks'
import { useTwinStore } from '../store/store'
import { dismissTopEscapeLayer } from '../ui/escapeLayers'
import { SceneCanvas } from './Scene'

export function Stage() {
  const view = useTwinStore((state) => state.view)
  const selectedFloor = useTwinStore((state) => state.selectedFloor)
  const exploded = useTwinStore((state) => state.exploded)
  const status = useTwinStore((state) => state.status)
  const error = useTwinStore((state) => state.error)
  const posNotice = useTwinStore((state) => state.posNotice)
  const exitFloor = useTwinStore((state) => state.exitFloor)
  const setExploded = useTwinStore((state) => state.setExploded)
  const [BlueprintView, setBlueprintView] = useState<ComponentType | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (event.defaultPrevented) return
      if (dismissTopEscapeLayer()) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      if (useTwinStore.getState().view !== 'floor') return
      event.preventDefault()
      useTwinStore.getState().exitFloor()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (view !== 'blueprint' || BlueprintView) return
    let cancelled = false
    void import('../blueprint/BlueprintView').then((mod) => {
      if (!cancelled) setBlueprintView(() => mod.BlueprintView)
    })
    return () => {
      cancelled = true
    }
  }, [BlueprintView, view])

  useEffect(() => {
    if (view !== 'building') return
    return schedulePrefetchAfterFirstFrame()
  }, [view])

  const showBlueprint = view === 'blueprint' && BlueprintView !== null

  return (
    <main className="stage" aria-label="场景" data-exploded={exploded ? 'true' : 'false'}>
      {status === 'loading' && (
        <p className="banner" role="status">
          正在加载数据…
        </p>
      )}
      {status === 'error' && error && (
        <p className="banner banner-error" role="alert">
          {error}
        </p>
      )}
      {posNotice && (
        <p className={status === 'error' && error ? 'banner banner-error is-second' : 'banner banner-error'} role="alert">
          {posNotice}
        </p>
      )}
      {view === 'blueprint' && !showBlueprint && (
        <p className="banner" role="status">
          正在打开蓝图…
        </p>
      )}
      {showBlueprint && BlueprintView ? <BlueprintView /> : <SceneCanvas />}
      {view === 'floor' && (
        <button type="button" className="back-button" title="Esc 返回总览" onClick={() => exitFloor()}>
          返回总览
        </button>
      )}
      {view === 'building' && (
        <button
          type="button"
          className={exploded ? 'explode-button is-active' : 'explode-button'}
          aria-label={exploded ? '收拢楼层' : '爆炸视图'}
          aria-pressed={exploded}
          onClick={() => setExploded(!exploded)}
        >
          {exploded ? '收拢楼层' : '爆炸视图'}
        </button>
      )}
      {view !== 'blueprint' && (
        <p className="view-chip">
          {view === 'floor' ? `单层视图${selectedFloor ? ` · ${selectedFloor}` : ''}` : exploded ? '总览视图 · 爆炸' : '总览视图'}
        </p>
      )}
    </main>
  )
}
