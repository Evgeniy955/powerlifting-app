// Lets the coach's own bulk actions (e.g. copying a whole plan, which
// inserts hundreds of Set rows in one go) mute AthleteLiveUpdates' "Атлет
// добавил подход" toast for a moment. The broadcast trigger fires for every
// inserted row no matter who caused it, so without this the coach's own copy
// would announce itself as the athlete logging sets. Module-level on purpose:
// the button and the subscriber are unrelated components on the same page.
let mutedUntil = 0

export function muteLiveUpdatesFor(ms: number) {
  mutedUntil = Math.max(mutedUntil, Date.now() + ms)
}

export function liveUpdatesMuted() {
  return Date.now() < mutedUntil
}
