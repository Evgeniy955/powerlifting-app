'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Radio } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui'

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

    async function subscribe() {
      await supabase.realtime.setAuth()
      const channel = supabase
        .channel(`athlete:${athleteId}`, { config: { private: true } })
        .on('broadcast', { event: 'INSERT' }, () => {
          toast({ title: 'Атлет добавил подход', variant: 'default' })
          router.refresh()
        })
        .on('broadcast', { event: 'UPDATE' }, () => router.refresh())
        .subscribe((status) => {
          if (active) setConnected(status === 'SUBSCRIBED')
        })

      return channel
    }

    const channelPromise = subscribe()
    return () => {
      active = false
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
