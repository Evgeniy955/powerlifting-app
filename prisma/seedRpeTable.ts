// Digitized from the coach's RPE chart (Reactive Training Systems style):
// rows = ИУ ("RPE", 1-10), columns = reps performed, cell = %1RM.
// Only the combinations visible in the source chart are included — the chart
// itself leaves low-RPE/high-rep and low-RPE/low-rep corners blank because
// they're not practically used in programming. Edit this file directly to add
// more points if you have them; the app will pick them up next time you run
// `npm run prisma:seed-rpe`.
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type Row = { rpe: number; byReps: Record<number, number> }

const rows: Row[] = [
  { rpe: 10, byReps: { 1: 100, 2: 95, 3: 90, 4: 85, 5: 80, 6: 77, 7: 74, 8: 71, 10: 66, 12: 62 } },
  { rpe: 9, byReps: { 1: 95, 2: 92, 3: 87, 4: 83, 5: 77, 6: 74, 7: 71, 8: 68, 10: 64, 12: 60 } },
  { rpe: 8, byReps: { 1: 90, 2: 88, 3: 85, 4: 80, 5: 74, 6: 71, 7: 67, 8: 66, 10: 62, 12: 58 } },
  { rpe: 7, byReps: { 2: 85, 3: 83, 4: 77, 5: 71, 6: 67, 7: 65, 8: 64, 10: 60, 12: 56 } },
  { rpe: 6, byReps: { 2: 82, 3: 80, 4: 74, 5: 67 } },
  { rpe: 5, byReps: { 2: 77, 3: 75, 4: 70, 5: 63 } },
  { rpe: 4, byReps: { 1: 73 } },
]

const points = rows.flatMap((row) =>
  Object.entries(row.byReps).map(([reps, percent1rm]) => ({
    reps: Number(reps),
    rpe: row.rpe,
    percent1rm: percent1rm / 100,
  }))
)

async function main() {
  console.log(`Seeding RPE table (${points.length} points)...`)
  for (const p of points) {
    await prisma.rpeTable.upsert({
      where: { reps_rpe: { reps: p.reps, rpe: p.rpe } },
      update: { percent1rm: p.percent1rm },
      create: p,
    })
  }
  console.log('Done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
