import { createElement, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Box3, Mesh, Vector3, type MeshStandardMaterial, type Object3D, type Texture } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { installMeshopt } from '../scene/meshopt'
import {
  ATTRIBUTION_HREF,
  COMMUNITY_CONVERT_URL,
  CREDIT_EN,
  CREDIT_ZH,
  NVIDIA_SIMREADY_URL,
  SIMREADY_DIR,
  SIMREADY_PROPS,
  TASTE_ANCHOR,
  TASTE_GAP_M,
  TASTE_GROUND_Y,
  rowCenters,
  tasteEnabled,
  tasteScale,
} from './catalog'

/**
 * T103：SimReady 试吃。
 * dock 在首帧约 2600ms 之后才 import 本文件。
 * 生产构建在 dock 哈希定稿前摘掉接线，定稿后再把独立分包接回去，不进 hardGate / balancedFx。
 * 节点交给格网槽的第七个缺省位。关掉或删掉这条接线，场景其余部分不动。
 * 网格不参与拾取，不投影，不挂进楼层，所以不碰爆炸、点选和 demand 的时钟。
 */

interface Fitted {
  id: string
  object: Object3D
  width: number
  lift: number
}

const fitted = new Map<string, Fitted>()
const pending = new Map<string, Promise<Fitted>>()

let started = false
let override: boolean | null = null
let on = false
let mounted = 0
let failed = 0
let creditHost: HTMLElement | null = null

function readOn(): boolean {
  if (override !== null) return override
  const search = typeof location === 'undefined' ? '' : location.search
  return tasteEnabled(search)
}

function publish(): void {
  window.__twinSimReady = {
    on,
    mounted,
    failed,
    decoder: 'MeshoptDecoder',
    credit: 'NVIDIA',
    files: SIMREADY_PROPS.map((prop) => prop.file),
  }
}

function silence(root: Object3D): void {
  root.traverse((child) => {
    child.raycast = () => {}
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = false
    mesh.receiveShadow = false
  })
}

function fit(object: Object3D): { width: number; lift: number } {
  object.position.set(0, 0, 0)
  object.rotation.set(0, 0, 0)
  object.scale.set(1, 1, 1)
  object.updateMatrixWorld(true)
  const raw = new Box3().setFromObject(object)
  const size = new Vector3()
  raw.getSize(size)
  object.scale.setScalar(tasteScale(size))
  object.updateMatrixWorld(true)
  const box = new Box3().setFromObject(object)
  const fittedSize = new Vector3()
  box.getSize(fittedSize)
  silence(object)
  return { width: Math.max(fittedSize.x, fittedSize.z), lift: -box.min.y }
}

async function ensureFitted(id: string, file: string): Promise<Fitted> {
  const cached = fitted.get(id)
  if (cached) return cached
  const inflight = pending.get(id)
  if (inflight) return inflight
  const job = (async () => {
    const loader = new GLTFLoader()
    installMeshopt(loader)
    if (!loader.meshoptDecoder) throw new Error('MeshoptDecoder 没有装上')
    const gltf = await loader.loadAsync(`${SIMREADY_DIR}${file}`)
    const object = gltf.scene
    object.name = `SimReady:${id}`
    object.userData.simready = true
    const placed = fit(object)
    const row = { id, object, width: placed.width, lift: placed.lift }
    fitted.set(id, row)
    return row
  })().catch((error: unknown) => {
    pending.delete(id)
    throw error
  })
  pending.set(id, job)
  return job
}

async function loadTaste(): Promise<{ items: Fitted[]; failed: number }> {
  const rows = await Promise.all(
    SIMREADY_PROPS.map(async (prop) => {
      try {
        return { item: await ensureFitted(prop.id, prop.file), failed: false as const }
      } catch {
        return { item: null, failed: true as const }
      }
    }),
  )
  return {
    items: rows.flatMap((row) => (row.item ? [row.item] : [])),
    failed: rows.filter((row) => row.failed).length,
  }
}

