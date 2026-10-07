#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const label = process.argv[3] ?? 'head'
const rounds = Number(process.argv[4] ?? 3)
const puppeteer = require('puppeteer-core')

function chromePath() {
  return (
    process.env.CHROME_PATH ??
    ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((path) => {
      try {
        require('node:fs').accessSync(path)
        return true
      } catch {
        return false
      }
    })
  )
}

const browser = await puppeteer.launch({
  executablePath: chromePath(),
  headless: true,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
  ],
})

const out = { label, baseUrl, rounds: [] }

for (let i = 0; i < rounds; i += 1) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  await page.evaluateOnNewDocument(() => {
    let last = performance.now()
    const stamps = []
    const tick = () => {
      const now = performance.now()
      stamps.push({ at: now, dt: now - last })
      last = now
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    window.__twinRafStamps = stamps
  })
  await page.goto(`${baseUrl}/?q=perf&keepDrawingBuffer=1`, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForFunction(() => window.__twinReady === true && window.__twinFirstFrameAt != null, { timeout: 90_000 })
  await page
    .waitForFunction(
      () => window.__twinGlyphPreload?.spaceCall?.parseMs != null && window.__twinGlyphPreload?.fontPrefetch != null,
      { timeout: 90_000 },
    )
    .catch(() => {})
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)))
  const row = await page.evaluate(() => {
    const first = window.__twinFirstFrameAt
    const g = window.__twinGlyphPreload
    const space = g?.spaceCall ?? null
    const stamps = window.__twinRafStamps ?? []
    const frameAround = (at, span) => {
      if (at == null) return 0
      const slice = stamps.filter((item) => item.at >= at - 8 && item.at <= at + (span || 80) + 16)
      return slice.length ? Math.round(Math.max(...slice.map((item) => item.dt))) : 0
    }
    const woffs = performance.getEntriesByType('resource')
      .filter((entry) => /\.woff2?(\?|$)/i.test(entry.name))
      .map((entry) => ({
        name: entry.name.replace(location.origin, ''),
        startTime: Math.round(entry.startTime),
        duration: Math.round(entry.duration),
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize,
        decodedBodySize: entry.decodedBodySize,
        initiatorType: entry.initiatorType,
        afterFirstMs: first == null ? null : Math.round(entry.startTime - first),
      }))
    return {
      firstFrameAt: first ?? null,
      textRuntimeAt: window.__twinTextRuntimeAt ?? null,
      fontPrefetch: g?.fontPrefetch ?? null,
      spaceCall: space,
      woffs,
      atlasJudgeMs: Math.max(space?.atlasLongTaskMs ?? 0, space?.atlasFrameMs ?? 0, space?.atlasMs ?? 0),
      parseJudgeMs: Math.max(space?.parseLongTaskMs ?? 0, space?.parseFrameMs ?? 0, space?.parseMs ?? 0),
      prefetchFrameMs: frameAround(g?.fontPrefetch?.at, g?.fontPrefetch?.ms),
      layout: (() => {
        const canvas = document.querySelector('canvas')
        const rail = document.querySelector('.floor-rail')
        return {
          canvas: canvas ? { w: canvas.width, h: canvas.height, cssW: Math.round(canvas.getBoundingClientRect().width) } : null,
          rail: rail ? Math.round(rail.getBoundingClientRect().width) : null,
        }
      })(),
    }
  })
  out.rounds.push(row)
  console.log(
    `${label}#${i}`,
    `prefetch afterFirst=${row.fontPrefetch?.afterFirstMs} longtask=${row.fontPrefetch?.longTaskMs} bytes=${row.fontPrefetch?.bytes}`,
    `woffs=${row.woffs.map((w) => `${w.initiatorType}:${w.transferSize}/${w.encodedBodySize}@+${w.afterFirstMs}`).join(',')}`,
    `space total=${row.spaceCall?.ms} a=${row.spaceCall?.atlasMs}/${row.spaceCall?.atlasFrameMs}/${row.spaceCall?.atlasLongTaskMs} b=${row.spaceCall?.parseMs}/${row.spaceCall?.parseFrameMs}/${row.spaceCall?.parseLongTaskMs}`,
  )
  await page.close()
}

await mkdir('/opt/cursor/artifacts', { recursive: true })
await writeFile(`/opt/cursor/artifacts/t014-d275-woff-${label}.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
await browser.close()
