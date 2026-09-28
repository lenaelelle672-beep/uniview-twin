import { useEffect } from 'react'
import { useTwinStore } from '../store/store'
import { SceneCanvas } from './Scene'

export function Stage() {
  const view = useTwinStore((state) => state.view)
  const selectedFloor = useTwinStore((state) => state.selectedFloor)
  const status = useTwinStore((state) => state.status)
  const error = useTwinStore((state) => state.error)
  const exitFloor = useTwinStore((state) => state.exitFloor)

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
    <main className="stage" aria-label="场景">
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
      {view === 'blueprint' ? (
        <div className="blueprint-placeholder" role="region" aria-label="蓝图视图">
          <p>蓝图台账将在后续任务中提供。</p>
        </div>
      ) : (
        <SceneCanvas />
      )}
      {view === 'floor' && (
        <button type="button" className="back-button" title="Esc 返回总览" onClick={() => exitFloor()}>
          返回总览
        </button>
      )}
      {view !== 'blueprint' && (
        <p className="view-chip">{view === 'floor' ? `单层视图${selectedFloor ? ` · ${selectedFloor}` : ''}` : '总览视图'}</p>
      )}
    </main>
  )
}
