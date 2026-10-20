import type { EngineInterface, Register } from 'claude-code'
import { cropRect, place, type Annotation, type Rect } from './geometry.ts'
import { crop, decodePng, encodePng, shrink, UnsupportedImage } from './png.ts'
import { drawAnnotations } from './raster.ts'
import { buildSvg } from './svg.ts'

const TOOL = 'mcp__inline-images__show'

// The inline picture is at most 255 terminal cells wide; 1280 pixels is sharper
// than that and keeps the PNG under the 2 MiB an Image accepts.
const INLINE_MAX = { width: 1280, height: 1600 }
const IMAGE_MAX_BYTES = 2 * 1024 * 1024

// A terminal cell is about twice as tall as it is wide.
const CELL_ASPECT = 2
const MAX_ROWS = 40
const MAX_COLUMNS = 120

// Drawn instead of the picture where the terminal cannot show one, right
// above the caption, so it says what to do rather than repeating the caption.
const NO_PICTURE = "This terminal can't show the picture; open the link below to see it."

type ShowInput = {
  path: string
  crop?: Rect
  annotations?: Annotation[]
  caption?: string
}

/** What the tool leaves beside its files for the transcript row to draw from. */
type Shown = {
  svgPath: string
  caption?: string
  legend: string[]
  inline: { width: number; height: number }
}

const DESCRIPTION = `Show an image to the person, inline in the conversation. It is the way to show them any image you want them to look at: a screenshot, a frame you extracted from a video, a diagram, an asset you made. With only a path it shows the whole image; crop it and add boxes and arrows when you are pointing at something in it.

The image must be a PNG file. Every coordinate is a fraction of the ORIGINAL image (x: 0 left edge, 1 right edge; y: 0 top, 1 bottom), whatever size you viewed it at. A box is its top-left corner plus width and height; an arrow points from "from" to "to", so put "to" on the thing you mean. Give a short label to what you name; labelled shapes are numbered in the picture and listed in the caption.

The person sees the picture inline where their terminal can draw images, and always a file:// link to an SVG copy with the labels as text, which opens in an IDE or browser.`

const POINT = {
  type: 'object',
  properties: { x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 } },
  required: ['x', 'y'],
}

const RECT = {
  type: 'object',
  properties: {
    x: { type: 'number', minimum: 0, maximum: 1 },
    y: { type: 'number', minimum: 0, maximum: 1 },
    width: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
    height: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
  },
  required: ['x', 'y', 'width', 'height'],
}

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    path: { type: 'string', description: 'The PNG file, absolute or relative to the working directory.' },
    crop: { ...RECT, description: 'The part of the image to show, in fractions of the original. Omit for the whole image.' },
    annotations: {
      type: 'array',
      items: {
        oneOf: [
          {
            type: 'object',
            properties: { kind: { const: 'box' }, ...RECT.properties, label: { type: 'string' } },
            required: ['kind', 'x', 'y', 'width', 'height'],
          },
          {
            type: 'object',
            properties: { kind: { const: 'arrow' }, from: POINT, to: POINT, label: { type: 'string' } },
            required: ['kind', 'from', 'to'],
          },
        ],
      },
    },
    caption: { type: 'string', description: 'One line shown under the picture.' },
  },
  required: ['path'],
}

const outputDir = async ($: EngineInterface) => {
  const temp = (await $.env.get('TMPDIR')) ?? (await $.env.get('TEMP')) ?? '/tmp'
  return `${temp.replace(/[\\/]+$/, '')}/claude-inline-images`
}

