'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { User as UserIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui'

const MAX_BYTES = 2 * 1024 * 1024
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp']

export function AvatarUploader({ userId, imageUrl }: { userId: string; imageUrl: string | null }) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const toast = useToast()

  async function handleFile(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      toast({ title: 'Только PNG, JPEG или WebP', variant: 'error' })
      return
    }
    if (file.size > MAX_BYTES) {
      toast({ title: 'Файл больше 2 МБ', variant: 'error' })
      return
    }

    setUploading(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${userId}/avatar-${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError

      const { data: publicUrl } = supabase.storage.from('avatars').getPublicUrl(path)

      const res = await fetch('/api/me/avatar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: publicUrl.publicUrl }),
      })
      if (!res.ok) throw new Error('save failed')

      toast({ title: 'Аватар обновлён', variant: 'success' })
      router.refresh()
    } catch {
      toast({ title: 'Не получилось загрузить аватар', variant: 'error' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      disabled={uploading}
      title="Изменить аватар"
      className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full border border-border bg-surface-2 transition-opacity hover:opacity-80 disabled:opacity-50"
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <UserIcon className="h-full w-full p-1.5 text-text-secondary" />
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
    </button>
  )
}
