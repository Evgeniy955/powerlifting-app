import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Server-side Supabase client (Server Components, Route Handlers, Server
// Actions) — reads/writes the auth session via cookies. Only used for
// `auth.getUser()`; business data still goes through Prisma (`@/lib/prisma`).
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component (not a Route Handler/Server
            // Action) — cookies can't be set here. Harmless as long as
            // middleware.ts is refreshing the session on every request.
          }
        },
      },
    }
  )
}
