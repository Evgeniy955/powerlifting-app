'use client'

import { createBrowserClient } from '@supabase/ssr'

// Browser-side Supabase client — used for Auth (signInWithOAuth/signOut),
// Storage uploads, and Realtime subscriptions from client components.
// Never used to query business tables directly (those stay behind Prisma
// on the server) — this only ever talks to Supabase's Auth/Storage/Realtime
// APIs with the anon/publishable key.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
