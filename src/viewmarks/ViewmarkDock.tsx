import { useEffect, useRef, useState, type FormEvent } from 'react'
import { shortcutTargetBlocks } from '../shortcuts/guard'
import { useTwinStore } from '../store/store'
import { registerEscapeLayer } from '../ui/escapeLayers'
import { storeToSearch } from '../url/urlState'
import { formatViewpoint, parseViewpoint } from '../url/viewpoint'
import {
  createViewmarkId,
  forgetBookmark,
  loadBookmarks,
  rememberBookmark,
  saveBookmarks,
  type Viewmark,
} from './bookmarks'
import { readViewpoint } from './readViewpoint'
import { TWIN_TOUR_EVENT, type TwinTourDetail } from './tourEvents'
import dockCss from './viewmark.css?inline'

async function runFullscreenToggle(): Promise<{ ok: boolean; active: boolean; message: string; blocked: boolean }> {
  try {
    const mod = await import('./fullscreen')
    if (mod.fullscreenDisabled()) {
      return { ok: false, active: false, message: '全屏已关闭', blocked: true }
    }
    const result = await mod.toggleFullscreen()
    return { ok: result.ok, active: result.active, message: result.message, blocked: false }
  } catch {
    return {
      ok: false,
      active: typeof document !== 'undefined' && document.fullscreenElement != null,
      message: '全屏没有完成',
      blocked: false,
    }
  }
}

function pinCurrent(token: string) {
  if (!parseViewpoint(token)) return false
  const state = useTwinStore.getState()
  state.showViewpoint({
    token,
    view: state.view,
    floor: state.selectedFloor,
    cam: state.cam,
    pos: state.focusedDeskId,
  })
  return true
}

