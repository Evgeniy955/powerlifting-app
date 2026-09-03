import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach } from '@/lib/session'
export async function POST(req:Request){await requireCoach();const b=await req.json() as {name?:string;category?:string};const name=b.name?.trim();if(!name)return NextResponse.json({error:'Название обязательно'},{status:400});try{return NextResponse.json(await prisma.gymExerciseCatalog.create({data:{name,category:b.category?.trim()||null}}),{status:201})}catch{return NextResponse.json({error:'Такое упражнение уже есть'},{status:409})}}
