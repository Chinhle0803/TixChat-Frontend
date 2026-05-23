import { create } from 'zustand'

const STORAGE_KEY = 'tixchat.theme.v1'

const applyTheme = (theme) => {
  if (typeof document === 'undefined') return
  const nextTheme = theme === 'light' || theme === 'dark' ? theme : ''
  if (nextTheme) {
    document.documentElement.setAttribute('data-theme', nextTheme)
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
}

const readTheme = () => {
  if (typeof localStorage === 'undefined') return 'system'
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

export const useThemeStore = create((set, get) => ({
  theme: readTheme(),
  initializeTheme: () => {
    applyTheme(get().theme)
  },
  setTheme: (theme) => {
    const nextTheme = theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system'
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, nextTheme)
    }
    applyTheme(nextTheme)
    set({ theme: nextTheme })
  },
  cycleTheme: () => {
    const order = ['system', 'light', 'dark']
    const current = get().theme
    const nextTheme = order[(order.indexOf(current) + 1) % order.length] || 'system'
    get().setTheme(nextTheme)
  },
}))

export default useThemeStore
