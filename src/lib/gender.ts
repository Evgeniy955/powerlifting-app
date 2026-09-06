// Guesses grammatical gender from a Russian first name, purely for wording
// (e.g. "Подопечный" vs "Подопечная") — never for anything that matters
// functionally, so a wrong guess is just a slightly odd label, not a bug.
//
// Heuristic: Russian first names overwhelmingly follow "ends in а/я -> female,
// otherwise -> male" (Мария, Ольга, Татьяна vs Иван, Пётр, Сергей). The
// exceptions are a short, closed list of male names that also end in а/я
// (Никита, Илья, Кузьма, Фома, Лука, Савва and their common diminutives) —
// checked first so they don't get misread as female.
export type Gender = 'male' | 'female'

const MALE_NAMES_ENDING_IN_A_OR_YA = new Set([
  'никита', 'илья', 'кузьма', 'фома', 'лука', 'савва',
  // common short/diminutive forms that show up as a standalone display name
  'ilya', 'nikita',
])

function firstToken(name: string): string {
  return name.trim().split(/\s+/)[0] ?? ''
}

export function guessGender(name: string | null | undefined): Gender {
  const first = firstToken(name ?? '').toLowerCase()
  if (!first) return 'male'
  if (MALE_NAMES_ENDING_IN_A_OR_YA.has(first)) return 'male'
  const lastChar = first[first.length - 1]
  return lastChar === 'а' || lastChar === 'я' ? 'female' : 'male'
}

type WardCase = 'nominative' | 'accusative'

const WARD_FORMS: Record<Gender, Record<WardCase, string>> = {
  male: { nominative: 'Подопечный', accusative: 'подопечного' },
  female: { nominative: 'Подопечная', accusative: 'подопечную' },
}

// "Подопечный"/"Подопечная" (nominative, capitalized — for labels/buttons)
// or "подопечного"/"подопечную" (accusative, lowercase — for "приглашает вас
// как ...", "профиль ..."). Pass the person's name (or null/undefined when
// there isn't one yet, e.g. an empty "new client" form) to pick the gender;
// defaults to the masculine form when it can't guess.
export function wardNoun(name: string | null | undefined, wardCase: WardCase = 'nominative'): string {
  return WARD_FORMS[guessGender(name)][wardCase]
}
