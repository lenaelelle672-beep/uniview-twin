import { useEffect, useRef } from 'react'
import { SHORTCUT_GROUPS } from './catalog'

export function ShortcutSheet({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previous = document.activeElement
    closeRef.current?.focus()
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])

  return (
    <section
      className="shortcut-sheet"
      role="dialog"
      aria-modal="false"
      aria-labelledby="shortcut-sheet-title"
      data-shortcut-root
    >
      <div className="shortcut-head">
        <h2 id="shortcut-sheet-title">操作速查</h2>
        <button ref={closeRef} type="button" onClick={onClose}>
          关闭
        </button>
      </div>
      <p className="shortcut-note">输入框或告警抽屉聚焦时，问号键留给输入，不打开本面板。</p>
      {SHORTCUT_GROUPS.map((group) => (
        <section key={group.id} className="shortcut-group" aria-label={group.title} data-shortcut-group={group.id}>
          <h3>{group.title}</h3>
          <dl>
            {group.rows.map((row, index) => (
              <div className="shortcut-row" key={`${group.id}-${index}`}>
                <dt>{row.keys}</dt>
                <dd>{row.action}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </section>
  )
}
