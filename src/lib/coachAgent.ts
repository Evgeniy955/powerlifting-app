import { GoogleGenAI } from '@google/genai'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { COACH_AGENT_PROMPT } from './coachAgentPrompt'

export class GeminiAiNotConfiguredError extends Error {}

export type CoachAiMessage = {
  role: 'user' | 'assistant'
  content: string
}

type Context = {
  athleteName: string
  trainingSummary: string
  cycleName?: string
  cyclePlanSummary?: string
  links: {
    mesocycle: string
    microcycle: string
    workout: string
  }
}

let methodologyPromise: Promise<string> | undefined

function getMethodology(): Promise<string> {
  methodologyPromise ??= readFile(
    join(process.cwd(), 'docs', 'methodology', 'emerging-strategies.md'),
    'utf8'
  )

  return methodologyPromise
}

export async function getCoachAiReply(messages: CoachAiMessage[], context: Context): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new GeminiAiNotConfiguredError()

  let methodology: string
  try {
    methodology = await getMethodology()
  } catch {
    throw new Error('Методология для AI-тренера недоступна.')
  }

  const client = new GoogleGenAI({ apiKey })
  const systemInstruction = `${COACH_AGENT_PROMPT}

Контекст текущего запроса:
Атлет: ${context.athleteName}
${context.cycleName ? `Мезоцикл: ${context.cycleName}` : 'Мезоцикл не выбран.'}
Ссылка на мезоцикл: ${context.links.mesocycle}
Ссылка на микроцикл: ${context.links.microcycle}
Ссылка на тренировочный день: ${context.links.workout}

Фактические данные атлета:
${context.trainingSummary}

${context.cyclePlanSummary ? `План выбранного мезоцикла:\n${context.cyclePlanSummary}\n` : ''}

Методология RTS / Emerging Strategies:
${methodology}`

  const response = await client.models.generateContent({
    model: process.env.GEMINI_MODEL ?? 'gemini-3.7-flash',
    contents: messages.map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    })),
    config: {
      systemInstruction,
      maxOutputTokens: 2400,
      temperature: 0.4,
    },
  })

  const text = response.text?.trim()

  if (text) return text
  const finishReason = response.candidates?.[0]?.finishReason ?? 'unknown'
  throw new Error(`Gemini did not return text (finish reason: ${finishReason})`)
}
