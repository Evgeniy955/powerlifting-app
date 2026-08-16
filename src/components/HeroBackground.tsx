// Decorative, theme-aware background art (radial glow + a faint stylized
// barbell silhouette) built as inline SVG so it recolors automatically across
// all 3 themes via the existing CSS variables — no image assets, no external
// generation service, no extra network weight on a page used from a phone.
export function HeroBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div
        className="absolute -top-1/3 left-1/2 h-[60rem] w-[60rem] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
        style={{
          background: 'radial-gradient(circle, var(--color-accent) 0%, transparent 70%)',
        }}
      />
      <svg
        className="absolute -bottom-24 -right-24 h-[36rem] w-[36rem] rotate-[18deg] opacity-[0.07] md:h-[48rem] md:w-[48rem]"
        viewBox="0 0 400 200"
        fill="none"
      >
        <rect x="40" y="90" width="320" height="20" rx="10" fill="var(--color-text-primary)" />
        <rect x="10" y="60" width="18" height="80" rx="6" fill="var(--color-text-primary)" />
        <rect x="34" y="45" width="14" height="110" rx="6" fill="var(--color-text-primary)" />
        <rect x="372" y="60" width="18" height="80" rx="6" fill="var(--color-text-primary)" />
        <rect x="352" y="45" width="14" height="110" rx="6" fill="var(--color-text-primary)" />
      </svg>
    </div>
  )
}
