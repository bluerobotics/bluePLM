// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { findSettingElement, normalizeSettingText } from './revealSetting'

function render(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  return root
}

describe('normalizeSettingText', () => {
  it('collapses whitespace and drops a trailing colon or asterisk', () => {
    expect(normalizeSettingText('  Max file size:  ')).toBe('max file size')
    expect(normalizeSettingText('Payload URL *')).toBe('payload url')
  })
})

describe('findSettingElement', () => {
  it('returns the deepest element whose text is the label', () => {
    const root = render(
      '<section><h2>Appearance</h2><div><div><span>Dark</span></div><div>Light</div></div></section>',
    )
    expect(findSettingElement(root, 'Dark')?.tagName).toBe('SPAN')
    expect(findSettingElement(root, 'Appearance')?.tagName).toBe('H2')
  })

  it('accepts a label followed by a short badge', () => {
    const root = render('<div><label>Skip large files <em>Beta</em></label><p>Other</p></div>')
    expect(findSettingElement(root, 'Skip large files')?.tagName).toBe('LABEL')
  })

  it('does not match a label buried in a long paragraph', () => {
    const root = render(
      '<p>Dark is one of the themes you can pick, along with several others listed below here.</p>',
    )
    expect(findSettingElement(root, 'Dark')).toBeNull()
  })
})
