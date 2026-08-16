import type { Metadata } from 'next'
import './globals.css'
import { fontDisplay, fontBody } from '@/lib/fonts'
import { Providers } from '@/components/Providers'
import { AppHeader } from '@/components/AppHeader'

export const metadata: Metadata = {
  title: 'IronLedger',
  description: 'Дневник тренировок по пауэрлифтингу',
}

// Runs before paint to apply the saved theme (Dark Modern / Light Clean /
// Cyberpunk) — avoids a flash of the default dark theme for someone who
// picked a different one last time. `suppressHydrationWarning` on <html>
// is needed because this script may change className before React hydrates.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem('theme');
    if (t === 'theme-light' || t === 'theme-cyberpunk') {
      document.documentElement.classList.remove('theme-dark');
      document.documentElement.classList.add(t);
    }
  } catch (e) {}
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ru"
      className={`theme-dark ${fontDisplay.variable} ${fontBody.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers>
          <AppHeader />
          {children}
        </Providers>
      </body>
    </html>
  )
}
