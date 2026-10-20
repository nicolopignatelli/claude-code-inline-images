// PNG decode and encode in plain JavaScript: the hooks runtime has no
// CompressionStream and the mod must not depend on tools installed on the host.
import { unzlibSync, zlibSync } from './lib/fflate.js'

export type Bitmap = { width: number; height: number; rgba: Uint8Array }

export class UnsupportedImage extends Error {}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

const concat = (parts: readonly Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

export const decodePng = (bytes: Uint8Array): Bitmap => {
  const isPng = SIGNATURE.every((b, i) => bytes[i] === b)
  if (!isPng) {
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8
    throw new UnsupportedImage(isJpeg ? 'the file is a JPEG; only PNG is read' : 'the file is not a PNG')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  let palette: Uint8Array | undefined
  let paletteAlpha: Uint8Array | undefined
  const idat: Uint8Array[] = []
  for (let offset = 8; offset + 8 <= bytes.length; ) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    const data = bytes.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8)
      height = view.getUint32(offset + 12)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'PLTE') palette = data
    else if (type === 'tRNS') paletteAlpha = data
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    offset += 12 + length
  }
  const channels = CHANNELS[colorType]
  if (bitDepth !== 8 || channels === undefined || interlace !== 0) {
    throw new UnsupportedImage(`PNG with bit depth ${bitDepth}, color type ${colorType}, interlace ${interlace}; only non-interlaced 8-bit PNG is read`)
  }
  const raw = unzlibSync(concat(idat))
  const stride = width * channels
  const out = new Uint8Array(width * height * 4)
  let prev = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1)
    const filter = raw[start]
    const cur = raw.slice(start + 1, start + 1 + stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0
      const b = prev[i]
      if (filter === 1) cur[i] += a
      else if (filter === 2) cur[i] += b
      else if (filter === 3) cur[i] += (a + b) >> 1
      else if (filter === 4) {
        const c = i >= channels ? prev[i - channels] : 0
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        cur[i] += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      const s = x * channels
      if (colorType === 3) {
        const index = cur[s]
        out[o] = palette?.[index * 3] ?? 0
        out[o + 1] = palette?.[index * 3 + 1] ?? 0
        out[o + 2] = palette?.[index * 3 + 2] ?? 0
        out[o + 3] = paletteAlpha?.[index] ?? 255
      } else if (channels <= 2) {
        out[o] = out[o + 1] = out[o + 2] = cur[s]
        out[o + 3] = channels === 2 ? cur[s + 1] : 255
      } else {
        out[o] = cur[s]
        out[o + 1] = cur[s + 1]
        out[o + 2] = cur[s + 2]
        out[o + 3] = channels === 4 ? cur[s + 3] : 255
      }
    }
    prev = cur
  }
  return { width, height, rgba: out }
}

/** Reads the size from the header alone, without inflating the pixels. */
export const pngSize = (bytes: Uint8Array) => {
  if (!SIGNATURE.every((b, i) => bytes[i] === b)) return undefined
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

const crc32 = (bytes: Uint8Array) => {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const chunk = (type: string, data: Uint8Array) => {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

export const encodePng = ({ width, height, rgba }: Bitmap) => {
  const stride = width * 4
  const raw = new Uint8Array(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1)
    raw[row] = 1
    for (let i = 0; i < stride; i++) {
      raw[row + 1 + i] = rgba[y * stride + i] - (i >= 4 ? rgba[y * stride + i - 4] : 0)
    }
  }
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header.set([8, 6, 0, 0, 0], 8)
  return concat([
    new Uint8Array(SIGNATURE),
    chunk('IHDR', header),
    chunk('IDAT', zlibSync(raw, { level: 6 })),
    chunk('IEND', new Uint8Array()),
  ])
}

export const crop = (src: Bitmap, x: number, y: number, width: number, height: number): Bitmap => {
  const rgba = new Uint8Array(width * height * 4)
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * src.width + x) * 4
    rgba.set(src.rgba.subarray(from, from + width * 4), row * width * 4)
  }
  return { width, height, rgba }
}

/** Shrinks by averaging every source pixel a target pixel covers, so text stays legible. */
export const shrink = (src: Bitmap, width: number, height: number): Bitmap => {
  if (width >= src.width && height >= src.height) return src
  const rgba = new Uint8Array(width * height * 4)
  const sum = new Float64Array(width * 4)
  const count = new Float64Array(width)
  const columnOf = new Uint32Array(src.width).map((_, sx) => Math.min(width - 1, Math.floor((sx * width) / src.width)))
  let sy = 0
  for (let y = 0; y < height; y++) {
    sum.fill(0)
    count.fill(0)
    const end = Math.max(sy + 1, Math.round(((y + 1) * src.height) / height))
    for (; sy < end; sy++) {
      for (let sx = 0; sx < src.width; sx++) {
        const s = (sy * src.width + sx) * 4
        const x = columnOf[sx]
        sum[x * 4] += src.rgba[s]
        sum[x * 4 + 1] += src.rgba[s + 1]
        sum[x * 4 + 2] += src.rgba[s + 2]
        sum[x * 4 + 3] += src.rgba[s + 3]
        count[x]++
      }
    }
    for (let x = 0; x < width; x++) {
      for (let k = 0; k < 4; k++) rgba[(y * width + x) * 4 + k] = Math.round(sum[x * 4 + k] / count[x])
    }
  }
  return { width, height, rgba }
}