export function ViewmarkDock() {
  const status = useTwinStore((state) => state.status)
  const [marks, setMarks] = useState<Viewmark[]>(() => loadBookmarks(localStorage))
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [touring, setTouring] = useState(false)
  const [tourFloor, setTourFloor] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [fullOn, setFullOn] = useState(false)
  const [fullOff, setFullOff] = useState(false)
  const [fullBusy, setFullBusy] = useState(false)
  const cancelRef = useRef<(() => void) | null>(null)
  const fullOffRef = useRef(false)
  const fullBusyRef = useRef(false)
  const performRef = useRef<() => void>(() => {})

  useEffect(() => {
    const node = document.createElement('style')
    node.dataset.viewmark = ''
    node.textContent = dockCss
    document.head.append(node)
    return () => node.remove()
  }, [])

  useEffect(() => {
    const onTour = (event: Event) => {
      const detail = (event as CustomEvent<TwinTourDetail>).detail
      setTouring(detail.active)
      setTourFloor(detail.floorId)
      if (!detail.active) cancelRef.current = null
      if (detail.empty) setNote('当前没有告警楼层')
      else if (detail.active) setNote('')
    }
    window.addEventListener(TWIN_TOUR_EVENT, onTour)
    return () => window.removeEventListener(TWIN_TOUR_EVENT, onTour)
  }, [])

  useEffect(() => {
    if (!touring) return
    return registerEscapeLayer('view-tour', () => {
      cancelRef.current?.()
    })
  }, [touring])

  useEffect(() => {
    // T061：包跟书签条晚加载。真正进入全屏仍发生在点击或 F 上，预取只为赶上手势窗口。
    let cancelled = false
    void import('./fullscreen')
      .then((mod) => {
        if (cancelled) return
        const off = mod.fullscreenDisabled()
        fullOffRef.current = off
        setFullOff(off)
      })
      .catch(() => {
        if (cancelled) return
        fullOffRef.current = true
        setFullOff(true)
      })

    const onChange = () => {
      const on = document.fullscreenElement != null
      setFullOn(on)
      if (!on) setNote((prev) => (prev.includes('已进入全屏') ? '已退出全屏' : prev))
    }
    document.addEventListener('fullscreenchange', onChange)

    // Esc 退出全屏走浏览器默认。捕获阶段停掉冒泡，避免同一次按键被楼层 Esc 先 preventDefault。
    const onEsc = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !document.fullscreenElement) return
      event.stopPropagation()
    }
    window.addEventListener('keydown', onEsc, true)

    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing) return
      if (event.altKey || event.metaKey || event.ctrlKey) return
      if (event.key !== 'f' && event.key !== 'F') return
      if (shortcutTargetBlocks(event.target)) return
      if (fullOffRef.current) {
        setNote('全屏已关闭')
        return
      }
      event.preventDefault()
      performRef.current()
    }
    window.addEventListener('keydown', onKey)

    return () => {
      cancelled = true
      document.removeEventListener('fullscreenchange', onChange)
      window.removeEventListener('keydown', onEsc, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  function captureToken(): string | null {
    const raw = readViewpoint()
    if (!raw) {
      setNote('镜头还没准备好')
      return null
    }
    const token = formatViewpoint(raw)
    if (!token || !pinCurrent(token)) {
      setNote('当前视角无法写入链接')
      return null
    }
    return token
  }

  function onSave(event: FormEvent) {
    event.preventDefault()
    const token = captureToken()
    if (!token) return
    const state = useTwinStore.getState()
    const label = name.trim() || `视角 ${marks.length + 1}`
    const next = rememberBookmark(marks, {
      id: createViewmarkId(),
      name: label,
      token,
      view: state.view,
      floor: state.selectedFloor,
      cam: state.cam,
      pos: state.focusedDeskId,
    })
    if (!next.ok) {
      setNote(next.reason === 'full' ? '最多 12 个书签，请先删除' : '书签名称无效')
      return
    }
    if (!saveBookmarks(localStorage, next.marks)) {
      setNote('浏览器无法保存书签')
      return
    }
    setMarks(next.marks)
    setName('')
    setNote('已保存，刷新会回到这个视角')
  }

  function viewpointHref(): string {
    return `${window.location.origin}${window.location.pathname}${storeToSearch()}${window.location.hash}`
  }

  async function onCopy() {
    const token = captureToken()
    if (!token) return
    try {
      await navigator.clipboard.writeText(viewpointHref())
      setNote('链接已复制')
    } catch {
      setNote('链接已写入地址栏')
    }
  }

  async function onShare() {
    if (sharing) return
    const token = captureToken()
    if (!token) return
    const href = viewpointHref()
    setSharing(true)
    setNote('正在截取画面')
    try {
      const mod = await import('./shareShot')
      const result = await mod.shareViewpointShot(href)
      setNote(result.message)
    } catch {
      setNote('截图没有完成')
    } finally {
      setSharing(false)
    }
  }

  async function performFullscreen() {
    if (fullOffRef.current || fullBusyRef.current) return
    fullBusyRef.current = true
    setFullBusy(true)
    try {
      const result = await runFullscreenToggle()
      if (result.blocked) {
        fullOffRef.current = true
        setFullOff(true)
      }
      setFullOn(result.active)
      setNote(result.message)
    } finally {
      fullBusyRef.current = false
      setFullBusy(false)
    }
  }
  performRef.current = () => {
    void performFullscreen()
  }

  async function onExportGlb() {
    if (exporting) return
    setExporting(true)
    setNote('正在导出当前层')
    try {
      const mod = await import('./floorGlb')
      const result = await mod.exportCurrentFloorGlb()
      setNote(result.message)
    } catch {
      setNote('导出没有完成')
    } finally {
      setExporting(false)
    }
  }

  async function onTour() {
    if (touring) {
      cancelRef.current?.()
      return
    }
    const mod = await import('./alarmTour')
    const session = mod.startAlarmTour()
    cancelRef.current = session.cancel
  }

  function onOpen(mark: Viewmark) {
    const viewpoint = parseViewpoint(mark.token)
    if (!viewpoint) {
      setNote('这条书签已失效')
      return
    }
    useTwinStore.getState().showViewpoint({
      token: mark.token,
      view: mark.view,
      floor: mark.floor,
      cam: mark.cam,
      pos: mark.pos,
    })
    setNote(`已回到「${mark.name}」`)
  }

  function onForget(id: string) {
    const next = forgetBookmark(marks, id)
    saveBookmarks(localStorage, next)
    setMarks(next)
  }

  return (
    <aside className="viewmark-dock" data-viewmark-root data-touring={touring ? 'true' : 'false'} aria-label="视角书签">
      <p className="viewmark-title">视角</p>
      <form className="viewmark-save" onSubmit={onSave}>
        <input
          aria-label="书签名称"
          value={name}
          maxLength={24}
          placeholder="名称"
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit">保存</button>
      </form>
      <div className="viewmark-actions">
        <button type="button" onClick={() => void onCopy()}>
          复制链接
        </button>
        <button type="button" onClick={() => void onTour()} disabled={status !== 'ready' && !touring}>
          {touring ? '停止导览' : '导览告警'}
        </button>
      </div>
      <button
        type="button"
        className="viewmark-share"
        data-share-shot
        onClick={() => void onShare()}
        disabled={status !== 'ready' || sharing}
      >
        截图/分享
      </button>
      <button
        type="button"
        className="viewmark-glb"
        data-floor-glb
        aria-label="导出当前楼层 GLB"
        onClick={() => void onExportGlb()}
        disabled={status !== 'ready' || exporting}
      >
        导出本层
      </button>
      <button
        type="button"
        className="viewmark-fullscreen"
        data-fullscreen
        aria-label={fullOn ? '退出全屏' : '进入全屏'}
        aria-keyshortcuts="f"
        aria-pressed={fullOn}
        title={fullOff ? '地址栏带 ?nofullscreen=1，已关闭全屏' : 'F 全屏，Esc 退出'}
        onClick={() => performRef.current()}
        disabled={fullOff || fullBusy}
      >
        {fullOn ? '退出全屏' : '全屏'}
      </button>
      {touring && (
        <p className="viewmark-note" role="status">
          导览中{tourFloor ? ` · ${tourFloor}` : ''}，Esc 或点击画面可停
        </p>
      )}
      {note && (
        <p className="viewmark-note" role="status">
          {note}
        </p>
      )}
      {marks.length > 0 && (
        <ul className="viewmark-list">
          {marks.map((mark) => (
            <li key={mark.id}>
              <span className="viewmark-name">{mark.name}</span>
              <button type="button" aria-label={`查看${mark.name}`} onClick={() => onOpen(mark)}>
                查看
              </button>
              <button type="button" aria-label={`删除${mark.name}`} onClick={() => onForget(mark.id)}>
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
