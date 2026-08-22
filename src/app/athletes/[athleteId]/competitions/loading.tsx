import { LoadingIndicator } from '@/components/LoadingIndicator'

export default function Loading() {
  return (
    <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-md bg-bg p-6 lg:max-w-4xl">
      <LoadingIndicator label="Загружаем соревнования" />
    </main>
  )
}
