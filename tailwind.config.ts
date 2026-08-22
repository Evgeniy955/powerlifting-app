import type { Config } from 'tailwindcss'

// Design tokens per the 3-theme system (Dark Modern / Light Clean / Cyberpunk),
// wired up as CSS variables so themes can be swapped at runtime via a class on <html>.
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-2': 'var(--color-surface-2)',
        'surface-3': 'var(--color-surface-3)',
        border: 'var(--color-border)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        accent: 'var(--color-accent)',
        'on-accent': 'var(--color-on-accent)',
        'accent-2': 'var(--color-accent-2)',
        'on-accent-2': 'var(--color-on-accent-2)',
        danger: 'var(--color-danger)',
        'on-danger': 'var(--color-on-danger)',
        zone: {
          low: '#4ADE80',
          moderate: '#FBBF24',
          high: '#FB923C',
          max: '#F87171',
          // Fixed dark text for solid zone-colored badges (bg-zone-*) — all
          // four zone hues are light/mid-brightness, so this one dark color
          // reads clearly on every one of them, in every theme. Not meant
          // for use as a background or on any other surface.
          ink: '#1c140d',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 16px -4px var(--shadow-color)',
        elevated: '0 12px 32px -8px var(--shadow-color)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'skeleton-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'barbell-lift': {
          '0%, 100%': { transform: 'translateY(0) rotate(-6deg)' },
          '50%': { transform: 'translateY(-8px) rotate(6deg)' },
        },
        'glow-pulse': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.25' },
          '50%': { transform: 'scale(1.2)', opacity: '0.5' },
        },
        'dot-bounce': {
          '0%, 80%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
          '40%': { transform: 'translateY(-4px)', opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'slide-up': 'slide-up 250ms cubic-bezier(0.16,1,0.3,1)',
        'scale-in': 'scale-in 200ms cubic-bezier(0.16,1,0.3,1)',
        'skeleton-pulse': 'skeleton-pulse 1.5s ease-in-out infinite',
        'barbell-lift': 'barbell-lift 1.1s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 1.1s ease-in-out infinite',
        'dot-bounce': 'dot-bounce 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
