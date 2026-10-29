/**
 * A small markdown reader for class notes. It builds a tree instead of HTML,
 * so nothing a student types can inject markup. Links only allow http, https and mailto.
 */

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'bold'; c: Inline[] }
  | { t: 'italic'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[] }

export type Block =
  | { t: 'h'; level: 1 | 2 | 3; c: Inline[] }
  | { t: 'p'; c: Inline[] }
  | { t: 'ul'; items: { checked?: boolean; c: Inline[] }[] }
  | { t: 'ol'; items: Inline[][] }
  | { t: 'quote'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'hr' }

const INLINE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\b_[^_\s][^_]*_\b)|(\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\))/

export function parseInline(src: string): Inline[] {
  const out: Inline[] = []
  let rest = src
  while (rest.length > 0) {
    const m = INLINE.exec(rest)
    if (!m) {
      out.push({ t: 'text', v: rest })
      break
    }
    if (m.index > 0) out.push({ t: 'text', v: rest.slice(0, m.index) })
    const token = m[0]
    if (m[1]) out.push({ t: 'code', v: token.slice(1, -1) })
    else if (m[2]) out.push({ t: 'bold', c: parseInline(token.slice(2, -2)) })
    else if (m[3] || m[4]) out.push({ t: 'italic', c: parseInline(token.slice(1, -1)) })
    else if (m[5] && m[6] !== undefined && m[7]) {
      out.push({ t: 'link', href: m[7], c: parseInline(m[6]) })
    }
    rest = rest.slice(m.index + token.length)
  }
  return out
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  const isBlockStart = (line: string) =>
    /^(#{1,3})\s/.test(line) ||
    /^```/.test(line) ||
    /^\s*[-*]\s/.test(line) ||
    /^\s*\d+\.\s/.test(line) ||
    /^>\s?/.test(line) ||
    /^(-{3,}|\*{3,})\s*$/.test(line)

  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (line.trim() === '') {
      i++
      continue
    }
    if (/^```/.test(line)) {
      const body: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i] ?? '')) body.push(lines[i++] ?? '')
      i++ // closing fence
      blocks.push({ t: 'code', v: body.join('\n') })
      continue
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    if (h) {
      blocks.push({ t: 'h', level: (h[1]?.length ?? 1) as 1 | 2 | 3, c: parseInline(h[2] ?? '') })
      i++
      continue
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ t: 'hr' })
      i++
      continue
    }
    if (/^\s*[-*]\s/.test(line)) {
      const items: { checked?: boolean; c: Inline[] }[] = []
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i] ?? '')) {
        const text = (lines[i] ?? '').replace(/^\s*[-*]\s+/, '')
        const task = /^\[( |x|X)\]\s+(.*)$/.exec(text)
        items.push(
          task
            ? { checked: task[1] !== ' ', c: parseInline(task[2] ?? '') }
            : { c: parseInline(text) },
        )
        i++
      }
      blocks.push({ t: 'ul', items })
      continue
    }
    if (/^\s*\d+\.\s/.test(line)) {
      const items: Inline[][] = []
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i] ?? '')) {
        items.push(parseInline((lines[i] ?? '').replace(/^\s*\d+\.\s+/, '')))
        i++
      }
      blocks.push({ t: 'ol', items })
      continue
    }
    if (/^>\s?/.test(line)) {
      const body: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i] ?? '')) {
        body.push((lines[i] ?? '').replace(/^>\s?/, ''))
        i++
      }
      blocks.push({ t: 'quote', c: parseInline(body.join(' ')) })
      continue
    }
    const para: string[] = []
    while (i < lines.length && (lines[i] ?? '').trim() !== '' && !isBlockStart(lines[i] ?? '')) {
      para.push(lines[i++] ?? '')
    }
    if (para.length === 0) {
      para.push(line)
      i++
    }
    blocks.push({ t: 'p', c: parseInline(para.join(' ')) })
  }
  return blocks
}

const LIST_MARKER = /^(?:#{1,6}\s+|>\s*|[-*]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+)+/

/** First plain-text line of a note, for list previews. Skips a line that just repeats `title`. */
export function plainPreview(src: string, max = 90, title = ''): string {
  const skip = title.trim().toLowerCase()
  const first = src
    .split('\n')
    .map((l) => l.trim().replace(LIST_MARKER, '').replace(/[*_`]/g, '').trim())
    .find((l) => l.length > 0 && l.toLowerCase() !== skip)
  if (!first) return ''
  return first.length > max ? `${first.slice(0, max - 1)}…` : first
}
