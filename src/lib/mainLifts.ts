// Classifies exercises into the three competition-lift families (squat /
// bench / deadlift) so the mesocycle analytics exercise picker can be scoped
// to specificity variations of the competition lifts only — not general
// accessory/isolation work. ExerciseCatalog.category isn't precise enough
// for this on its own: it groups leg-accessory work (leg extensions,
// standing bends, RDLs) under "Присед", and arm/shoulder isolation work
// (triceps, biceps, overhead press) under "Жим", because that's how the
// source Excel sheets paged them, not because they're squat/bench variations.

export type MainLift = 'squat' | 'bench' | 'deadlift'

// Exact-name overrides for the seeded catalog (prisma/seed.ts) — take
// priority over the keyword fallback below, since a few names contain a lift
// keyword but are actually isolation accessories (e.g. "Французский жим
// лежа" reads like a bench variation but is a triceps exercise).
const EXACT_OVERRIDES: Record<string, MainLift | null> = {
  'приседание': 'squat',
  'приседание сумо': 'squat',
  'присед фронтальный': 'squat',
  'приседание на лавку': 'squat',
  'наклоны стоя': null,
  'тяга на прямых ногах': null,
  'разгибания ног': null,
  'сгибания ног': null,

  'жим лежа': 'bench',
  'жим на наклонной скамье': 'bench',
  'жим с паузой 2 секунды': 'bench',
  'жим с остановками': 'bench',
  'дожим с 4 см': 'bench',
  'дожим с 6 см': 'bench',
  'дожим с 8 см': 'bench',
  'дожим с 10 см': 'bench',
  'жим в раме (дожим)': 'bench',
  // Dumbbell press variations aren't a competition bench-press specificity
  // variation — excluded from analytics regardless of stance/pause/etc.
  'жим гантелей лежа на гор скамье': null,
  'жим гантелей лежа на накл скамье': null,
  'жим гантелей': null,
  'жим гантелей сидя': null,
  'жим гантелей с паузой': null,
  'жим с цепями (штанга+цепи)': 'bench',
  'жим лежа средним хватом': 'bench',
  'скоростной жим': 'bench',
  'жим лежа узким хватом': 'bench',
  'кроссовер': null,
  'разгиб. с гантелью из-за головы': null,
  'французский жим лежа': null,
  'трицепс на блоке': null,
  'жим стоя': null,
  'подъем штанги перед собой': null,
  'подъем гантели перед собой': null,
  'бицепс с гантелями': null,
  'бицепс стоя со штангой': null,

  'становая тяга': 'deadlift',
  'становая тяга из ямы': 'deadlift',
  'становая тяга с остановками': 'deadlift',
  'становая тяга с плинтов': 'deadlift',
  'становая тяга до колен': 'deadlift',
  'подтягивание': null,
  'тяга верхнего блока к груди': null,
  'тяга нижнего блока к животу': null,
  // Bent-over barbell row and stiff-leg/Romanian deadlift ("мёртвая тяга")
  // are back/posterior-chain accessories, not a deadlift specificity variation.
  'тяга шт': null,
  'тяга штанги': null,
  'тяга штанги в наклоне': null,
  'тяга штанги в наклоне к поясу': null,
  'мертвая тяга': null,
}

// Keywords that mark a name as an accessory/isolation exercise even when it
// also contains a lift keyword (checked before the keyword fallback below) —
// mainly a safety net for custom exercise names a coach might add that
// aren't in the seeded catalog above.
const ACCESSORY_KEYWORDS = /трицепс|бицепс|кроссовер|французск|разгиб\.|подъем\s|стоя|жим\s*ног|блок|подтяг|прямых\s*ног|гантел/i

export function classifyMainLift(exerciseName: string): MainLift | null {
  const key = exerciseName.trim().toLowerCase().replace(/ё/g, 'е')
  if (key in EXACT_OVERRIDES) return EXACT_OVERRIDES[key]

  if (ACCESSORY_KEYWORDS.test(key)) return null

  if (key.includes('присед')) return 'squat'
  // The seeded/imported catalog names deadlift variations "Тяга ...", not
  // "Становая тяга ..." — so this only needs the "тяг" root itself. The
  // ACCESSORY_KEYWORDS check above (блок, подтяг, прямых ног, ...) and the
  // EXACT_OVERRIDES table already strip out bent-over rows, lat pulldowns,
  // pull-ups and RDLs ("тяга на прямых ногах"/"мёртвая тяга"/"тяга штанги в
  // наклоне") before we ever get here.
  if (key.includes('тяг')) return 'deadlift'
  if (key.includes('жим')) return 'bench'

  return null
}

export function isMainLiftVariation(exerciseName: string): boolean {
  return classifyMainLift(exerciseName) !== null
}
