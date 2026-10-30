// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { JoinLinkGate } from './JoinLinkGate'
import { joinLinkFor } from '@/lib/joinLink'
import { generateOrgCode } from '@/lib/supabaseConfig'

const code = generateOrgCode(
  { version: 1, url: 'https://abcdefghijklmnop.supabase.co', anonKey: 'anon-key' },
  'acme',
)

function visit(url: string) {
  const { pathname, hash } = new URL(url)
  window.history.replaceState(null, '', pathname + hash)
}

describe('JoinLinkGate (BluePLM Web, no Electron bridge)', () => {
  afterEach(() => window.history.replaceState(null, '', '/'))

  it('shows where a join link leads and fills in its code, before the app', () => {
    visit(joinLinkFor(code))
    const html = renderToStaticMarkup(
      <JoinLinkGate onConfigured={() => {}}>
        <div>the app</div>
      </JoinLinkGate>,
    )
    expect(html).not.toContain('the app')
    expect(html).toContain('abcdefghijklmnop.supabase.co')
    expect(html).toContain(code)
  })

  it('renders the app untouched on any other address', () => {
    visit(`https://blueplm.io/files#${code}`)
    const html = renderToStaticMarkup(
      <JoinLinkGate onConfigured={() => {}}>
        <div>the app</div>
      </JoinLinkGate>,
    )
    expect(html).toBe('<div>the app</div>')
  })
})
