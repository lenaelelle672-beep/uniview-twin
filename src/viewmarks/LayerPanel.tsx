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
  ['edges', '结构边'],
  ['plaques', '铭牌'],
]

function armStructureOverlay() {
  void import('../scene/stage/structureArm').then((mod) => {
    mod.armStructureOverlay()
  })
}

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

  useEffect(() => {
    if (!useTwinStore.getState().layers.edges) return
    armStructureOverlay()
  }, [])

  return (
    <section className="layer-panel" data-layer-root aria-label="图层">
      <p className="layer-title">图层</p>
      <div className="layer-list">
        {ROWS.map(([key, label]) => {
          const on = (layers as LayerFlags & {
            wireframe?: boolean
            plaques?: boolean
            decals?: boolean
            segments?: boolean
            tourPath?: boolean
            screenVideo?: boolean
            screenImage?: boolean
          })[key] === true
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              aria-label={`图层：${label}`}
              title={key === 'wireframe' ? '总览画外壳，单层只画当前层。棱边开启时让位。' : undefined}
              data-layer={key}
              onClick={() => {
                const next = !on
                setLayer(key, next)
                if (key === 'edges') armStructureOverlay()
              }}
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
