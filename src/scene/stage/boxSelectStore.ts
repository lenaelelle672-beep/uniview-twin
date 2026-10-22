import { create } from 'zustand'

export const EMPTY_BOX_IDS: readonly string[] = []

interface BoxSelectState {
  floorId: string | null
  deskIds: readonly string[]
  setBoxSelection: (floorId: string, deskIds: readonly string[]) => void
  clearBoxSelection: (floorId: string) => void
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

export const useBoxSelectStore = create<BoxSelectState>((set, get) => ({
  floorId: null,
  deskIds: EMPTY_BOX_IDS,
  setBoxSelection: (floorId, deskIds) => {
    const prev = get()
    if (prev.floorId === floorId && sameIds(prev.deskIds, deskIds)) return
    set({ floorId, deskIds: deskIds.slice() })
  },
  clearBoxSelection: (floorId) => {
    const prev = get()
    if (prev.floorId !== floorId) return
    set({ floorId: null, deskIds: EMPTY_BOX_IDS })
  },
}))

export function resetBoxSelectStore(): void {
  useBoxSelectStore.setState({ floorId: null, deskIds: EMPTY_BOX_IDS })
}
