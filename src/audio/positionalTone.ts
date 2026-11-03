/**
 * T108：给 drei PositionalAudio 的短缓冲。
 * 和提示音同一对频率、同一段时长，不下载音频文件。
 */

import { CUE_DURATION_SEC, FIRST_TONE_HZ, SECOND_TONE_HZ } from './dualTone'

const SAMPLE_RATE = 22050
const AMP = 0.2

function writeText(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index))
}

/** 单声道 16-bit PCM。长度约 240ms。 */
export function encodeCueWav(sampleRate = SAMPLE_RATE): Uint8Array {
  const total = Math.max(1, Math.round(sampleRate * CUE_DURATION_SEC))
  const pcm = new Int16Array(total)
  const attack = Math.max(1, Math.round(sampleRate * 0.012))
  const firstEnd = Math.min(total, Math.round(sampleRate * 0.12))
  const secondStart = Math.min(total, Math.round(sampleRate * 0.1))
  for (let index = 0; index < total; index += 1) {
    const time = index / sampleRate
    let sample = 0
    if (index < firstEnd) {
      const env = index < attack ? index / attack : 1 - (index - attack) / Math.max(1, firstEnd - attack)
      sample += Math.sin(2 * Math.PI * FIRST_TONE_HZ * time) * AMP * Math.max(0, env)
    }
    if (index >= secondStart) {
      const local = index - secondStart
      const span = total - secondStart
      const env = local < attack ? local / attack : 1 - (local - attack) / Math.max(1, span - attack)
      sample += Math.sin(2 * Math.PI * SECOND_TONE_HZ * time) * AMP * Math.max(0, env)
    }
    const clamped = Math.max(-1, Math.min(1, sample))
    pcm[index] = Math.round(clamped * 32767)
  }
  const bytes = pcm.length * 2
  const buffer = new ArrayBuffer(44 + bytes)
  const view = new DataView(buffer)
  writeText(view, 0, 'RIFF')
  view.setUint32(4, 36 + bytes, true)
  writeText(view, 8, 'WAVE')
  writeText(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(view, 36, 'data')
  view.setUint32(40, bytes, true)
  new Uint8Array(buffer, 44).set(new Uint8Array(pcm.buffer))
  return new Uint8Array(buffer)
}
