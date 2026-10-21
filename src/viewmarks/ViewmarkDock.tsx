import { useEffect, useRef, useState, type FormEvent } from 'react'
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
  const cancelRef = useRef<(() => void) | null>(null)

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

  async function onCopy() {
    const token = captureToken()
    if (!token) return
    const href = `${window.location.origin}${window.location.pathname}${storeToSearch()}${window.location.hash}`
    try {
      await navigator.clipboard.writeText(href)
      setNote('链接已复制')
    } catch {
      setNote('链接已写入地址栏')
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
