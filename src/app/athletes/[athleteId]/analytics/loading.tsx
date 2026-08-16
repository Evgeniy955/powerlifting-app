import { Skeleton } from '@/components/ui'

export default function Loading() {
  return (
    <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-2xl space-y-4 bg-bg p-6 lg:max-w-5xl">
      <Skeleton className="h-6 w-32" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </main>
  )
}
