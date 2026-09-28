import { useTwinStore } from '../store/store'
import { SceneCanvas } from './Scene'

export function Stage() {
  const view = useTwinStore((state) => state.view)
  const status = useTwinStore((state) => state.status)
  const error = useTwinStore((state) => state.error)

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
      {view !== 'blueprint' && (
        <p className="view-chip">{view === 'floor' ? '单层视图' : '总览视图'}</p>
      )}
    </main>
  )
}
