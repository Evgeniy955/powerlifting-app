import { Resend } from 'resend'
import { prisma } from './prisma'

export class EmailNotConfiguredError extends Error {}

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new EmailNotConfiguredError(
      'RESEND_API_KEY не задан в .env — отправка email недоступна, пока ключ не добавлен.'
    )
  }
  return new Resend(apiKey)
}

// No custom domain verified in Resend yet -> falls back to their shared sandbox
// sender, which works out of the box but only delivers to the Resend account's
// own verified test addresses. Set RESEND_FROM_EMAIL once a domain is verified.
const FROM = process.env.RESEND_FROM_EMAIL || 'IronLedger <onboarding@resend.dev>'

// Where the "accept invite" link inside the email should point. Used to
// reference NEXTAUTH_URL — a var this app never actually sets (it's not in
// .env.example; auth moved to Supabase Auth, see login/page.tsx), so on
// Vercel it silently fell back to http://localhost:3000, baking a dead link
// into every real invite email. Vercel already exposes the project's real
// domain at build/runtime with no configuration needed — prefer that, then
// the current deployment's own URL (useful for testing from a preview
// deploy), then finally localhost for local dev. NEXT_PUBLIC_APP_URL is an
// explicit override for when a custom domain is verified in Resend but
// hasn't been set as the Vercel project's primary domain yet.
function appBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

type InviteEmailInput = {
  to: string
  coachName: string
  athleteDisplayName: string
  token: string
}

// Awaited at its one call site (POST /api/athletes/[id]/invite) and allowed to
// throw — the coach needs to know immediately if the send failed.
export async function sendInviteEmail({ to, coachName, athleteDisplayName, token }: InviteEmailInput) {
  const resend = getResendClient()
  const acceptUrl = `${appBaseUrl()}/login?invite=${token}`

  await resend.emails.send({
    from: FROM,
    to,
    subject: `${coachName} приглашает вас в IronLedger`,
    html: `
      <p>Привет${athleteDisplayName ? `, ${athleteDisplayName}` : ''}!</p>
      <p><strong>${coachName}</strong> приглашает вас как атлета в IronLedger — дневник тренировок по пауэрлифтингу.</p>
      <p><a href="${acceptUrl}">Принять приглашение и войти через Google</a></p>
      <p style="color:#888;font-size:12px">Если вы не ожидали это письмо, просто проигнорируйте его.</p>
    `,
  })
}

// Only the ATHLETE's own edits are worth notifying the coach about, and only
// if they actually have a coach — resolves the coach's email in that case,
// null otherwise so call sites can skip queuing entirely.
export async function coachEmailToNotify(
  role: string,
  coachId: string | null
): Promise<string | null> {
  if (role !== 'ATHLETE' || !coachId) return null
  const coach = await prisma.user.findUnique({ where: { id: coachId }, select: { email: true } })
  return coach?.email ?? null
}

export type ChangeEventKind = 'set-updated' | 'set-removed' | 'exercise-added' | 'exercise-removed'

export type ChangeEvent = {
  athleteId: string
  coachEmail: string
  workoutId: string
  workoutDate: Date
  weekNumber: number
  dayNumber: number
  exerciseName: string
  kind: ChangeEventKind
  setNumber?: number
  field?: 'weight' | 'reps'
  before?: number | null
  after?: number | null
  at: Date
}

type PendingDigest = {
  events: ChangeEvent[]
  firstEventAt: number
  timer: ReturnType<typeof setTimeout>
}

// Process-memory buffer, not persisted — acceptable for this app's scale (single
// coach, long-lived `next dev`/`next start` process, not serverless). Lost on
// restart mid-window; a real change-log table + queue would be the production fix.
const pendingByAthlete = new Map<string, PendingDigest>()

const DIGEST_IDLE_MS = 5 * 60 * 1000
const DIGEST_MAX_WAIT_MS = 20 * 60 * 1000

// Fire-and-forget: never throws, so a missing key or Resend outage can never
// fail the athlete's actual save. Call only when the editor is the ATHLETE.
export function queueChangeNotification(event: ChangeEvent) {
  try {
    const existing = pendingByAthlete.get(event.athleteId)
    if (existing) {
      clearTimeout(existing.timer)
      existing.events.push(event)
      const waitedSoFar = Date.now() - existing.firstEventAt
      const delay = Math.min(DIGEST_IDLE_MS, DIGEST_MAX_WAIT_MS - waitedSoFar)
      existing.timer = setTimeout(() => flushDigest(event.athleteId), Math.max(delay, 0))
    } else {
      const entry: PendingDigest = {
        events: [event],
        firstEventAt: Date.now(),
        timer: setTimeout(() => flushDigest(event.athleteId), DIGEST_IDLE_MS),
      }
      pendingByAthlete.set(event.athleteId, entry)
    }
  } catch (err) {
    console.error('queueChangeNotification failed', err)
  }
}

function fieldLabel(field: ChangeEvent['field']) {
  return field === 'weight' ? 'вес' : field === 'reps' ? 'повторы' : field
}

function describeEvent(e: ChangeEvent): string {
  if (e.kind === 'exercise-added') return `+ Добавлено упражнение: ${e.exerciseName}`
  if (e.kind === 'exercise-removed') return `− Удалено упражнение из плана: ${e.exerciseName}`
  if (e.kind === 'set-removed') return `− Удалён подход ${e.setNumber} (${e.exerciseName})`
  return `Подход ${e.setNumber} (${e.exerciseName}): ${fieldLabel(e.field)} ${e.before ?? '—'} → ${e.after ?? '—'}`
}

async function flushDigest(athleteId: string) {
  const pending = pendingByAthlete.get(athleteId)
  pendingByAthlete.delete(athleteId)
  if (!pending || pending.events.length === 0) return

  try {
    const resend = getResendClient()
    const [{ coachEmail }] = pending.events

    const byWorkout = new Map<string, ChangeEvent[]>()
    for (const e of pending.events) {
      const list = byWorkout.get(e.workoutId) ?? []
      list.push(e)
      byWorkout.set(e.workoutId, list)
    }

    const sections = Array.from(byWorkout.values())
      .map((events) => {
        const [{ weekNumber, dayNumber, workoutDate }] = events
        const dateStr = workoutDate.toISOString().slice(0, 10)
        const lines = events.map((e) => `<li>${describeEvent(e)}</li>`).join('')
        return `<p><strong>Неделя ${weekNumber} · День ${dayNumber} (${dateStr})</strong></p><ul>${lines}</ul>`
      })
      .join('')

    await resend.emails.send({
      from: FROM,
      to: coachEmail,
      subject: 'Атлет внёс изменения в тренировку',
      html: sections,
    })
  } catch (err) {
    console.error('flushDigest failed', err)
  }
}
