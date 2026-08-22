import { requireUser } from '@/lib/session'
import { ChevronDown, HelpCircle } from 'lucide-react'
import { Card } from '@/components/ui'
import { FAQ_ATHLETE, FAQ_COACH, FAQ_GENERAL, type FaqItem } from '@/lib/faqContent'

// Plain <details>/<summary> — a native, zero-JS accordion. Keeps this page a
// Server Component (no client bundle needed just to expand/collapse text),
// and degrades gracefully (everything's still readable, just all "open") if
// JS is ever disabled.
function FaqSection({ title, items }: { title: string; items: FaqItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="space-y-2">
      <h2 className="font-display text-sm uppercase tracking-wide text-text-secondary">
        {title}
      </h2>
      <div className="space-y-2">
        {items.map((item) => (
          <Card key={item.q} padding="none" className="overflow-hidden">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface-2 marker:content-none">
                {item.q}
                <ChevronDown className="h-4 w-4 shrink-0 text-text-secondary transition-transform group-open:rotate-180" />
              </summary>
              <p className="border-t border-border px-4 py-3 text-sm leading-relaxed text-text-secondary">
                {item.a}
              </p>
            </details>
          </Card>
        ))}
      </div>
    </div>
  )
}

// Help/FAQ, split by who it's for: general questions relevant to both roles
// up top, then a role-specific section — a coach never sees the athlete
// questions and vice versa, since half of them describe screens the other
// role can't even open (Периодизация, Импорт из Excel are coach-only;
// editing sets is athlete-flavored even though a coach can do it too).
export default async function FaqPage() {
  const user = await requireUser()

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-bg text-text-primary p-6 max-w-md mx-auto space-y-6 lg:max-w-2xl">
      <div className="flex items-center gap-2">
        <HelpCircle className="h-5 w-5 text-accent" />
        <h1 className="font-display text-xl uppercase tracking-wide">Помощь / FAQ</h1>
      </div>

      <FaqSection title="Общие вопросы" items={FAQ_GENERAL} />
      {user.role === 'COACH' && <FaqSection title="Для тренера" items={FAQ_COACH} />}
      {user.role === 'ATHLETE' && <FaqSection title="Для спортсмена" items={FAQ_ATHLETE} />}
    </main>
  )
}
