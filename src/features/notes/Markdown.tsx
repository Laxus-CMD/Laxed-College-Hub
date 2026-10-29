import { Fragment, useMemo } from 'react'
import { parseMarkdown, type Inline } from '@/lib/markdown'

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case 'text':
            return <Fragment key={i}>{n.v}</Fragment>
          case 'bold':
            return (
              <strong key={i} className="font-semibold">
                <Inlines nodes={n.c} />
              </strong>
            )
          case 'italic':
            return (
              <em key={i}>
                <Inlines nodes={n.c} />
              </em>
            )
          case 'code':
            return (
              <code key={i} className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[0.9em]">
                {n.v}
              </code>
            )
          case 'link':
            return (
              <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
                <Inlines nodes={n.c} />
              </a>
            )
        }
      })}
    </>
  )
}

const HEADING = {
  1: 'mt-5 mb-2 text-2xl font-semibold tracking-tight first:mt-0',
  2: 'mt-5 mb-2 text-xl font-medium first:mt-0',
  3: 'mt-4 mb-1.5 text-base font-medium first:mt-0',
} as const

/** Renders note text. Built from a parsed tree, so nothing typed into a note can inject markup. */
export function Markdown({ source }: { source: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source])
  if (blocks.length === 0) return <p className="text-muted">Nothing to preview yet.</p>
  return (
    <div className="flex flex-col gap-3 leading-relaxed">
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'h': {
            const Tag = `h${b.level}` as 'h1' | 'h2' | 'h3'
            return (
              <Tag key={i} className={HEADING[b.level]}>
                <Inlines nodes={b.c} />
              </Tag>
            )
          }
          case 'p':
            return (
              <p key={i}>
                <Inlines nodes={b.c} />
              </p>
            )
          case 'ul':
            return (
              <ul key={i} className="flex flex-col gap-1 pl-1">
                {b.items.map((item, j) => (
                  <li key={j} className="flex gap-2.5">
                    {item.checked === undefined ? (
                      <span aria-hidden="true" className="mt-[0.7em] size-1.5 shrink-0 rounded-full bg-muted" />
                    ) : (
                      <input type="checkbox" checked={item.checked} disabled readOnly aria-label={item.checked ? 'Done' : 'Not done'} className="mt-1.5 size-4 shrink-0 accent-accent-fill" />
                    )}
                    <span className={item.checked ? 'text-faint line-through' : ''}>
                      <Inlines nodes={item.c} />
                    </span>
                  </li>
                ))}
              </ul>
            )
          case 'ol':
            return (
              <ol key={i} className="list-decimal pl-6 marker:text-muted">
                {b.items.map((item, j) => (
                  <li key={j} className="pl-1">
                    <Inlines nodes={item} />
                  </li>
                ))}
              </ol>
            )
          case 'quote':
            return (
              <blockquote key={i} className="border-l-2 border-accent pl-3.5 text-muted">
                <Inlines nodes={b.c} />
              </blockquote>
            )
          case 'code':
            return (
              <pre key={i} className="overflow-x-auto rounded-xl bg-canvas p-3.5 font-mono text-[13px] leading-relaxed">
                <code>{b.v}</code>
              </pre>
            )
          case 'hr':
            return <hr key={i} className="border-line" />
        }
      })}
    </div>
  )
}