// Spelled out in full as visible text: some terminals (JetBrains) make only a
// literal file:// URL clickable, not an OSC 8 link or a bare path.
const fileUrl = (path: string) => {
  const slashed = path.replace(/\\/g, '/')
  return `file://${slashed.startsWith('/') ? '' : '/'}${encodeURI(slashed)}`
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({ name: 'show', description: DESCRIPTION, inputSchema: INPUT_SCHEMA, isDeferred: false })
    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const input = e as unknown as ShowInput & { tool_use_id: string }
    const file = await $.fs.read(input.path, { as: 'bytes' }).catch((error: unknown) => reason(error))
    if (typeof file === 'string') {
      return { deny: `Could not read ${input.path}: ${file}. A file over 4 MiB cannot be read; shrink the image first.` }
    }
    let source
    try {
      source = decodePng(Uint8Array.fromBase64(file.base64))
    } catch (error) {
      if (!(error instanceof UnsupportedImage)) throw error
      return { deny: `Cannot show ${input.path}: ${error.message}. Convert it to an 8-bit PNG first.` }
    }

    const annotations = input.annotations ?? []
    const view = cropRect(input.crop, source.width, source.height)
    const cropped = crop(source, view.x, view.y, view.width, view.height)
    let scale = Math.min(1, INLINE_MAX.width / view.width, INLINE_MAX.height / view.height)
    let png: Uint8Array
    let inline
    do {
      inline = shrink(cropped, Math.max(1, Math.round(view.width * scale)), Math.max(1, Math.round(view.height * scale)))
      if (inline === cropped) inline = { ...cropped, rgba: cropped.rgba.slice() }
      drawAnnotations(inline, place(annotations, source, view, scale))
      png = encodePng(inline)
      scale *= 0.75
    } while (png.length > IMAGE_MAX_BYTES)

    const svg = buildSvg({
      pngBase64: file.base64,
      source,
      view,
      shapes: place(annotations, source, { x: 0, y: 0, width: source.width, height: source.height }, 1),
    })

    const dir = await outputDir($)
    const svgPath = `${dir}/${input.tool_use_id}.svg`
    const legend = annotations.flatMap(a => (a.label ? [a.label] : [])).map((label, i) => `${i + 1}  ${label}`)
    const shown: Shown = { svgPath, caption: input.caption, legend, inline: { width: inline.width, height: inline.height } }
    await $.fs.write(svgPath, svg)
    await $.fs.write(`${dir}/${input.tool_use_id}.png.b64`, png.toBase64())
    await $.fs.write(`${dir}/${input.tool_use_id}.json`, JSON.stringify(shown))

    const cropNote = input.crop ? `, cropped to ${view.width}x${view.height} at (${view.x}, ${view.y})` : ''
    return {
      result: `Shown to the person inline (${source.width}x${source.height}${cropNote}, ${annotations.length} annotation(s)). SVG copy with text labels: ${svgPath}`,
    }
  }).catch(($, e, next) => ({
    deny: `inline-images could not show the image (${next.error.kind}${next.error.message ? `: ${next.error.message}` : ''}).`,
  }))

  on('ui.render', { component: 'ToolResult', props: { tool: TOOL } }, async ($, e, next) => {
    if (e.props.isErrored || e.props.isExpanded) return next(e)
    const dir = await outputDir($)
    const id = e.props.tool_use_id
    const shown = await $.fs
      .read(`${dir}/${id}.json`)
      .then(text => JSON.parse(text) as Shown)
      .catch(() => undefined)
    if (!shown) return next(e)

    const url = fileUrl(shown.svgPath)
    const lines = [...(shown.caption ? [shown.caption] : []), ...shown.legend]

    if (e.surface === 'terminal') {
      const { Box, Text, Link, Image } = $.ui.resolve(e)
      const png = await $.fs.read(`${dir}/${id}.png.b64`).catch(() => undefined)
      const { width, height } = shown.inline
      let columns = Math.min(MAX_COLUMNS, Math.max(10, (e.viewport?.columns ?? 80) - 4), width)
      let rows = Math.max(1, Math.round((columns * height) / width / CELL_ASPECT))
      if (rows > MAX_ROWS) {
        rows = MAX_ROWS
        columns = Math.max(1, Math.round((rows * CELL_ASPECT * width) / height))
      }
      return (
        <Box flexDirection="column">
          {png ? <Image source={{ png }} columns={columns} rows={rows} alt={NO_PICTURE} /> : null}
          {lines.map(line => (
            <Text>{line}</Text>
          ))}
          <Link href={url} label={url} />
        </Box>
      )
    }

    // A remote surface links only to https: and cannot open this machine's
    // files, so the path is there to copy.
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {lines.map(line => (
          <Text>{line}</Text>
        ))}
        <Text dimColor>{shown.svgPath}</Text>
      </Box>
    )
  })
}
