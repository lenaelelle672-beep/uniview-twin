import { useEffect } from 'react'
import { useTwinStore } from '../store/store'
import type { LayerFlags, LayerToggleKey } from '../store/viewSlice'
import panelCss from './layer.css?inline'

const ROWS: Array<[LayerToggleKey, string]> = [
  ['people', '人流'],
  ['labels', '标签'],
  ['heat', '热力'],
  ['outlines', '描边'],
  ['badges', '圆标'],
  ['wireframe', '线框'],
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
          const on = (layers as LayerFlags & { wireframe?: boolean })[key] === true
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              aria-label={`图层：${label}`}
              title={key === 'wireframe' ? '总览画外壳，单层只画当前层。棱边开启时让位。' : undefined}
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
