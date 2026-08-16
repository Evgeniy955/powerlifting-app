import { Skeleton } from '@/components/ui'

export default function Loading() {
  return (
    <main className="min-h-[calc(100vh-3.5rem)] space-y-4 bg-bg py-6">
      <Skeleton className="mx-auto h-6 w-48" />
      <div className="mx-auto max-w-md space-y-4 p-4 lg:max-w-6xl lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full rounded-xl" />
        ))}
      </div>
    </main>
  )
}
