import { GoogleGenAI } from '@google/genai'
import { prisma } from './prisma'
import { getWeeklyLoadDistribution, getExerciseProgress } from './analytics'
import { getRpeTable } from './workout'
import { athleteDisplayName } from './athlete'

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.7-flash'

export class AiNotConfiguredError extends Error {}

/**
 * Gathers a compact text summary of an athlete's recent training data — weekly
 * load (tonnage/KPSH/fatigue index) and per-tracked-exercise progress — for
 * feeding to the AI recommendation prompt. Deliberately text, not raw JSON:
 * keeps the prompt small and lets the model reason over a report a coach
 * would actually read, rather than a data dump.
 */
export async function buildAthleteSummary(athleteId: string): Promise<{
  athleteName: string
  summary: string
} | null> {
  const athlete = await prisma.athleteProfile.findUnique({
    where: { id: athleteId },
    include: { user: { select: { name: true, email: true } } },
  })
  if (!athlete) return null

  const rpeTable = await getRpeTable()
  const weeklyLoad = await getWeeklyLoadDistribution(athleteId, rpeTable)
  const recentWeeks = weeklyLoad.slice(-8) // last 8 microcycles, chronological

  const trackedExercises = await prisma.athlete1RM.findMany({
    where: { athleteId },
    include: { exercise: true },
    orderBy: { exercise: { name: 'asc' } },
  })

  const lines: string[] = []

  lines.push('Нагрузка по неделям (последние до 8 микроциклов, в хронологическом порядке):')
  if (recentWeeks.length === 0) {
    lines.push('(нет данных — тренировок ещё не было)')
  } else {
    for (const w of recentWeeks) {
      lines.push(
        `- ${w.cycleName}, неделя ${w.weekNumber}: тоннаж ${w.tonnage} кг, КПШ ${w.kpsh}, ` +
          `сред.вес ${w.avgWeight} кг, КО ${w.loadCoefficient}, индекс усталости ` +
          `${w.fatigueIndex ?? '—'}`
      )
    }
  }

  lines.push('')
  lines.push('Прогресс по упражнениям с заданным 1ПМ:')
  if (trackedExercises.length === 0) {
    lines.push('(1ПМ ни по одному упражнению не задан)')
  } else {
    for (const rm of trackedExercises) {
      const progress = await getExerciseProgress(athleteId, rm.exerciseId)
      const recent = progress.slice(-6)
      lines.push(`- ${rm.exercise.name}: текущий 1ПМ ${rm.value} кг`)
      if (recent.length === 0) {
        lines.push('  (данных по подходам ещё нет)')
      } else {
        const points = recent
          .map((p) => `${p.date}: топ-сет ${p.weight} кг (расч. 1ПМ ${p.estimated1rm} кг)`)
          .join('; ')
        lines.push(`  ${points}`)
      }
    }
  }

  return {
    athleteName: athleteDisplayName(athlete),
    summary: lines.join('\n'),
  }
}

const SYSTEM_PROMPT = `Ты — ассистент тренера по пауэрлифтингу. Тебе дают сводку тренировочных данных
одного атлета: тоннаж/КПШ/индекс усталости (ИУ, аналог RPE — среднее по рабочим подходам,
шкала 1-10, чем выше тем тяжелее) по неделям и прогресс расчётного 1ПМ по упражнениям.

Дай короткие практические рекомендации тренеру на русском языке:
- заметные тренды (рост/стагнация/спад тоннажа или расчётного 1ПМ, рост ИУ быстрее
  прогресса в весах — признак накопления усталости без результата);
- 2-4 конкретных предложения по корректировке следующего микроцикла (например: снизить
  интенсивность/объём, разгрузочная неделя, увеличить веса, добавить подсобку) — с кратким
  обоснованием по данным;
- если данных мало (меньше 2-3 недель), явно скажи это и не делай далеко идущих выводов.

Не выдумывай цифры, которых нет в сводке. Отвечай текстом, без markdown-таблиц, разумной
длины (примерно 150-250 слов).`

/**
 * Calls the Gemini API to generate coaching recommendations from an athlete's
 * recent data. Throws AiNotConfiguredError if GEMINI_API_KEY isn't set —
 * callers should catch that specifically and show a clear setup message
 * instead of a generic error.
 */
export async function getAiInsights(athleteId: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new AiNotConfiguredError(
      'GEMINI_API_KEY не задан в .env — AI-рекомендации недоступны, пока ключ не добавлен.'
    )
  }

  const data = await buildAthleteSummary(athleteId)
  if (!data) throw new Error('Атлет не найден')

  const client = new GoogleGenAI({ apiKey })

  const response = await client.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [{ text: `Атлет: ${data.athleteName}\n\n${data.summary}` }],
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      maxOutputTokens: 1024,
      temperature: 0.4,
    },
  })

  return response.text?.trim() ?? ''
}
