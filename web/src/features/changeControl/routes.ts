// Routes below /eco. ECO ids and deviation ids are UUIDs, so the fixed words cannot collide.
export type ChangeControlRoute =
  | { page: 'ecoList' }
  | { page: 'ecoNew' }
  | { page: 'ecoDetail'; id: string }
  | { page: 'ecoEdit'; id: string }
  | { page: 'deviationList' }
  | { page: 'deviationNew' }
  | { page: 'deviationDetail'; id: string }
  | { page: 'deviationEdit'; id: string }
  | { page: 'notFound' }

export function parseChangeControlRoute(segments: readonly string[]): ChangeControlRoute {
  const [first, second, third, ...rest] = segments
  if (rest.length > 0) return { page: 'notFound' }
  if (first === undefined) return { page: 'ecoList' }
  if (first === 'deviations') {
    if (second === undefined) return { page: 'deviationList' }
    if (second === 'new') return third === undefined ? { page: 'deviationNew' } : { page: 'notFound' }
    if (third === undefined) return { page: 'deviationDetail', id: second }
    if (third === 'edit') return { page: 'deviationEdit', id: second }
    return { page: 'notFound' }
  }
  if (third !== undefined) return { page: 'notFound' }
  if (first === 'new') return second === undefined ? { page: 'ecoNew' } : { page: 'notFound' }
  if (second === undefined) return { page: 'ecoDetail', id: first }
  if (second === 'edit') return { page: 'ecoEdit', id: first }
  return { page: 'notFound' }
}

export const paths = {
  ecoList: () => '/eco',
  ecoNew: () => '/eco/new',
  eco: (id: string) => `/eco/${encodeURIComponent(id)}`,
  ecoEdit: (id: string) => `/eco/${encodeURIComponent(id)}/edit`,
  deviationList: () => '/eco/deviations',
  deviationNew: () => '/eco/deviations/new',
  deviation: (id: string) => `/eco/deviations/${encodeURIComponent(id)}`,
  deviationEdit: (id: string) => `/eco/deviations/${encodeURIComponent(id)}/edit`,
  file: (fileId: string) => `/file/${encodeURIComponent(fileId)}`,
}
