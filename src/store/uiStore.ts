import { create } from 'zustand'
import { loadVersioned, saveVersioned } from '../lib/persistence'

export type Theme = 'dark' | 'light'

const THEME_KEY = 'rsi-ha:theme'
const THEME_VERSION = 1

function loadTheme(): Theme {
  return loadVersioned<Theme>(THEME_KEY, THEME_VERSION, () => null) ?? 'dark'
}

export interface UiState {
  theme: Theme
  toggleTheme: () => void

  shortcutsOverlayOpen: boolean
  setShortcutsOverlayOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>()((set, get) => ({
  theme: loadTheme(),
  toggleTheme() {
    const theme: Theme = get().theme === 'dark' ? 'light' : 'dark'
    set({ theme })
    saveVersioned(THEME_KEY, THEME_VERSION, theme)
  },

  shortcutsOverlayOpen: false,
  setShortcutsOverlayOpen(open) {
    set({ shortcutsOverlayOpen: open })
  },
}))