function applyEnv(items: readonly Fitted[], env: Texture | null): boolean {
  let changed = false
  for (const item of items) {
    item.object.traverse((child) => {
      const mesh = child as Mesh
      if (!mesh.isMesh) return
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of materials) {
        const standard = material as MeshStandardMaterial | null
        if (!standard?.isMeshStandardMaterial) continue
        if (standard.envMap === env) {
          if (standard.envMapIntensity !== 1) {
            standard.envMapIntensity = 1
            changed = true
          }
          continue
        }
        standard.envMap = env
        standard.envMapIntensity = 1
        standard.needsUpdate = true
        changed = true
      }
    })
  }
  return changed
}

function SimReadyTaste() {
  const [result, setResult] = useState<{ items: Fitted[]; failed: number } | null>(null)

  useEffect(() => {
    let cancel = false
    void loadTaste().then((next) => {
      if (cancel) return
      applyEnv(next.items, window.__twinScene?.environment ?? null)
      mounted = next.items.length
      failed = next.failed
      publish()
      paintCredit()
      setResult(next)
      void window.__twinInvalidate?.()
    })
    return () => {
      cancel = true
      window.requestAnimationFrame(() => {
        void window.__twinInvalidate?.()
      })
    }
  }, [])

  useEffect(() => {
    if (!result) return
    const tick = () => {
      const env = window.__twinScene?.environment ?? null
      if (applyEnv(result.items, env)) void window.__twinInvalidate?.()
    }
    tick()
    const id = window.setInterval(tick, 700)
    return () => window.clearInterval(id)
  }, [result])

  if (!result || result.items.length === 0) return null
  const centers = rowCenters(
    result.items.map((item) => item.width),
    TASTE_GAP_M,
    TASTE_ANCHOR.x,
  )
  return createElement(
    'group',
    { name: 'SimReadyTaste', position: [0, TASTE_GROUND_Y, TASTE_ANCHOR.z] },
    result.items.map((item, index) =>
      createElement('primitive', {
        key: item.id,
        object: item.object,
        position: [centers[index] ?? TASTE_ANCHOR.x, item.lift, 0],
        rotation: [0, (index - (result.items.length - 1) / 2) * 0.18, 0],
        name: `SimReady:${item.id}`,
      }),
    ),
  )
}

function setTasteNode(node: ReactNode): void {
  window.__twinSimReadyNode = node
  const startedAt = performance.now()
  const tick = () => {
    if (window.__twinSceneOverlayFlush?.()) return
    if (performance.now() - startedAt > 12_000) return
    window.setTimeout(tick, 50)
  }
  tick()
}

function syncNode(): void {
  setTasteNode(on ? createElement(SimReadyTaste) : null)
  if (!on) {
    mounted = 0
    publish()
  }
  // demand 下关掉之后要再画一帧，否则画布还留着上一帧的道具。
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      void window.__twinInvalidate?.()
    })
  })
}

function buttonStyle(active: boolean): string {
  return [
    'font:inherit',
    'font-size:12px',
    'color:#fff',
    'background:' + (active ? '#14532d' : 'transparent'),
    'border:1px solid rgba(255,255,255,.4)',
    'border-radius:999px',
    'padding:3px 8px',
    'cursor:pointer',
  ].join(';')
}

function paintCredit(): void {
  const host = creditHost
  if (!host) return
  const toggle = host.querySelector<HTMLButtonElement>('[data-simready-toggle]')
  const about = host.querySelector<HTMLButtonElement>('[data-simready-about-toggle]')
  const panel = host.querySelector<HTMLElement>('[data-simready-panel]')
  if (!toggle || !about || !panel) return
  const label = on ? (mounted > 0 ? '开' : '…') : '关'
  toggle.setAttribute('aria-pressed', String(on))
  toggle.textContent = `工业道具 ${label}`
  toggle.style.cssText = buttonStyle(on)
  const open = about.getAttribute('aria-expanded') === 'true'
  about.style.cssText = buttonStyle(open)
  panel.hidden = !open
}

