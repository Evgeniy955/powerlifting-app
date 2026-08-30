import Anthropic from '@anthropic-ai/sdk'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { COACH_AGENT_PROMPT } from './coachAgentPrompt'

export class CoachAiNotConfiguredError extends Error {}

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
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new CoachAiNotConfiguredError()

  let methodology: string
  try {
    methodology = await getMethodology()
  } catch {
    throw new Error('Методология для AI-тренера недоступна.')
  }

  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
    max_tokens: 1600,
    system: `${COACH_AGENT_PROMPT}

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
${methodology}`,
    messages,
  })

  const text = message.content.find((block) => block.type === 'text')
  return text?.type === 'text' ? text.text : 'Не удалось сформировать ответ.'
}
