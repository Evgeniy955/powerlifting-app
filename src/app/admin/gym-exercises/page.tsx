import { prisma } from '@/lib/prisma'
import { requireCoach } from '@/lib/session'
import Link from 'next/link'
import { GymExerciseAdmin } from '@/components/GymExerciseAdmin'
export default async function AdminGymExercises(){await requireCoach();const exercises=await prisma.gymExerciseCatalog.findMany({orderBy:{name:'asc'},include:{_count:{select:{exercises:true,maxes:true}}}});return <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-4xl space-y-5 bg-bg p-6 text-text-primary"><div><Link href="/admin/users" className="text-sm text-text-secondary">← Пользователи</Link><h1 className="font-display text-xl uppercase">Упражнения для тренажёрного зала</h1></div><GymExerciseAdmin initial={exercises}/></main>}
