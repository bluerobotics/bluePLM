import { describe, expect, it } from 'vitest'
import * as odoo from './odoo.js'
import { decodeXmlEntities, odooXmlRpc, parseXmlRpcResponse, parseXmlValue, valueToXml } from './odoo.js'

/** Wrap a value payload in a full XML-RPC response envelope. */
function methodResponse(valueXml: string): string {
  return `<?xml version="1.0"?>
<methodResponse><params><param>${valueXml}</param></params></methodResponse>`
}

describe('decodeXmlEntities', () => {
  it('decodes the named entities', () => {
    expect(decodeXmlEntities('Smith &amp; Sons')).toBe('Smith & Sons')
    expect(decodeXmlEntities('&lt;tag&gt;')).toBe('<tag>')
    expect(decodeXmlEntities('&quot;quoted&quot;')).toBe('"quoted"')
    expect(decodeXmlEntities('it&apos;s')).toBe("it's")
  })

  it('decodes numeric entities, decimal and hex', () => {
    expect(decodeXmlEntities('it&#39;s')).toBe("it's")
    expect(decodeXmlEntities('it&#x27;s')).toBe("it's")
    expect(decodeXmlEntities('caf&#233;')).toBe('café')
    expect(decodeXmlEntities('&#x1F600;')).toBe('\u{1F600}')
  })

  it('does not double-decode: &amp;lt; becomes &lt; and not <', () => {
    expect(decodeXmlEntities('&amp;lt;')).toBe('&lt;')
    expect(decodeXmlEntities('&amp;amp;')).toBe('&amp;')
    expect(decodeXmlEntities('&amp;#39;')).toBe('&#39;')
  })

  it('leaves unknown or malformed entities untouched', () => {
    expect(decodeXmlEntities('A &nbsp; B')).toBe('A &nbsp; B')
    expect(decodeXmlEntities('&constructor; &toString;')).toBe('&constructor; &toString;')
    expect(decodeXmlEntities('100% & rising')).toBe('100% & rising')
    expect(decodeXmlEntities('plain text')).toBe('plain text')
  })
})

describe('XML value parsing', () => {
  it('decodes entities in <string> values', () => {
    expect(parseXmlValue('<string>Smith &amp; Sons</string>')).toBe('Smith & Sons')
    expect(parseXmlValue('<string>Ben &amp; Jerry&#39;s</string>')).toBe("Ben & Jerry's")
  })

  it('decodes entities inside structs and arrays', () => {
    const xml =
      '<array><data>' +
      '<value><struct><member><name>name</name>' +
      '<value><string>R&amp;D Ltd</string></value></member></struct></value>' +
      '<value><string>&lt;script&gt;</string></value>' +
      '</data></array>'
    expect(parseXmlValue(xml)).toEqual([{ name: 'R&D Ltd' }, '<script>'])
  })

  it('decodes entities in fault messages', () => {
    const xml =
      '<?xml version="1.0"?><methodResponse><fault><value><struct>' +
      '<member><name>faultString</name><value><string>Object res.partner &amp; friends</string></value></member>' +
      '</struct></value></fault></methodResponse>'
    expect(() => parseXmlRpcResponse(xml)).toThrow('Odoo fault: Object res.partner & friends')
  })

  it('still parses non-string scalars unchanged', () => {
    expect(parseXmlValue('<int>42</int>')).toBe(42)
    expect(parseXmlValue('<boolean>1</boolean>')).toBe(true)
    expect(parseXmlValue('<double>1.5</double>')).toBe(1.5)
  })
})

describe('valueToXml / parse round trip', () => {
  const cases = [
    'Smith & Sons',
    'R&D <Group> "Alpha"',
    "Ben & Jerry's",
    '&lt;',
    '&amp;lt;',
    '100% & rising',
    'plain name',
    'café & crème',
  ]

  for (const original of cases) {
    it(`round trips ${JSON.stringify(original)}`, () => {
      expect(parseXmlRpcResponse(methodResponse(valueToXml(original)))).toBe(original)
    })
  }

  it('round trips a struct of company names', () => {
    const record = { name: 'Smith & Sons', ref: '<A&B>' }
    expect(parseXmlRpcResponse(methodResponse(valueToXml(record)))).toEqual(record)
  })
})

describe('raw XML debug samples (5.0 audit O2)', () => {
  const reply = (body: string) => (() => Promise.resolve(new Response(methodResponse(body)))) as unknown as typeof fetch

  it('go only to the log of the request that made the call', async () => {
    const mine: string[] = []
    const theirs: string[] = []
    await odooXmlRpc('https://a.example', 'common', 'version', [], { fetch: reply('<value><string>org-a</string></value>'), xmlLog: mine })
    await odooXmlRpc('https://b.example', 'common', 'version', [], { fetch: reply('<value><string>org-b</string></value>'), xmlLog: theirs })
    expect(mine.join()).toContain('org-a')
    expect(mine.join()).not.toContain('org-b')
    expect(theirs.join()).not.toContain('org-a')
  })

  it('has no module-wide buffer left to read', () => {
    expect(Object.keys(odoo)).not.toContain('getLastXmlResponses')
  })
})
