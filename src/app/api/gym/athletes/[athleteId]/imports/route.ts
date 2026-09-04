import { NextResponse } from 'next/server'

// Replaced by the two-step preview/confirm flow (imports/preview,
// imports/confirm — mirrors /api/athletes/:athleteId/import/{preview,confirm}
// on the powerlifting side, with exercise-catalog fuzzy-match review in
// between). This file could not be deleted from the coding sandbox that
// authored this change (a filesystem quirk unrelated to git — see the
// commit message), so it's neutralized here instead: delete this file
// (and the now-empty imports/ directory it sits directly under, alongside
// the sibling preview/ and confirm/ directories which should stay) once
// you've pulled this branch.
export async function POST() {
  return NextResponse.json(
    { error: 'Этот способ импорта больше не используется — обновите страницу.' },
    { status: 410 }
  )
}
