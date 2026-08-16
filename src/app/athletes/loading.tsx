import { Skeleton } from '@/components/ui'

export default function Loading() {
  return (
    <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-md space-y-4 bg-bg p-6 lg:max-w-4xl">
      <Skeleton className="h-6 w-40" />
      <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </main>
  )
}
