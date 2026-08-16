import { Skeleton } from '@/components/ui'

export default function Loading() {
  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm space-y-3">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </main>
  )
}
