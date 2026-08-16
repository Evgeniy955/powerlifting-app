// Seed data extracted from the original Excel training-log workbooks
// (sheets "Коэффициенты" -> exercise catalog, "F" -> fatigue coefficient curve).
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const exercises = [
  { name: 'Приседание', category: 'Присед', impactCoefficient: 1.2 },
  { name: 'Приседание сумо', category: 'Присед', impactCoefficient: 1.2 },
  { name: 'Присед фронтальный', category: 'Присед', impactCoefficient: 1.2 },
  { name: 'Приседание на лавку', category: 'Присед', impactCoefficient: 1.2 },
  { name: 'Наклоны стоя', category: 'Присед', impactCoefficient: 0.8 },
  { name: 'Тяга на прямых ногах', category: 'Присед', impactCoefficient: 1.2 },
  { name: 'Разгибания ног', category: 'Присед', impactCoefficient: 0.3 },
  { name: 'Сгибания ног', category: 'Присед', impactCoefficient: 0.3 },
  { name: 'Жим лежа', category: 'Жим', impactCoefficient: 1.0 },
  { name: 'Жим на наклонной скамье', category: 'Жим', impactCoefficient: 1.0 },
  { name: 'Жим с паузой 2 секунды', category: 'Жим', impactCoefficient: 1.0 },
  { name: 'Жим с остановками', category: 'Жим', impactCoefficient: 1.0 },
  { name: 'Дожим с 4 см', category: 'Жим', impactCoefficient: 1.0 },
  { name: 'Дожим с 6 см', category: 'Жим', impactCoefficient: 1.0 },
  { name: 'Дожим с 8 см', category: 'Жим', impactCoefficient: 1.0 },
  { name: 'Дожим с 10 см', category: 'Жим', impactCoefficient: 1.0 },
  { name: 'Жим в раме (дожим)', category: 'Жим', impactCoefficient: 1.0 },
  { name: 'Жим гантелей лежа на гор скамье', category: 'Жим', impactCoefficient: 0.8 },
  { name: 'Жим гантелей лежа на накл скамье', category: 'Жим', impactCoefficient: 0.8 },
  { name: 'Жим с цепями (штанга+цепи)', category: 'Жим', impactCoefficient: 1.0 },
  { name: 'Жим лежа средним хватом', category: 'Жим', impactCoefficient: 1.0 },
  { name: 'Скоростной жим', category: 'Жим', impactCoefficient: 1.0 },
  { name: 'Кроссовер', category: 'Жим', impactCoefficient: 0.3 },
  { name: 'Жим лежа узким хватом', category: 'Жим', impactCoefficient: 1.0 },
  { name: 'Разгиб. с гантелью из-за головы', category: 'Жим', impactCoefficient: 0.3 },
  { name: 'Французский жим лежа', category: 'Жим', impactCoefficient: 0.4 },
  { name: 'Трицепс на блоке', category: 'Жим', impactCoefficient: 0.3 },
  { name: 'Жим стоя', category: 'Жим', impactCoefficient: 1.0 },
  { name: 'Подъем штанги перед собой', category: 'Жим', impactCoefficient: 0.8 },
  { name: 'Подъем гантели перед собой', category: 'Жим', impactCoefficient: 0.5 },
  { name: 'Бицепс с гантелями', category: 'Жим', impactCoefficient: 0.4 },
  { name: 'Бицепс стоя со штангой', category: 'Жим', impactCoefficient: 0.5 },
  { name: 'Становая тяга', category: 'Тяга', impactCoefficient: 1.4 },
  { name: 'Становая тяга из ямы', category: 'Тяга', impactCoefficient: 1.4 },
  { name: 'Становая тяга с остановками', category: 'Тяга', impactCoefficient: 1.4 },
  { name: 'Становая тяга с плинтов', category: 'Тяга', impactCoefficient: 1.4 },
  { name: 'Становая тяга до колен', category: 'Тяга', impactCoefficient: 1.4 },
  { name: 'Подтягивание', category: 'Спина/подсобка', impactCoefficient: 1.2 },
  { name: 'Тяга верхнего блока к груди', category: 'Спина/подсобка', impactCoefficient: 0.5 },
  { name: 'Тяга нижнего блока к животу', category: 'Спина/подсобка', impactCoefficient: 0.5 }
]

