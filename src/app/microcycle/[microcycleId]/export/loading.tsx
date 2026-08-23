import { LoadingIndicator } from '@/components/LoadingIndicator'

export default function Loading() {
  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-bg">
      <LoadingIndicator label="Готовим файл для экспорта" />
    </main>
  )
}
