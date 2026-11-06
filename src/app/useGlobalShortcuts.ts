import { useEffect } from 'react'
import { useUiStore } from '../store/uiStore'

/** `?` opens the shortcuts cheat sheet, and Escape closes it, from anywhere. */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null
      const isTyping = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

      if (event.key === 'Escape' && useUiStore.getState().shortcutsOverlayOpen) {
        useUiStore.getState().setShortcutsOverlayOpen(false)
      } else if (event.key === '?' && !isTyping) {
        event.preventDefault()
        useUiStore.getState().setShortcutsOverlayOpen(true)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