function placeCredit(host: HTMLElement): void {
  const stage = document.querySelector('.stage')
  const detail = document.querySelector('.detail-panel')
  const stageBox = stage?.getBoundingClientRect()
  const narrow = stageBox == null || stageBox.width < 560
  if (narrow && detail) {
    if (host.parentElement !== document.body) document.body.append(host)
    const box = detail.getBoundingClientRect()
    host.style.position = 'fixed'
    host.style.left = `${box.left + 8}px`
    host.style.right = 'auto'
    host.style.top = 'auto'
    host.style.bottom = `${Math.max(8, window.innerHeight - box.bottom + 8)}px`
    host.style.width = `${Math.max(120, box.width - 16)}px`
    host.style.zIndex = '6'
    return
  }
  const parent = stage ?? document.body
  if (host.parentElement !== parent) parent.append(host)
  host.style.position = 'absolute'
  host.style.left = 'auto'
  host.style.right = '156px'
  host.style.top = 'auto'
  host.style.bottom = '16px'
  host.style.width = 'min(260px, calc(100% - 180px))'
  host.style.zIndex = '6'
}

function buildCredit(): HTMLElement {
  const host = document.createElement('aside')
  host.dataset.simreadyAbout = ''
  host.setAttribute('aria-label', '关于 NVIDIA SimReady')
  host.style.cssText = [
    'position:absolute',
    'z-index:6',
    'right:156px',
    'bottom:16px',
    'width:min(260px, calc(100% - 180px))',
    'padding:8px 10px',
    'border-radius:10px',
    'background:rgba(12,35,64,.9)',
    'color:#fff',
    'font-size:12px',
    'line-height:1.45',
    'box-shadow:0 6px 18px rgba(16,32,51,.2)',
  ].join(';')

  const credit = document.createElement('p')
  credit.dataset.simreadyCredit = ''
  credit.style.cssText = 'margin:0 0 6px'
  credit.append('部分道具模型源自 ')
  const source = document.createElement('a')
  source.dataset.simreadySource = ''
  source.href = NVIDIA_SIMREADY_URL
  source.target = '_blank'
  source.rel = 'noreferrer noopener'
  source.textContent = 'NVIDIA SimReady'
  source.style.color = '#9fd0ff'
  const convert = document.createElement('a')
  convert.dataset.simreadyConvert = ''
  convert.href = COMMUNITY_CONVERT_URL
  convert.target = '_blank'
  convert.rel = 'noreferrer noopener'
  convert.textContent = 'community convert'
  convert.style.color = '#9fd0ff'
  credit.append(source, '（经 ', convert, '），署名 NVIDIA。')

  const row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap'
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.dataset.simreadyToggle = ''
  toggle.addEventListener('click', () => {
    override = !readOn()
    on = readOn()
    publish()
    syncNode()
    paintCredit()
  })
  const about = document.createElement('button')
  about.type = 'button'
  about.dataset.simreadyAboutToggle = ''
  about.setAttribute('aria-expanded', 'true')
  about.setAttribute('aria-controls', 'simready-about-panel')
  about.textContent = '关于'
  about.addEventListener('click', () => {
    const open = about.getAttribute('aria-expanded') !== 'true'
    about.setAttribute('aria-expanded', String(open))
    paintCredit()
  })
  row.append(toggle, about)

  const panel = document.createElement('div')
  panel.id = 'simready-about-panel'
  panel.dataset.simreadyPanel = ''
  panel.style.marginTop = '6px'
  const english = document.createElement('p')
  english.dataset.simreadyEnglish = ''
  english.style.cssText = 'margin:0 0 4px'
  english.textContent = CREDIT_EN
  const local = document.createElement('a')
  local.href = ATTRIBUTION_HREF
  local.target = '_blank'
  local.rel = 'noreferrer noopener'
  local.textContent = 'ATTRIBUTION-CC-BY.md'
  local.style.color = '#9fd0ff'
  const note = document.createElement('p')
  note.style.cssText = 'margin:4px 0 0'
  note.textContent = '只试吃这 4 个道具，不下载整套 SimReady。'
  panel.append(english, local, note)

  host.append(credit, row, panel)
  host.dataset.creditZh = CREDIT_ZH
  return host
}

function ensureCredit(): void {
  if (!creditHost) creditHost = buildCredit()
  placeCredit(creditHost)
  paintCredit()
}

/** dock 晚加载之后调用。默认开，署名始终留在画面上。 */
export function mountSimReady(): void {
  if (typeof document === 'undefined') return
  if (started) return
  started = true
  on = readOn()
  publish()
  ensureCredit()
  syncNode()
  window.setInterval(ensureCredit, 400)
}