// 100 curve points to be exact; VLOOKUP-approx-match matches original Excel semantics.
const fatigueCurve = [
  { percent1rm: 0.01, coefficient: 0.0 },
  { percent1rm: 0.02, coefficient: 0.001 },
  { percent1rm: 0.03, coefficient: 0.002 },
  { percent1rm: 0.04, coefficient: 0.003 },
  { percent1rm: 0.05, coefficient: 0.004 },
  { percent1rm: 0.06, coefficient: 0.005 },
  { percent1rm: 0.07, coefficient: 0.006 },
  { percent1rm: 0.08, coefficient: 0.007 },
  { percent1rm: 0.09, coefficient: 0.008 },
  { percent1rm: 0.1, coefficient: 0.009 },
  { percent1rm: 0.11, coefficient: 0.01 },
  { percent1rm: 0.12, coefficient: 0.011 },
  { percent1rm: 0.13, coefficient: 0.012 },
  { percent1rm: 0.14, coefficient: 0.015 },
  { percent1rm: 0.15, coefficient: 0.018 },
  { percent1rm: 0.16, coefficient: 0.021 },
  { percent1rm: 0.17, coefficient: 0.024 },
  { percent1rm: 0.18, coefficient: 0.027 },
  { percent1rm: 0.19, coefficient: 0.03 },
  { percent1rm: 0.2, coefficient: 0.03 },
  { percent1rm: 0.21, coefficient: 0.04 },
  { percent1rm: 0.22, coefficient: 0.05 },
  { percent1rm: 0.23, coefficient: 0.06 },
  { percent1rm: 0.24, coefficient: 0.07 },
  { percent1rm: 0.25, coefficient: 0.08 },
  { percent1rm: 0.26, coefficient: 0.09 },
  { percent1rm: 0.27, coefficient: 0.1 },
  { percent1rm: 0.28, coefficient: 0.11 },
  { percent1rm: 0.29, coefficient: 0.12 },
  { percent1rm: 0.3, coefficient: 0.13 },
  { percent1rm: 0.31, coefficient: 0.14 },
  { percent1rm: 0.32, coefficient: 0.16 },
  { percent1rm: 0.33, coefficient: 0.18 },
  { percent1rm: 0.34, coefficient: 0.2 },
  { percent1rm: 0.35, coefficient: 0.22 },
  { percent1rm: 0.36, coefficient: 0.24 },
  { percent1rm: 0.37, coefficient: 0.26 },
  { percent1rm: 0.38, coefficient: 0.28 },
  { percent1rm: 0.39, coefficient: 0.3 },
  { percent1rm: 0.4, coefficient: 0.32 },
  { percent1rm: 0.41, coefficient: 0.34 },
  { percent1rm: 0.42, coefficient: 0.36 },
  { percent1rm: 0.43, coefficient: 0.38 },
  { percent1rm: 0.44, coefficient: 0.4 },
  { percent1rm: 0.45, coefficient: 0.42 },
  { percent1rm: 0.46, coefficient: 0.44 },
  { percent1rm: 0.47, coefficient: 0.46 },
  { percent1rm: 0.48, coefficient: 0.47 },
  { percent1rm: 0.49, coefficient: 0.48 },
  { percent1rm: 0.5, coefficient: 0.5 },
  { percent1rm: 0.51, coefficient: 0.51 },
  { percent1rm: 0.52, coefficient: 0.53 },
  { percent1rm: 0.53, coefficient: 0.54 },
  { percent1rm: 0.54, coefficient: 0.56 },
  { percent1rm: 0.55, coefficient: 0.58 },
  { percent1rm: 0.56, coefficient: 0.6 },
  { percent1rm: 0.57, coefficient: 0.62 },
  { percent1rm: 0.58, coefficient: 0.65 },
  { percent1rm: 0.59, coefficient: 0.68 },
  { percent1rm: 0.6, coefficient: 0.7 },
  { percent1rm: 0.61, coefficient: 0.71 },
  { percent1rm: 0.62, coefficient: 0.73 },
  { percent1rm: 0.63, coefficient: 0.75 },
  { percent1rm: 0.64, coefficient: 0.78 },
  { percent1rm: 0.65, coefficient: 0.8 },
  { percent1rm: 0.66, coefficient: 0.82 },
  { percent1rm: 0.67, coefficient: 0.84 },
  { percent1rm: 0.68, coefficient: 0.87 },
  { percent1rm: 0.69, coefficient: 0.89 },
  { percent1rm: 0.7, coefficient: 0.9 },
  { percent1rm: 0.71, coefficient: 0.95 },
  { percent1rm: 0.72, coefficient: 1.0 },
  { percent1rm: 0.73, coefficient: 1.07 },
  { percent1rm: 0.74, coefficient: 1.14 },
  { percent1rm: 0.75, coefficient: 1.2 },
  { percent1rm: 0.76, coefficient: 1.27 },
  { percent1rm: 0.77, coefficient: 1.34 },
  { percent1rm: 0.78, coefficient: 1.4 },
  { percent1rm: 0.79, coefficient: 1.47 },
  { percent1rm: 0.8, coefficient: 1.53 },
  { percent1rm: 0.81, coefficient: 1.6 },
  { percent1rm: 0.82, coefficient: 1.67 },
  { percent1rm: 0.83, coefficient: 1.74 },
  { percent1rm: 0.84, coefficient: 1.82 },
  { percent1rm: 0.85, coefficient: 1.9 },
  { percent1rm: 0.86, coefficient: 2.05 },
  { percent1rm: 0.87, coefficient: 2.2 },
  { percent1rm: 0.88, coefficient: 2.4 },
  { percent1rm: 0.89, coefficient: 2.6 },
  { percent1rm: 0.9, coefficient: 2.8 },
  { percent1rm: 0.91, coefficient: 3.0 },
  { percent1rm: 0.92, coefficient: 3.2 },
  { percent1rm: 0.93, coefficient: 3.6 },
  { percent1rm: 0.94, coefficient: 4.0 },
  { percent1rm: 0.95, coefficient: 4.5 },
  { percent1rm: 0.96, coefficient: 5.0 },
  { percent1rm: 0.97, coefficient: 7.5 },
  { percent1rm: 0.98, coefficient: 12.0 },
  { percent1rm: 0.99, coefficient: 18.0 },
  { percent1rm: 1.0, coefficient: 25.0 }
]

async function main() {
  console.log('Seeding exercise catalog (40 rows)...')
  for (const ex of exercises) {
    await prisma.exerciseCatalog.upsert({
      where: { name: ex.name },
      update: { impactCoefficient: ex.impactCoefficient, category: ex.category },
      create: ex,
    })
  }

  console.log('Seeding fatigue coefficient curve (100 rows)...')
  for (const point of fatigueCurve) {
    await prisma.fatigueCoefficient.upsert({
      where: { percent1rm: point.percent1rm },
      update: { coefficient: point.coefficient },
      create: point,
    })
  }

  console.log('Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
