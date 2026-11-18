import type { CSSProperties, JSX } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TabSearchCandidate, UIState } from '@shared/types'
import { cmd, run } from '@renderer/lib/api'
import { ChromePortal } from '@renderer/lib/portals'
import {
  thumbnailOf,
  retainThumbnail,
  releaseThumbnail,
  thumbnailStore
} from '@renderer/lib/thumbnails'
import { browserStore, holdFloatingChrome } from '@renderer/lib/ui'
import { closeFastTabSwitcher, switcherStore } from '@renderer/lib/fastTabSwitcher'

const MAX_FAST_SWITCHER_TABS = 18

export function FastTabSwitcherLayer(): JSX.Element | null {
  const open = switcherStore.use((s) => s.open)
  const openId = switcherStore.use((s) => s.openId)
  const cycleId = switcherStore.use((s) => s.cycleId)
  const state = browserStore.use((s) => s.state)
  const [candidates, setCandidates] = useState<TabSearchCandidate[]>([])
  const [selected, setSelected] = useState(0)
  const thumbnailRevision = thumbnailStore.use((s) => s.cards.size)
  const [readyOpenId, setReadyOpenId] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    const current = browserStore.get().state
    const hold = holdFloatingChrome(activeTabId(current), { pageHadFocus: false })
    void hold.ready.then((held) => {
      if (held) setReadyOpenId((currentId) => (held ? openId : currentId))
    })
    return () => hold.release()
  }, [open, openId])

  useEffect(() => {
    if (!open) return
    let live = true
    void cmd('tab.searchCandidates', undefined).then((next) => {
      if (!live) return
      const local = next.filter((candidate) => candidate.windowLabel === null)
      setCandidates(local)
      const nextIndex = Math.max(
        0,
        local.findIndex((candidate) => !candidate.active)
      )
      setSelected(nextIndex)
      const target = local[nextIndex]
      if (target) run('tab.switchTo', { tabId: target.id })
    })
    return () => {
      live = false
    }
  }, [open])

  const activeId = activeTabId(state)
  const visible = useMemo(() => candidates.slice(0, MAX_FAST_SWITCHER_TABS), [candidates])
  const columns = Math.min(6, Math.max(1, Math.min(visible.length, 6)))
  const activate = useCallback(
    (tabId: string): void => {
      closeFastTabSwitcher()
      if (tabId !== activeId) run('tab.switchTo', { tabId })
      run('focus.content', undefined)
    },
    [activeId]
  )
  const handledCycleId = useRef(0)
  useEffect(() => {
    handledCycleId.current = 0
  }, [openId])

  useEffect(() => {
    if (!open || cycleId <= handledCycleId.current || !visible.length) return
    handledCycleId.current = cycleId
    const nextIndex = (selected + 1) % visible.length
    setSelected(nextIndex)
    run('tab.switchTo', { tabId: visible[nextIndex].id })
  }, [cycleId, open, selected, visible])

  useEffect(() => {
    if (!open) return
    for (const candidate of visible) retainThumbnail(candidate.id)
    return () => {
      for (const candidate of visible) releaseThumbnail(candidate.id)
    }
  }, [open, visible])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeFastTabSwitcher()
      } else if (event.key === 'ArrowRight' || event.key === 'Tab') {
        event.preventDefault()
        setSelected((index) => (visible.length ? (index + 1) % visible.length : 0))
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setSelected((index) => (visible.length ? (index - 1 + visible.length) % visible.length : 0))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        const candidate = visible[selected]
        if (candidate) activate(candidate.id)
      }
    }
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key !== 'Control' && event.key !== 'Meta') return
      const candidate = visible[selected]
      if (candidate) activate(candidate.id)
      else closeFastTabSwitcher()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [activate, open, selected, visible])

  if (!open || readyOpenId !== openId) return null

  return (
    <ChromePortal>
      <div className="zen-fast-switcher" role="dialog" aria-label="Switch tab">
        <div className="zen-fast-switcher-backdrop" onClick={closeFastTabSwitcher} />
        <div
          className="zen-fast-switcher-panel"
          data-thumbnail-revision={thumbnailRevision}
          style={{ '--fast-switcher-columns': columns } as CSSProperties}
        >
          <div className="zen-fast-switcher-cards" role="listbox" aria-label="Open tabs">
            {visible.map((candidate, index) => {
              const picture = thumbnailOf(candidate.id, false)
              return (
                <button
                  key={candidate.id}
                  type="button"
                  role="option"
                  aria-selected={index === selected}
                  className="zen-fast-switcher-card"
                  data-selected={index === selected || undefined}
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => activate(candidate.id)}
                >
                  <span className="zen-fast-switcher-preview">
                    {picture ? (
                      <img src={picture} alt="" />
                    ) : (
                      <span className="zen-fast-switcher-placeholder">
                        {candidate.favicon ? <img src={candidate.favicon} alt="" /> : null}
                      </span>
                    )}
                  </span>
                  <span className="zen-fast-switcher-title">
                    {candidate.title || candidate.url}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </ChromePortal>
  )
}
function activeTabId(state: UIState | null): string | null {
  if (!state) return null
  const space = state.spaces.find((candidate) => candidate.id === state.activeSpaceId)
  return space?.activeTabId ?? null
}
