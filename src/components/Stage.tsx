import { lazy, Suspense, useEffect } from 'react'
import { useTwinStore } from '../store/store'
import { SceneCanvas } from './Scene'

const BlueprintView = lazy(() => import('../blueprint/BlueprintView').then((mod) => ({ default: mod.BlueprintView })))

export function Stage() {
  const view = useTwinStore((state) => state.view)
  const selectedFloor = useTwinStore((state) => state.selectedFloor)
  const exploded = useTwinStore((state) => state.exploded)
  const status = useTwinStore((state) => state.status)
  const error = useTwinStore((state) => state.error)
  const posNotice = useTwinStore((state) => state.posNotice)
  const exitFloor = useTwinStore((state) => state.exitFloor)
  const setExploded = useTwinStore((state) => state.setExploded)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (useTwinStore.getState().view !== 'floor') return
      event.preventDefault()
      useTwinStore.getState().exitFloor()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
      {view === 'blueprint' ? (
        <Suspense fallback={null}>
          <BlueprintView />
        </Suspense>
      ) : (
        <SceneCanvas />
      )}
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
