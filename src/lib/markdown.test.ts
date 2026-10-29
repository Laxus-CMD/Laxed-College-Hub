import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown, plainPreview } from './markdown'

describe('parseInline', () => {
  it('reads bold, italic and code', () => {
    expect(parseInline('a **b** *c* `d`')).toEqual([
      { t: 'text', v: 'a ' },
      { t: 'bold', c: [{ t: 'text', v: 'b' }] },
      { t: 'text', v: ' ' },
      { t: 'italic', c: [{ t: 'text', v: 'c' }] },
      { t: 'text', v: ' ' },
      { t: 'code', v: 'd' },
    ])
  })

  it('links http and https only', () => {
    expect(parseInline('[docs](https://example.com/x)')).toEqual([
      { t: 'link', href: 'https://example.com/x', c: [{ t: 'text', v: 'docs' }] },
    ])
    const bad = parseInline('[x](javascript:alert(1))')
    expect(bad.some((n) => n.t === 'link')).toBe(false)
  })

  it('keeps raw HTML as plain text', () => {
    expect(parseInline('<script>alert(1)</script>')).toEqual([
      { t: 'text', v: '<script>alert(1)</script>' },
    ])
  })
})

describe('parseMarkdown', () => {
  it('reads headings, paragraphs and rules', () => {
    const b = parseMarkdown('# Title\n\nSome text\nsame paragraph\n\n---\n\n### Small')
    expect(b.map((x) => x.t)).toEqual(['h', 'p', 'hr', 'h'])
    expect(b[0]).toMatchObject({ t: 'h', level: 1 })
    expect(b[1]).toMatchObject({ t: 'p', c: [{ t: 'text', v: 'Some text same paragraph' }] })
  })

  it('reads lists, checklists and numbered lists', () => {
    const b = parseMarkdown('- one\n- [x] done\n- [ ] todo\n\n1. first\n2. second')
    expect(b[0]).toMatchObject({ t: 'ul' })
    if (b[0]?.t === 'ul') expect(b[0].items.map((i) => i.checked)).toEqual([undefined, true, false])
    if (b[1]?.t === 'ol') expect(b[1].items).toHaveLength(2)
  })

  it('reads fenced code without parsing inside it', () => {
    const b = parseMarkdown('```\n# not a heading\n**nor bold**\n```\nafter')
    expect(b[0]).toEqual({ t: 'code', v: '# not a heading\n**nor bold**' })
    expect(b[1]?.t).toBe('p')
  })

  it('reads quotes and returns nothing for blank input', () => {
    expect(parseMarkdown('> a\n> b')[0]).toMatchObject({ t: 'quote' })
    expect(parseMarkdown('  \n\n')).toEqual([])
  })
})

describe('plainPreview', () => {
  it('strips markdown from the first line', () => {
    expect(plainPreview('## **Limits** and `continuity`\nmore')).toBe('Limits and continuity')
    expect(plainPreview('')).toBe('')
    expect(plainPreview('x'.repeat(200), 10)).toHaveLength(10)
  })

  it('skips a first line that only repeats the title', () => {
    expect(plainPreview('# Limits\n\nEpsilon and delta', 90, 'Limits')).toBe('Epsilon and delta')
    expect(plainPreview('# Limits', 90, 'Limits')).toBe('')
  })
})
