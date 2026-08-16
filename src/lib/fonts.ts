import { Oswald, Manrope } from 'next/font/google'

// Cyrillic-complete pairing (the app is entirely Russian-language) — Barlow/
// Barlow Condensed were the initial pick but only ship latin/latin-ext/
// vietnamese subsets, so they were rejected before implementation started.
export const fontDisplay = Oswald({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
})

export const fontBody = Manrope({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
})
