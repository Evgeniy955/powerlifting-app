type NamedAthlete = {
  user?: { name: string | null; email: string } | null
  displayName?: string | null
  inviteEmail?: string | null
}

// A profile may not have a linked `user` yet (coach-created placeholder,
// pending invite) — fall back through what the coach entered at creation time.
export function athleteDisplayName(athlete: NamedAthlete): string {
  return (
    athlete.user?.name ??
    athlete.user?.email ??
    athlete.displayName ??
    athlete.inviteEmail ??
    'Без имени'
  )
}
