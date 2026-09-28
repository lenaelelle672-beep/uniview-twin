import { useEffect } from 'react'
import { useTwinStore } from '../store/store'
import { applySearchToStore, storeToSearch } from './urlState'

export function useUrlSync() {
  const view = useTwinStore((state) => state.view)
  const selectedFloor = useTwinStore((state) => state.selectedFloor)
  const focusedDeskId = useTwinStore((state) => state.focusedDeskId)
  const cam = useTwinStore((state) => state.cam)
  const dataUrl = useTwinStore((state) => state.dataUrl)
  const quality = useTwinStore((state) => state.quality)
  const qualityPinned = useTwinStore((state) => state.qualityPinned)
  const presentation = useTwinStore((state) => state.presentation)

  useEffect(() => {
    const next = storeToSearch()
    if (next === window.location.search) return
    const url = `${window.location.pathname}${next}${window.location.hash}`
    window.history.replaceState(null, '', url)
  }, [view, selectedFloor, focusedDeskId, cam, dataUrl, quality, qualityPinned, presentation])

  useEffect(() => {
    const onPopState = () => applySearchToStore(window.location.search)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
}
