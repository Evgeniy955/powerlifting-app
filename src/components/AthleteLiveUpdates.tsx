'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Radio } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui'
import { liveUpdatesMuted } from '@/lib/liveUpdatesGate'

// The DB trigger broadcasts once per inserted/updated Set row, so a bulk
// write (copying a plan or weeks, an import) arrives as a burst of hundreds
// of events within a couple of seconds. Reacting to each one stacked hundreds
// of identical toasts and fired just as many router.refresh() calls, so events
// are coalesced: one refresh and at most one toast per burst, flushed once
// the burst goes quiet (or after MAX_WAIT_MS at the latest, so a long burst
// still shows progress).
const QUIET_MS = 700
const MAX_WAIT_MS = 3000

// Subscribes to the private "athlete:<athleteId>" broadcast channel (see the
// broadcast_set_entry_changes Postgres trigger) and refreshes the page when
// the athlete logs a new set — lets a coach watch a session live instead of
// re-opening the page to check for updates. Realtime Authorization (a policy
// on realtime.messages) restricts delivery to that athlete or their coach,
// so subscribing here never leaks another athlete's data.
export function AthleteLiveUpdates({ athleteId }: { athleteId: string }) {
  const [connected, setConnected] = useState(false)
  const router = useRouter()
  const toast = useToast()

  useEffect(() => {
    const supabase = createClient()
    let active = true

    let pendingInserts = 0
    let pendingRefresh = false
    let quietTimer: ReturnType<typeof setTimeout> | null = null
    let burstStartedAt = 0

    function flush() {
      if (quietTimer) clearTimeout(quietTimer)
      quietTimer = null
      burstStartedAt = 0
      const inserts = pendingInserts
      const refresh = pendingRefresh
      pendingInserts = 0
      pendingRefresh = false
      if (!active) return
      if (inserts > 0) {
        toast({
          title: inserts === 1 ? 'Атлет добавил подход' : `Атлет добавил подходы: ${inserts}`,
          variant: 'default',
        })
      }
      if (inserts > 0 || refresh) router.refresh()
    }

    function schedule() {
      const now = Date.now()
      if (!burstStartedAt) burstStartedAt = now
      if (quietTimer) clearTimeout(quietTimer)
      quietTimer = setTimeout(flush, Math.min(QUIET_MS, Math.max(0, burstStartedAt + MAX_WAIT_MS - now)))
    }

    async function subscribe() {
      await supabase.realtime.setAuth()
      const channel = supabase
        .channel(`athlete:${athleteId}`, { config: { private: true } })
        .on('broadcast', { event: 'INSERT' }, () => {
          // Coach-initiated bulk copies mute the toast (see liveUpdatesGate)
          // but still refresh, so the page shows the new data.
          if (liveUpdatesMuted()) pendingRefresh = true
          else pendingInserts += 1
          schedule()
        })
        .on('broadcast', { event: 'UPDATE' }, () => {
          pendingRefresh = true
          schedule()
        })
        .subscribe((status) => {
          if (active) setConnected(status === 'SUBSCRIBED')
        })

      return channel
    }

    const channelPromise = subscribe()
    return () => {
      active = false
      if (quietTimer) clearTimeout(quietTimer)
      channelPromise.then((channel) => supabase.removeChannel(channel))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId])

  if (!connected) return null

  return (
    <span
      title="Живые обновления включены"
      className="inline-flex items-center gap-1 text-xs text-zone-low"
    >
      <Radio className="h-3 w-3 animate-pulse" />
      онлайн
    </span>
  )
}
