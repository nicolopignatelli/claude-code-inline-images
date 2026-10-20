// What the model asks for is in fractions of the original image (0 left/top,
// 1 right/bottom): the model sees images resized, so fractions are the one
// coordinate system that means the same thing to it and to the mod.

export type Point = { x: number; y: number }

export type Annotation =
  | { kind: 'box'; x: number; y: number; width: number; height: number; label?: string }
  | { kind: 'arrow'; from: Point; to: Point; label?: string }

export type Rect = { x: number; y: number; width: number; height: number }

/** A shape in the pixels of one drawing, numbered when it carries a label. */
export type Placed =
  | { kind: 'box'; rect: Rect; number?: number; label?: string }
  | { kind: 'arrow'; from: Point; to: Point; number?: number; label?: string }

const unit = (n: number) => Math.min(1, Math.max(0, n))

/** The crop as whole source pixels, never empty; the whole image without one. */
export const cropRect = (crop: Rect | undefined, width: number, height: number): Rect => {
  if (!crop) return { x: 0, y: 0, width, height }
  const x = Math.min(width - 1, Math.floor(unit(crop.x) * width))
  const y = Math.min(height - 1, Math.floor(unit(crop.y) * height))
  const right = Math.max(x + 1, Math.ceil(unit(crop.x + crop.width) * width))
  const bottom = Math.max(y + 1, Math.ceil(unit(crop.y + crop.height) * height))
  return { x, y, width: right - x, height: bottom - y }
}

/**
 * Maps the annotations into a drawing of the view: `scale` drawing pixels per
 * source pixel, the view's top-left at the drawing's origin.
 */
export const place = (
  annotations: readonly Annotation[],
  source: { width: number; height: number },
  view: Rect,
  scale: number,
): Placed[] => {
  const px = (p: Point): Point => ({
    x: (p.x * source.width - view.x) * scale,
    y: (p.y * source.height - view.y) * scale,
  })
  let next = 1
  return annotations.map(a => {
    const number = a.label ? next++ : undefined
    if (a.kind === 'arrow') return { kind: 'arrow', from: px(a.from), to: px(a.to), number, label: a.label }
    const topLeft = px({ x: a.x, y: a.y })
    const bottomRight = px({ x: a.x + a.width, y: a.y + a.height })
    return {
      kind: 'box',
      rect: { x: topLeft.x, y: topLeft.y, width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y },
      number,
      label: a.label,
    }
  })
}

/** Where a shape's number or label sits: a box's top-left corner, an arrow's tail. */
export const anchorOf = (shape: Placed): Point =>
  shape.kind === 'box' ? { x: shape.rect.x, y: shape.rect.y } : shape.from
