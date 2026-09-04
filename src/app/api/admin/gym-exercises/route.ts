import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, requireUser, apiErrorResponse } from '@/lib/session'
export async function GET(req: Request) { try { await requireUser(); const url = new URL(req.url); const q = url.searchParams.get('q')?.trim() ?? ''; const exercises = await prisma.gymExerciseCatalog.findMany({ where: q ? { name: { contains: q, mode: 'insensitive' } } : undefined, orderBy: { name: 'asc' }, take: 30 }); return NextResponse.json(exercises) } catch (error) { return apiErrorResponse(error) } }
// Get-or-create: a straight unique-constraint failure here almost always
// means a genuine race, not user error — the import review screen's
// exact-match check ran against the catalog as it stood when preview was
// fetched, and another request (a duplicate click, another tab, another
// name in the same import that normalizes the same way) created the same
// row in the meantime. Rather than surface a 409 that aborts the caller's
// whole import, fall back to the now-existing row so the coach never sees
// a failure for something the app should just quietly reuse.
export async function POST(req:Request){await requireCoach();const b=await req.json() as {name?:string;category?:string};const name=b.name?.trim();if(!name)return NextResponse.json({error:'Название обязательно'},{status:400});try{return NextResponse.json(await prisma.gymExerciseCatalog.create({data:{name,category:b.category?.trim()||null}}),{status:201})}catch{const existing=await prisma.gymExerciseCatalog.findFirst({where:{name:{equals:name,mode:'insensitive'}}});if(existing)return NextResponse.json(existing,{status:200});return NextResponse.json({error:'Такое упражнение уже есть'},{status:409})}}
