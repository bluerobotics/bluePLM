import { describe, expect, it } from 'vitest'
import { withDownloadName } from './browserDownload'

describe('withDownloadName', () => {
  const signed = 'https://x.supabase.co/storage/v1/object/sign/vault/org/abc?token=t.k.n'

  it('appends the name as one encoded query parameter', () => {
    const url = new URL(withDownloadName(signed, 'A&B #2 +rev?.SLDPRT'))
    expect(url.searchParams.get('token')).toBe('t.k.n')
    expect(url.searchParams.get('download')).toBe('A&B #2 +rev?.SLDPRT')
    expect(url.hash).toBe('')
    expect([...url.searchParams.keys()]).toEqual(['token', 'download'])
  })

  it('starts the query when the URL has none', () => {
    expect(withDownloadName('https://h/p', 'a b.pdf')).toBe('https://h/p?download=a%20b.pdf')
  })
})
