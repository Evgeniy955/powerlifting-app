'use client'

import { signOut } from 'next-auth/react'

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="text-sm text-text-secondary transition-colors hover:text-text-primary"
    >
      Выйти
    </button>
  )
}
