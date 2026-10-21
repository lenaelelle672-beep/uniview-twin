import { useEffect } from 'react'
import { useTwinStore } from '../store/store'
import type { LayerKey } from '../store/viewSlice'
import panelCss from './layer.css?inline'

const ROWS: Array<[LayerKey, string]> = [
  ['people', '人流'],
  ['labels', '标签'],
  ['heat', '热力'],
  ['outlines', '描边'],
  ['badges', '圆标'],
]

export function LayerPanel() {
  const layers = useTwinStore((state) => state.layers)
  const setLayer = useTwinStore((state) => state.setLayer)

  useEffect(() => {
    const node = document.createElement('style')
    node.dataset.layerPanel = ''
    node.textContent = panelCss
    document.head.append(node)
    return () => node.remove()
  }, [])

  return (
    <section className="layer-panel" data-layer-root aria-label="图层">
      <p className="layer-title">图层</p>
      <div className="layer-list">
        {ROWS.map(([key, label]) => {
          const on = layers[key]
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              aria-label={`图层：${label}`}
              data-layer={key}
              onClick={() => setLayer(key, !on)}
            >
              <span>{label}</span>
              <span>{on ? '开' : '关'}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
