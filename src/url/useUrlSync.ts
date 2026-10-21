import { useEffect } from 'react'
import { useTwinStore } from '../store/store'
import { applySearchToStore, storeToSearch } from './urlState'

export function useUrlSync() {
  const view = useTwinStore((state) => state.view)
  const selectedFloor = useTwinStore((state) => state.selectedFloor)
  const focusedDeskId = useTwinStore((state) => state.focusedDeskId)
  const cam = useTwinStore((state) => state.cam)
  const dataUrl = useTwinStore((state) => state.dataUrl)
  const urlQuality = useTwinStore((state) => state.urlQuality)
  const presentation = useTwinStore((state) => state.presentation)
  const viewpointToken = useTwinStore((state) => state.vp)

  useEffect(() => {
    const next = storeToSearch()
    if (next === window.location.search) return
    const url = `${window.location.pathname}${next}${window.location.hash}`
    window.history.replaceState(null, '', url)
  }, [view, selectedFloor, focusedDeskId, cam, dataUrl, urlQuality, presentation, viewpointToken])

  useEffect(() => {
    const onPopState = () => applySearchToStore(window.location.search)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
}
