// Draws the annotations into pixels for the inline picture. Labels have no font
// here, so each labelled shape gets a numbered marker and the caption lists the
// labels by number.
import { anchorOf, type Placed, type Point } from './geometry.ts'
import type { Bitmap } from './png.ts'

type Color = readonly [number, number, number]

const RED: Color = [230, 40, 40]
const WHITE: Color = [255, 255, 255]

// 3x5 glyphs, one row per 3-bit number, top row first.
const DIGITS = [
  [7, 5, 5, 5, 7], [2, 6, 2, 2, 7], [7, 1, 7, 4, 7], [7, 1, 7, 1, 7], [5, 5, 7, 1, 1],
  [7, 4, 7, 1, 7], [7, 4, 7, 5, 7], [7, 1, 1, 1, 1], [7, 5, 7, 5, 7], [7, 5, 7, 1, 7],
]

const paint = (img: Bitmap, x: number, y: number, color: Color) => {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return
  const o = (y * img.width + x) * 4
  img.rgba[o] = color[0]
  img.rgba[o + 1] = color[1]
  img.rgba[o + 2] = color[2]
  img.rgba[o + 3] = 255
}

/** Every pixel within `radius` of the segment a→b. */
const segment = (img: Bitmap, a: Point, b: Point, radius: number, color: Color) => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy || 1
  const left = Math.floor(Math.min(a.x, b.x) - radius)
  const right = Math.ceil(Math.max(a.x, b.x) + radius)
  const top = Math.floor(Math.min(a.y, b.y) - radius)
  const bottom = Math.ceil(Math.max(a.y, b.y) + radius)
  for (let y = Math.max(0, top); y <= Math.min(img.height - 1, bottom); y++) {
    for (let x = Math.max(0, left); x <= Math.min(img.width - 1, right); x++) {
      const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared))
      const ex = x - (a.x + t * dx)
      const ey = y - (a.y + t * dy)
      if (ex * ex + ey * ey <= radius * radius) paint(img, x, y, color)
    }
  }
}

const triangle = (img: Bitmap, p: readonly Point[], grow: number, color: Color) => {
  const cx = (p[0].x + p[1].x + p[2].x) / 3
  const cy = (p[0].y + p[1].y + p[2].y) / 3
  const q = p.map(v => {
    const d = Math.hypot(v.x - cx, v.y - cy) || 1
    return { x: v.x + ((v.x - cx) / d) * grow, y: v.y + ((v.y - cy) / d) * grow }
  })
  const edge = (a: Point, b: Point, x: number, y: number) => (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)
  const area = edge(q[0], q[1], q[2].x, q[2].y)
  for (let y = Math.floor(Math.min(...q.map(v => v.y))); y <= Math.ceil(Math.max(...q.map(v => v.y))); y++) {
    for (let x = Math.floor(Math.min(...q.map(v => v.x))); x <= Math.ceil(Math.max(...q.map(v => v.x))); x++) {
      const w0 = edge(q[1], q[2], x, y)
      const w1 = edge(q[2], q[0], x, y)
      const w2 = edge(q[0], q[1], x, y)
      const isInside = area > 0 ? w0 >= 0 && w1 >= 0 && w2 >= 0 : w0 <= 0 && w1 <= 0 && w2 <= 0
      if (isInside) paint(img, x, y, color)
    }
  }
}

const disc = (img: Bitmap, c: Point, radius: number, color: Color) => segment(img, c, c, radius, color)

const marker = (img: Bitmap, at: Point, number: number, radius: number) => {
  const c = {
    x: Math.min(img.width - radius - 1, Math.max(radius + 1, at.x)),
    y: Math.min(img.height - radius - 1, Math.max(radius + 1, at.y)),
  }
  disc(img, c, radius + Math.max(1, radius / 6), WHITE)
  disc(img, c, radius, RED)
  const digits = String(number).split('').map(Number)
  const cell = Math.max(1, Math.floor((radius * 1.1) / 5))
  const width = digits.length * 4 * cell - cell
  let x0 = Math.round(c.x - width / 2)
  const y0 = Math.round(c.y - (5 * cell) / 2)
  for (const d of digits) {
    DIGITS[d].forEach((bits, row) => {
      for (let col = 0; col < 3; col++) {
        if (!(bits & (4 >> col))) continue
        for (let yy = 0; yy < cell; yy++) for (let xx = 0; xx < cell; xx++) {
          paint(img, x0 + col * cell + xx, y0 + row * cell + yy, WHITE)
        }
      }
    })
    x0 += 4 * cell
  }
}

export const drawAnnotations = (img: Bitmap, shapes: readonly Placed[]) => {
  const stroke = Math.max(1.5, Math.min(img.width, img.height) * 0.0035)
  const halo = Math.max(1, stroke * 0.6)
  const markerRadius = Math.max(9, Math.round(Math.min(img.width, img.height) * 0.022))
  for (const color of [WHITE, RED]) {
    const r = color === WHITE ? stroke + halo : stroke
    for (const s of shapes) {
      if (s.kind === 'box') {
        const { x, y, width, height } = s.rect
        const corners = [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }]
        corners.forEach((p, i) => segment(img, p, corners[(i + 1) % 4], r, color))
      } else {
        const dx = s.to.x - s.from.x
        const dy = s.to.y - s.from.y
        const length = Math.hypot(dx, dy) || 1
        const head = Math.min(length * 0.6, stroke * 6)
        const ux = dx / length
        const uy = dy / length
        const base = { x: s.to.x - ux * head, y: s.to.y - uy * head }
        segment(img, s.from, base, r, color)
        const wing = head * 0.55
        triangle(img, [s.to, { x: base.x - uy * wing, y: base.y + ux * wing }, { x: base.x + uy * wing, y: base.y - ux * wing }], color === WHITE ? halo : 0, color)
      }
    }
  }
  for (const s of shapes) if (s.number !== undefined) marker(img, anchorOf(s), s.number, markerRadius)
}
