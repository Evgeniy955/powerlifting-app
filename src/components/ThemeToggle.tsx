'use client'

import { useEffect, useState } from 'react'

const THEMES = [
  { value: 'theme-dark', label: 'Dark Modern' },
  { value: 'theme-light', label: 'Light Clean' },
  { value: 'theme-cyberpunk', label: 'Cyberpunk / Gym Mode' },
] as const

const THEME_CLASSES = THEMES.map((t) => t.value)

// Small select in the header that switches the theme class on <html> and
// persists the choice — the actual class swap on first paint happens via the
// inline script in layout.tsx (avoids a flash of the wrong theme before
// hydration). This component just keeps itself and localStorage in sync
// after that.
export function ThemeToggle() {
  const [theme, setTheme] = useState<string>('theme-dark')

  useEffect(() => {
    const current = THEME_CLASSES.find((c) => document.documentElement.classList.contains(c))
    if (current) setTheme(current)
  }, [])

  function applyTheme(value: string) {
    document.documentElement.classList.remove(...THEME_CLASSES)
    document.documentElement.classList.add(value)
    try {
      localStorage.setItem('theme', value)
    } catch {
      // ignore (e.g. privacy mode)
    }
    setTheme(value)
  }

  return (
    <select
      value={theme}
      onChange={(e) => applyTheme(e.target.value)}
      aria-label="Тема"
      className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-text-primary outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent"
    >
      {THEMES.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </select>
  )
}
