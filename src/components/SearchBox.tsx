import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { searchWorkstations, type WorkstationHit } from '../locate/search'
import { useTwinStore } from '../store/store'

export function SearchBox() {
  const desks = useTwinStore((state) => state.desks)
  const people = useTwinStore((state) => state.people)
  const searchQuery = useTwinStore((state) => state.searchQuery)
  const setSearchQuery = useTwinStore((state) => state.setSearchQuery)
  const focusDevice = useTwinStore((state) => state.focusDevice)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const hits = useMemo(
    () => searchWorkstations({ desks, people }, searchQuery, 10),
    [desks, people, searchQuery],
  )
  const shown = open && searchQuery.trim().length > 0
  const activeIndex = shown && hits.length > 0 ? Math.min(active, hits.length - 1) : -1
  const activeId = activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined

  useEffect(() => {
    if (!shown) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [shown])

  function choose(hit: WorkstationHit) {
    focusDevice({ floor: hit.floorId, deskId: hit.deskId })
    setSearchQuery(hit.deskId)
    setOpen(false)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (hits.length === 0) return
      setOpen(true)
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setActive((current) => {
        const base = shown ? current : -1
        return (base + delta + hits.length) % hits.length
      })
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const hit = hits[activeIndex] ?? hits[0]
      if (hit && searchQuery.trim()) choose(hit)
      return
    }
    if (event.key === 'Escape' && shown) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div className="search-wrap" ref={rootRef}>
      <input
        className="search"
        type="text"
        role="combobox"
        placeholder="搜索人名、工位或 IP"
        aria-label="搜索人名、工位或 IP"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={activeId}
        autoComplete="off"
        value={searchQuery}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setSearchQuery(event.target.value)
          setOpen(true)
          setActive(0)
        }}
        onKeyDown={onKeyDown}
      />
      {shown && (
        <ul className="search-list" id={listId} role="listbox" aria-label="搜索结果">
          {hits.length === 0 && <li className="search-empty">没有匹配的工位</li>}
          {hits.map((hit, index) => (
            <li
              key={hit.deskId}
              id={`${listId}-opt-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? 'search-option is-active' : 'search-option'}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => {
                event.preventDefault()
                choose(hit)
              }}
            >
              <span className="search-title">{hit.title}</span>
              <span className="search-subtitle">{hit.subtitle}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
