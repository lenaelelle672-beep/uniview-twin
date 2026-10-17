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
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const hits = useMemo(
    () => searchWorkstations({ desks, people }, searchQuery, 10),
    [desks, people, searchQuery],
  )
  const shown = open && searchQuery.trim().length > 0
  const armed = focused || shown
  const activeIndex = shown && hits.length > 0 ? Math.min(active, hits.length - 1) : -1
  const activeId = activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined
  const searchEscRef = useRef({ focused, shown, query: searchQuery })
  searchEscRef.current = { focused, shown, query: searchQuery }

  useEffect(() => {
    if (!shown) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [shown])

  useEffect(() => {
    if (!armed) return
    let drop = () => {}
    void import('../ui/escapeLayers').then((mod) => {
      drop = mod.registerEscapeLayer('search', () => {
        const state = searchEscRef.current
        const action = mod.nextSearchEscapeAction({
          focused: state.focused,
          listOpen: state.shown,
          query: state.query,
        })
        if (action === 'close-list') setOpen(false)
        else if (action === 'clear') {
          setSearchQuery('')
          setOpen(false)
        } else if (action === 'blur') inputRef.current?.blur()
      })
    })
    return () => drop()
  }, [armed, setSearchQuery])

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
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (shown) setOpen(false)
      else if (searchQuery !== '') {
        setSearchQuery('')
        setOpen(false)
      } else {
        inputRef.current?.blur()
      }
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
        ref={inputRef}
        value={searchQuery}
        onFocus={() => {
          setFocused(true)
          setOpen(true)
        }}
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          setSearchQuery(event.target.value)
          setOpen(true)
          setActive(0)
        }}
        onKeyDown={onKeyDown}
      />
      {shown && (
        <ul className="search-list" id={listId} role="listbox" aria-label="搜索结果">
          {hits.length === 0 && <li className="search-empty">未找到工位</li>}
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
