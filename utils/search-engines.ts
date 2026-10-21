import { z } from 'zod'

export const MAX_SEARCH_ENGINES = 10
export type SearchEngine = { id: string; name: string; url: string; enabled: boolean }
export type EngineError =
  | 'engineNameRequired'
  | 'engineNameDuplicate'
  | 'engineUrlInvalid'
  | 'enginePlaceholderMissing'
  | 'enginePlaceholderHost'
  | 'engineCredentials'

export function validateSearchTemplate(template: string): EngineError | undefined {
  const value = template.trim()
  if (!/^https?:\/\//i.test(value) || [...value].some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127))
    return 'engineUrlInvalid'
  try {
    const url = new URL(value.replaceAll('%s', 'nexttab-query'))
    if (!['http:', 'https:'].includes(url.protocol)) return 'engineUrlInvalid'
    if (url.username || url.password) return 'engineCredentials'
    if (!value.includes('%s')) return 'enginePlaceholderMissing'
    const alternate = new URL(value.replaceAll('%s', 'nexttab-query-alternate'))
    if (url.origin !== alternate.origin) return 'enginePlaceholderHost'
  } catch {
    return 'engineUrlInvalid'
  }
  return undefined
}

export function validateEngineInput(
  input: { name: string; url: string },
  engines: SearchEngine[],
  id?: string,
): { name?: EngineError; url?: EngineError } {
  const name = input.name.trim()
  return {
    name:
      !name || name.length > 40
        ? 'engineNameRequired'
        : engines.some(
              engine => engine.id !== id && engine.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
            )
          ? 'engineNameDuplicate'
          : undefined,
    url: validateSearchTemplate(input.url),
  }
}

export const searchEngineSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(40),
  url: z
    .string()
    .trim()
    .refine(value => !validateSearchTemplate(value)),
  enabled: z.boolean(),
})

export const searchEnginesSchema = z
  .array(searchEngineSchema)
  .max(MAX_SEARCH_ENGINES)
  .superRefine((engines, context) => {
    const ids = new Set<string>()
    const names = new Set<string>()
    engines.forEach((engine, index) => {
      const name = engine.name.toLocaleLowerCase()
      if (ids.has(engine.id) || names.has(name))
        context.addIssue({ code: 'custom', path: [index], message: 'Duplicate engine ID or name' })
      ids.add(engine.id)
      names.add(name)
    })
  })

export function buildSearchUrl(template: string, query: string): string {
  if (validateSearchTemplate(template) || !query.trim()) throw new Error('Invalid search template or empty query')
  return template.trim().replaceAll('%s', encodeURIComponent(query.trim()))
}

export function usableSearchEngines(value: unknown): SearchEngine[] {
  if (!Array.isArray(value)) return []
  return value
    .flatMap(item => {
      const parsed = searchEngineSchema.safeParse(item)
      return parsed.success ? [parsed.data] : []
    })
    .slice(0, MAX_SEARCH_ENGINES)
}
