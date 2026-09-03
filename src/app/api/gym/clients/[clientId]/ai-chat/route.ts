import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { prisma } from '@/lib/prisma'
import { requireCoach } from '@/lib/session'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'

export async function POST(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const coach = await requireCoach()
  const { clientId } = await params
  await assertGymClientBelongsToCoach(clientId, coach.id)
  const body = await req.json() as { messages?: { role: 'user' | 'assistant'; content: string }[]; model?: string; consent?: boolean }
  if (body.consent !== true) return NextResponse.json({ error: 'Нужно подтвердить согласие клиента на AI-анализ данных здоровья' }, { status: 400 })
  const messages = (body.messages ?? []).filter((message) => message.role === 'user' || message.role === 'assistant').slice(-12)
  if (!messages.length) return NextResponse.json({ error: 'Добавьте сообщение для AI' }, { status: 400 })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY не настроен' }, { status: 501 })

  const client = await prisma.gymClient.findUnique({
    where: { id: clientId },
    include: {
      healthProfile: true,
      plans: { take: 3, orderBy: { createdAt: 'desc' }, include: { weeksData: { include: { workouts: { include: { entries: { include: { exercise: true, sets: true } } } } } } } },
    },
  })
  if (!client) return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 })

  const ai = new GoogleGenAI({ apiKey })
  const context = JSON.stringify({
    client: client.displayName,
    health: client.healthProfile,
    plans: client.plans.map((plan) => ({ name: plan.name, weeks: plan.weeks, weeksData: plan.weeksData })),
  })
  const response = await ai.models.generateContent({
    model: body.model ?? process.env.GEMINI_MODEL ?? 'gemini-3.7-flash',
    contents: `Ты помощник тренера тренажёрного зала. Не ставь медицинских диагнозов; учитывай противопоказания и советуй обратиться к врачу, если это требуется. Контекст клиента: ${context}\n\nДиалог:\n${messages.map((message) => `${message.role}: ${message.content}`).join('\n')}`,
    config: { maxOutputTokens: 1000, temperature: 0.3 },
  })
  return NextResponse.json({ text: response.text?.trim() ?? '' })
}
