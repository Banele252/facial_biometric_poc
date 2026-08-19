import type { ReactNode } from 'react'

// Renders the small Markdown subset the Fraud Assistant is instructed to
// use: **bold**, *italics*, `inline code`, and `- ` bullet lists. Builds
// React elements directly (never dangerouslySetInnerHTML), so there is no
// HTML-injection risk from model output — unrecognised syntax just falls
// through as plain text.

const INLINE_PATTERN = /(\*\*.+?\*\*|__.+?__|`.+?`|\*[^*\s].*?\*|_[^_\s].*?_)/g

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let i = 0

  for (const match of text.matchAll(INLINE_PATTERN)) {
    const token = match[0]
    const index = match.index ?? 0
    if (index > lastIndex) nodes.push(text.slice(lastIndex, index))

    const key = `${keyPrefix}-${i++}`
    if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('`')) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>)
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>)
    }
    lastIndex = index + token.length
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let listItems: string[] = []

  function flushList(key: string) {
    if (!listItems.length) return
    blocks.push(
      <ul key={key}>
        {listItems.map((item, idx) => (
          <li key={idx}>{renderInline(item, `${key}-li-${idx}`)}</li>
        ))}
      </ul>,
    )
    listItems = []
  }

  text.split('\n').forEach((line, idx) => {
    const bullet = /^\s*[-*]\s+(.*)/.exec(line)
    if (bullet) {
      listItems.push(bullet[1])
      return
    }
    flushList(`list-${idx}`)
    if (line.trim() !== '') {
      blocks.push(<p key={`p-${idx}`}>{renderInline(line, `p-${idx}`)}</p>)
    }
  })
  flushList('list-end')

  return <>{blocks}</>
}
