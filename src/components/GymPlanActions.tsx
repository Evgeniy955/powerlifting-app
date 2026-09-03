'use client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'
export function GymPlanActions({ athleteId }: { athleteId: string }) { const router = useRouter(); async function create() { const name = window.prompt('Название плана'); if (!name?.trim()) return; const res = await fetch(`/api/gym/athletes/${athleteId}/plans`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name, weeks:4, startDate:new Date().toISOString()}) }); if (res.ok) router.refresh() } return <Button size="sm" onClick={create}>+ План</Button> }
