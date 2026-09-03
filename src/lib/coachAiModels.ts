export const COACH_AI_MODELS = [
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    description: 'Основной выбор: быстро анализирует тренировки и составляет обычные планы.',
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    description: 'Для быстрых и несложных задач, а также как запасной вариант при лимите 3.7 Flash.',
  },
  {
    id: 'gemini-3.1-pro',
    name: 'Gemini 3.1 Pro',
    description: 'Для сложного разбора длинной истории и проектирования мезоцикла; обычно медленнее и дороже.',
  },
] as const

export type CoachAiModel = (typeof COACH_AI_MODELS)[number]['id']

export const DEFAULT_COACH_AI_MODEL: CoachAiModel = 'gemini-3.7-flash'

export function isCoachAiModel(value: unknown): value is CoachAiModel {
  return COACH_AI_MODELS.some((model) => model.id === value)
}
