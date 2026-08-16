'use client'

import { DragEvent, useId, useRef, useState } from 'react'
import { UploadCloud } from 'lucide-react'

type DropzoneProps = {
  accept?: string
  label?: string
  hint?: string
  onFileSelected: (file: File) => void
  disabled?: boolean
}

// Drag-and-drop capable replacement for the raw <input type="file"> +
// `file:` pseudo-class styling. Keeps the same underlying native input (so
// the browser's file picker still works) and just forwards the chosen File —
// callers keep whatever FormData/fetch logic they already had.
export function Dropzone({ accept, label, hint, onFileSelected, disabled }: DropzoneProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFileSelected(file)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={disabled ? undefined : handleDrop}
      aria-disabled={disabled}
      className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
        isDragOver ? 'border-accent bg-surface-2' : 'border-border bg-surface-2/50 hover:border-accent/60'
      } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
    >
      <UploadCloud className="h-8 w-8 text-accent" />
      <p className="text-sm font-medium text-text-primary">
        {label ?? 'Перетащите файл сюда или нажмите для выбора'}
      </p>
      {hint && <p className="text-xs text-text-secondary">{hint}</p>}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFileSelected(file)
          e.target.value = ''
        }}
        className="hidden"
      />
    </div>
  )
}
