/**
 * The size of every collection in a state object: arrays, Maps and Sets by their length, plain
 * records by their key count. Functions and scalars are skipped. Used by the health monitor's
 * heap diagnostic and by the soak, which samples the store this way so a slice that starts to
 * grow shows up without anyone listing it first.
 */
export function collectionSizes(state: object, prefix = ''): Record<string, number> {
  const sizes: Record<string, number> = {}
  for (const [key, value] of Object.entries(state)) {
    if (value === null || typeof value !== 'object') continue
    const name = prefix + key
    if (Array.isArray(value)) sizes[name] = value.length
    else if (value instanceof Map || value instanceof Set) sizes[name] = value.size
    else if (Object.getPrototypeOf(value) === Object.prototype) sizes[name] = Object.keys(value).length
  }
  return sizes
}
