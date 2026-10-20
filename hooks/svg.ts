// The shareable copy: the original PNG embedded as data, cropped by the
// viewBox, with real vectors and text labels on top. SVG is text, which is all
// a mod can write, and IDEs and browsers open it.
import type { Placed, Rect } from './geometry.ts'

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Without font metrics a label's width is an estimate: bold sans-serif runs at
// about 0.6 of the font size per character in Latin scripts.
const EM_PER_CHARACTER = 0.6

export const buildSvg = (args: {
  pngBase64: string
  source: { width: number; height: number }
  view: Rect
  shapes: readonly Placed[]
}) => {
  const { pngBase64, source, view, shapes } = args
  const size = Math.max(view.width, view.height)
  const stroke = Math.max(2, size * 0.003)
  const font = Math.max(12, size * 0.019)
  const margin = font * 0.5
  const right = view.x + view.width
  const bottom = view.y + view.height

  // The estimate only picks the side a label is aligned to; the renderer
  // measures the text, so an edge-aligned label ends exactly at its edge.
  const text = (shape: Placed) => {
    if (shape.label === undefined || shape.number === undefined) return ''
    const content = `${shape.number}: ${shape.label}`
    const width = content.length * font * EM_PER_CHARACTER
    let start: number
    let y: number
    if (shape.kind === 'box') {
      start = shape.rect.x
      const above = shape.rect.y - stroke * 3
      y = above - font > view.y ? above : shape.rect.y + shape.rect.height + stroke * 3 + font
    } else {
      start = shape.from.x - width / 2
      y = shape.from.y >= shape.to.y ? shape.from.y + font * 1.2 : shape.from.y - font * 0.5
    }
    let anchor = 'start'
    let x = start
    if (start + width > right - margin) {
      anchor = 'end'
      x = shape.kind === 'box' ? Math.min(right - margin, shape.rect.x + shape.rect.width) : right - margin
    } else if (start < view.x + margin) {
      x = view.x + margin
    }
    y = Math.max(view.y + font, Math.min(bottom - margin, y))
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" font-family="sans-serif" font-size="${font.toFixed(1)}" font-weight="bold" fill="#e62828" stroke="#fff" stroke-width="${(font * 0.15).toFixed(1)}" paint-order="stroke">${escape(content)}</text>`
  }

  const shape = (s: Placed) => {
    const common = `fill="none" stroke-linecap="round" stroke-linejoin="round"`
    const draw = (color: string, width: number) =>
      s.kind === 'box'
        ? `<rect x="${s.rect.x.toFixed(1)}" y="${s.rect.y.toFixed(1)}" width="${s.rect.width.toFixed(1)}" height="${s.rect.height.toFixed(1)}" rx="${(stroke * 2).toFixed(1)}" ${common} stroke="${color}" stroke-width="${width.toFixed(1)}"/>`
        : `<line x1="${s.from.x.toFixed(1)}" y1="${s.from.y.toFixed(1)}" x2="${s.to.x.toFixed(1)}" y2="${s.to.y.toFixed(1)}" ${common} stroke="${color}" stroke-width="${width.toFixed(1)}" marker-end="url(#head-${color === '#fff' ? 'halo' : 'red'})"/>`
    return draw('#fff', stroke * 2.2) + draw('#e62828', stroke * 1.4)
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view.x} ${view.y} ${view.width} ${view.height}" width="${view.width}" height="${view.height}">`,
    '<defs>',
    '<marker id="head-red" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#e62828"/></marker>',
    '<marker id="head-halo" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#fff"/></marker>',
    '</defs>',
    `<image href="data:image/png;base64,${pngBase64}" x="0" y="0" width="${source.width}" height="${source.height}"/>`,
    ...shapes.map(shape),
    ...shapes.map(text),
    '</svg>',
    '',
  ].join('\n')
}
