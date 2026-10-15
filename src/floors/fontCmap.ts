import { inflateSync } from 'node:zlib'

function u16(buf: Uint8Array, offset: number): number {
  return (buf[offset]! << 8) | buf[offset + 1]!
}

function u32(buf: Uint8Array, offset: number): number {
  return ((buf[offset]! << 24) | (buf[offset + 1]! << 16) | (buf[offset + 2]! << 8) | buf[offset + 3]!) >>> 0
}

function readTag(buf: Uint8Array, offset: number): string {
  return String.fromCharCode(buf[offset]!, buf[offset + 1]!, buf[offset + 2]!, buf[offset + 3]!)
}

function inflateTable(data: Uint8Array, origLength: number): Uint8Array {
  if (data.length >= origLength) return data.subarray(0, origLength)
  const raw = inflateSync(data)
  return raw.length === origLength ? raw : raw.subarray(0, origLength)
}

function collectFormat4(cmap: Uint8Array, offset: number, chars: Set<string>) {
  const segCount = u16(cmap, offset + 6) / 2
  const endCodes = offset + 14
  const startCodes = endCodes + 2 + segCount * 2
  const idDeltas = startCodes + segCount * 2
  const idRangeOffsets = idDeltas + segCount * 2
  for (let i = 0; i < segCount; i += 1) {
    const start = u16(cmap, startCodes + i * 2)
    const end = u16(cmap, endCodes + i * 2)
    const delta = u16(cmap, idDeltas + i * 2)
    const rangeOffset = u16(cmap, idRangeOffsets + i * 2)
    for (let code = start; code <= end; code += 1) {
      let glyph = 0
      if (rangeOffset === 0) glyph = (code + delta) & 0xffff
      else {
        const glyphOffset = idRangeOffsets + i * 2 + rangeOffset + (code - start) * 2
        const glyphId = u16(cmap, glyphOffset)
        glyph = glyphId === 0 ? 0 : (glyphId + delta) & 0xffff
      }
      if (glyph !== 0 && code !== 0xffff) chars.add(String.fromCodePoint(code))
    }
  }
}

function collectFormat12(cmap: Uint8Array, offset: number, chars: Set<string>) {
  const nGroups = u32(cmap, offset + 12)
  let cursor = offset + 16
  for (let i = 0; i < nGroups; i += 1) {
    const start = u32(cmap, cursor)
    const end = u32(cmap, cursor + 4)
    cursor += 12
    for (let code = start; code <= end; code += 1) chars.add(String.fromCodePoint(code))
  }
}

/** 从仓库里的 Noto Sans SC 子集 woff 读 cmap，不手写字表。 */
export function readWoffCmapChars(bytes: Uint8Array): Set<string> {
  if (readTag(bytes, 0) !== 'wOFF') throw new Error('not a wOFF font')
  const numTables = u16(bytes, 12)
  let cmap: Uint8Array | null = null
  for (let i = 0; i < numTables; i += 1) {
    const entry = 44 + i * 20
    if (readTag(bytes, entry) !== 'cmap') continue
    const tableOffset = u32(bytes, entry + 4)
    const compLength = u32(bytes, entry + 8)
    const origLength = u32(bytes, entry + 12)
    cmap = inflateTable(bytes.subarray(tableOffset, tableOffset + compLength), origLength)
    break
  }
  if (!cmap) throw new Error('woff missing cmap')

  const chars = new Set<string>()
  const numSubtables = u16(cmap, 2)
  for (let i = 0; i < numSubtables; i += 1) {
    const rec = 4 + i * 8
    const subOffset = u32(cmap, rec + 4)
    const format = u16(cmap, subOffset)
    if (format === 4) collectFormat4(cmap, subOffset, chars)
    else if (format === 12) collectFormat12(cmap, subOffset, chars)
  }
  return chars
}
