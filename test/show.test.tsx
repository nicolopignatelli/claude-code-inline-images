import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { decodePng, encodePng } from '../hooks/png.ts'

const TOOL = 'mcp__inline-images__show'
const DIR = '/tmp/test/claude-inline-images'

const whiteImage = (width: number, height: number) => encodePng({ width, height, rgba: new Uint8Array(width * height * 4).fill(255) })

const pixel = (img: { width: number; rgba: Uint8Array }, x: number, y: number) => {
  const o = (y * img.width + x) * 4
  return [img.rgba[o], img.rgba[o + 1], img.rgba[o + 2]]
}

/** Stands in for the engine beneath the plugin: env, a file system in memory, the tool registry. */
const engine = (on: On, files: Map<string, string>) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.register', () => ({ value: { tool: TOOL } }))
  on('env.get', (_, e) => ({ value: e.name === 'TMPDIR' ? '/tmp/test/' : undefined }))
  on('fs.write', (_, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.read', (_, e) => {
    const content = files.get(e.path)
    if (content === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: e.as === 'bytes' ? { base64: content } : content }
  })
}

test('a cropped, annotated image is written inline and as SVG, and drawn in the transcript', async ($, on) => {
  const files = new Map([['/work/shot.png', whiteImage(400, 200).toBase64()]])
  engine(on, files)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ran = await $.tool.call({
    tool: TOOL,
    path: '/work/shot.png',
    crop: { x: 0.5, y: 0, width: 0.5, height: 1 },
    annotations: [
      { kind: 'box', x: 0.6, y: 0.25, width: 0.2, height: 0.5, label: 'the <button>' },
      { kind: 'arrow', from: { x: 0.95, y: 0.9 }, to: { x: 0.81, y: 0.5 } },
    ],
    caption: 'The button is clipped',
  })
  expect(ran.deny).toBeUndefined()

  const svgPath = [...files.keys()].find(p => p.endsWith('.svg'))
  expect(svgPath?.startsWith(`${DIR}/`)).toBe(true)
  const svg = files.get(svgPath!)!
  expect(svg).toContain('viewBox="200 0 200 200"')
  expect(svg).toContain('1: the &lt;button&gt;')

  const id = svgPath!.slice(DIR.length + 1, -'.svg'.length)
  const inline = decodePng(Uint8Array.fromBase64(files.get(`${DIR}/${id}.png.b64`)!))
  expect([inline.width, inline.height]).toEqual([200, 200])
  // The box's left edge sits at 0.6 of the source, 40 px into the crop.
  expect(pixel(inline, 40, 100)).toEqual([230, 40, 40])
  expect(pixel(inline, 100, 100)).toEqual([255, 255, 255])

  const props = { tool_use_id: id, tool: TOOL, output: '', isErrored: false }
  const terminal = await $.ui.mount({ plugin: 'inline-images', surface: 'terminal', component: 'ToolResult', requestId: id, props })
  const image = await terminal.find({ type: 'Image' })
  expect(image?.props.alt).toBe("This terminal can't show the picture; open the link below to see it.")
  expect(await terminal.find({ type: 'Text', text: '1  the <button>' })).toBeDefined()
  expect((await terminal.find({ type: 'Link' }))?.props.href).toBe(`file://${DIR}/${id}.svg`)
  await terminal.unmount()

  const desktop = await $.ui.mount({ plugin: 'inline-images', surface: 'desktop', component: 'ToolResult', requestId: id, props })
  expect(await desktop.find({ type: 'Image' })).toBeUndefined()
  expect(await desktop.find({ type: 'Text', text: `${DIR}/${id}.svg` })).toBeDefined()
  await desktop.unmount()
})

test('a file that is not a PNG is refused with what to do', async ($, on) => {
  const files = new Map([['/work/photo.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]).toBase64()]])
  engine(on, files)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ran = await $.tool.call({ tool: TOOL, path: '/work/photo.jpg' })
  expect(ran.deny).toContain('JPEG')
  expect(ran.deny).toContain('Convert it to an 8-bit PNG')
})

test('pixels survive an encode and decode unchanged', async () => {
  const width = 300
  const height = 120
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) rgba.set([i % 251, (i * 7) % 253, (i * 13) % 255, 255], i * 4)
  const decoded = decodePng(encodePng({ width, height, rgba }))
  expect(decoded.rgba).toEqual(rgba)
})
