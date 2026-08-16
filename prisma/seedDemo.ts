// Dev convenience: creates one demo athlete with a small populated cycle so you can
// exercise the workout screen, analytics, and export with only your own coach
// Google login — no second Google account needed for local testing.
// Run AFTER you've signed in once as coach (so a COACH user row exists).
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const coach = await prisma.user.findFirst({ where: { role: 'COACH' } })
  if (!coach) {
    throw new Error(
      'Не найден пользователь с ролью COACH — сначала войди в приложение через Google хотя бы раз.'
    )
  }

  const squat = await prisma.exerciseCatalog.findUnique({ where: { name: 'Приседание' } })
  const bench = await prisma.exerciseCatalog.findUnique({ where: { name: 'Жим лежа' } })
  if (!squat || !bench) {
    throw new Error('Справочник упражнений пуст — сначала выполни npm run prisma:seed.')
  }

  const demoUser = await prisma.user.upsert({
    where: { email: 'demo-athlete@example.local' },
    update: {},
    create: { email: 'demo-athlete@example.local', name: 'Демо Атлет', role: 'ATHLETE' },
  })

  const athlete = await prisma.athleteProfile.upsert({
    where: { userId: demoUser.id },
    update: { coachId: coach.id },
    create: { userId: demoUser.id, coachId: coach.id },
  })

  await prisma.athlete1RM.upsert({
    where: { athleteId_exerciseId: { athleteId: athlete.id, exerciseId: squat.id } },
    update: { value: 150 },
    create: { athleteId: athlete.id, exerciseId: squat.id, value: 150 },
  })
  await prisma.athlete1RM.upsert({
    where: { athleteId_exerciseId: { athleteId: athlete.id, exerciseId: bench.id } },
    update: { value: 100 },
    create: { athleteId: athlete.id, exerciseId: bench.id, value: 100 },
  })

  const cycle = await prisma.cycle.create({
    data: {
      athleteId: athlete.id,
      name: 'Демо цикл',
      startDate: new Date(),
      weeks: 2,
    },
  })

  // Week 1: Monday squat, Wednesday bench. Week 2: same pattern, slightly heavier.
  const plan = [
    { week: 1, dayOffset: 0, exerciseId: squat.id, sets: [[100, 5], [120, 3], [135, 3]] },
    { week: 1, dayOffset: 2, exerciseId: bench.id, sets: [[70, 5], [85, 3], [90, 3]] },
    { week: 2, dayOffset: 7, exerciseId: squat.id, sets: [[105, 5], [125, 3], [140, 2]] },
    { week: 2, dayOffset: 9, exerciseId: bench.id, sets: [[72, 5], [87, 3], [92, 2]] },
  ] as const

  const microcycleByWeek = new Map<number, string>()
  for (const item of plan) {
    let microcycleId = microcycleByWeek.get(item.week)
    if (!microcycleId) {
      const mc = await prisma.microcycle.create({
        data: { cycleId: cycle.id, weekNumber: item.week },
      })
      microcycleId = mc.id
      microcycleByWeek.set(item.week, microcycleId)
    }

    const scheduledDate = new Date(Date.now() - (14 - item.dayOffset) * 24 * 60 * 60 * 1000)
    const workout = await prisma.workout.create({
      data: { microcycleId, scheduledDate, dayNumber: item.dayOffset % 7 === 0 ? 1 : 2 },
    })

    const entry = await prisma.exerciseEntry.create({
      data: { workoutId: workout.id, exerciseId: item.exerciseId, orderIndex: 0 },
    })

    await prisma.setEntry.createMany({
      data: item.sets.map(([weight, reps], i) => ({
        exerciseEntryId: entry.id,
        setNumber: i + 1,
        weight,
        reps,
      })),
    })
  }

  console.log(`Готово. Демо-атлет привязан к тренеру ${coach.email}.`)
  console.log(`Открой /athletes — там появится "Демо Атлет" со ссылками на аналитику/экспорт.`)
  console.log(`Цикл: /cycles/${cycle.id}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
