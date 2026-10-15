#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const label = process.argv[3] ?? 'head'
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

const out = {
  label,
  baseUrl,
  d195: null,
  warnings: [],
  workers: [],
  external: [],
  pauseCounts: null,
  hover: null,
  layouts: {},
  shots: [],
  f1Cache: null,
}

async function open(search = '?q=perf', width = 1366, height = 768) {
  const page = await browser.newPage()
  await page.setCacheEnabled(false)
  await page.setViewport({ width, height, deviceScaleFactor: 1 })
  page.on('console', (msg) => {
    const text = msg.text()
    if (/configureTextBuilder|unicode-font|jsdelivr|Worker/i.test(text)) out.warnings.push(text)
  })
  page.on('request', (req) => {
    const url = req.url()
    if (!url.startsWith(baseUrl) && !url.startsWith('data:') && !url.startsWith('blob:')) out.external.push(url)
  })
  await page.goto(`${baseUrl}/${search}`, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForFunction(() => window.__twinReady === true, { timeout: 90_000 })
  return page
}

{
  const page = await open('?q=perf&keepDrawingBuffer=1')
  await page.waitForFunction(() => window.__twinFirstFrameAt != null, { timeout: 30_000 })
  await page
    .waitForFunction(
      () => window.__twinGlyphPreload?.done === true && window.__twinGlyphPreload?.spaceCall != null,
      { timeout: 90_000 },
    )
    .catch(() => {})
  out.d195 = await page.evaluate(() => {
    const first = window.__twinFirstFrameAt
    const textAt = window.__twinTextRuntimeAt
    const resources = performance.getEntriesByType('resource').map((entry) => ({
      name: entry.name.replace(location.origin, ''),
      startTime: entry.startTime,
      initiatorType: entry.initiatorType,
    }))
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
      }))
    const woff = woffs[0] ?? null
    const textChunk = resources.find((row) => /textRuntime|troika|disableTroika/i.test(row.name))
    return {
      firstFrameAt: first ?? null,
      textRuntimeAt: textAt ?? null,
      woff: woff ?? null,
      woffs,
      textChunk: textChunk ?? null,
      woffAfterFirst: Boolean(woff && first != null && woff.startTime > first),
      woffAfterFirstPlus5s: Boolean(woff && first != null && woff.startTime >= first + 5000),
      woffAfterText: Boolean(woff && textAt != null && woff.startTime > textAt),
      fontPrefetch: window.__twinGlyphPreload?.fontPrefetch ?? null,
      spaceCall: window.__twinGlyphPreload?.spaceCall ?? null,
      workers: (performance.getEntriesByType('resource') ?? [])
        .filter((entry) => /worker/i.test(entry.name) || entry.initiatorType === 'worker')
        .map((entry) => entry.name),
    }
  })
  out.workers = await page.evaluate(() => {
    try {
      return navigator.serviceWorker?.controller ? ['serviceWorker'] : []
    } catch {
      return []
    }
  })
  out.pauseCounts = await page.evaluate(() => {
    const note = window.__twinNotePreloadPause
    const before = structuredClone(window.__twinGlyphPreload?.pauseCounts ?? {})
    window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    note?.()
    const afterPointer = structuredClone(window.__twinGlyphPreload?.pauseCounts ?? {})
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    const prevView = window.__twinView
    window.__twinView = 'floor'
    window.__twinCameraMoveAt = undefined
    note?.()
    const afterFloor = structuredClone(window.__twinGlyphPreload?.pauseCounts ?? {})
    window.__twinView = 'building'
    window.__twinCameraMoveAt = performance.now()
    note?.()
    const afterMotion = structuredClone(window.__twinGlyphPreload?.pauseCounts ?? {})
    window.__twinView = prevView
    return {
      hooked: typeof note === 'function',
      before,
      afterPointer,
      afterFloor,
      afterMotion,
      reason: window.__twinGlyphPreload?.pauseReason ?? null,
    }
  })
  await page.close()
}

{
  const page = await open('?q=perf')
  await page.waitForFunction(() => window.__twinReady === true, { timeout: 90_000 })
  const marker = await page.$('[data-twin-floor-marker="F2"]')
  if (marker) await marker.click({ clickCount: 2 })
  else await page.evaluate(() => window.__twinFocusDevice?.({ floor: 'F2', deskId: null }))
  await page.waitForFunction(() => window.__twinView === 'floor' && window.__twinSelected === 'F2', { timeout: 45_000 })
  await page.waitForFunction(() => window.__twinLabelReadyAt != null && window.__twinLabelOverlap, { timeout: 45_000 }).catch(() => {})
  await page.evaluate(() => new Promise((r) => setTimeout(r, 600)))
  await page.mouse.move(5, 5)
  await page.evaluate(() => new Promise((r) => setTimeout(r, 160)))
  const off = await page.evaluate(() => {
    const o = window.__twinLabelOverlap
    return {
      overlapPairs: o?.overlapPairs ?? null,
      mismatch: o?.mismatch ?? null,
      hidden: o?.hidden ?? null,
      hoverId: o?.hoverId ?? null,
      meetings: (o?.hiddenAt || []).filter((row) => /会议/.test(row.text)).slice(0, 4),
    }
  })
  out.hover = { offCanvas: off }
  const target = off.meetings[0]
  if (target) {
    const point = await page.evaluate((item) => {
      const canvas = document.querySelector('canvas')
      const rect = canvas.getBoundingClientRect()
      return { x: rect.left + item.sx, y: rect.top + item.sy, id: item.id }
    }, target)
    await page.mouse.move(point.x, point.y)
    await page.evaluate(() => new Promise((r) => setTimeout(r, 360)))
    out.hover.onHidden = await page.evaluate((id) => {
      const o = window.__twinLabelOverlap
      return {
        id,
        hoverId: o?.hoverId ?? null,
        overlapPairs: o?.overlapPairs ?? null,
        mismatch: o?.mismatch ?? null,
        revealed: (o?.measured || []).some((row) => row.id === id),
      }
    }, target.id)
  }
  await page.close()
}

{
  const page = await open('?q=perf&keepDrawingBuffer=1')
  await page.waitForFunction(() => window.__twinGlyphPreload?.compile != null, { timeout: 90_000 }).catch(() => {})
  const before = await page.evaluate(() =>
    (window.__twinRenderer?.info.programs ?? []).map((p) => ({
      name: p.name ?? '',
      cacheKey: String(p.cacheKey ?? ''),
      label: String(p.cacheKey ?? '').includes('uTroikaSDFTexture') || String(p.name ?? '').includes('troika'),
    })),
  )
  const marker = await page.$('[data-twin-floor-marker="F1"]')
  if (marker) await marker.click({ clickCount: 2 })
  else await page.evaluate(() => window.__twinFocusDevice?.({ floor: 'F1', deskId: null }))
  await page.waitForFunction(() => window.__twinView === 'floor' && window.__twinSelected === 'F1', { timeout: 45_000 })
  await page.waitForFunction(() => window.__twinLabelReadyAt != null, { timeout: 45_000 }).catch(() => {})
  const after = await page.evaluate(() =>
    (window.__twinRenderer?.info.programs ?? []).map((p) => ({
      name: p.name ?? '',
      cacheKey: String(p.cacheKey ?? ''),
      label: /uTroikaSDFTexture|troika|text/i.test(String(p.cacheKey ?? '') + String(p.name ?? '')),
    })),
  )
  const prewarm = before.filter((row) => /troika|text|SDF/i.test(row.name + row.cacheKey))
  const post = after.filter((row) => /troika|text|SDF/i.test(row.name + row.cacheKey))
  out.f1Cache = {
    prewarmKeys: prewarm.map((row) => row.cacheKey),
    postKeys: post.map((row) => row.cacheKey),
    match: post.some((row) => prewarm.some((item) => item.cacheKey === row.cacheKey)),
  }
  await page.close()
}

for (const width of [1024, 1366, 1920]) {
  const page = await open('?q=perf', width, 768)
  const layoutOf = () =>
    page.evaluate(() => {
      const stage = document.querySelector('.stage')?.getBoundingClientRect()
      const canvas = document.querySelector('canvas')
      const gl = canvas
      const panel = document.querySelector('.floor-panel')?.getBoundingClientRect()
      const rail = document.querySelector('.floor-rail')?.getBoundingClientRect()
      const markers = [...document.querySelectorAll('[data-twin-floor-marker]')].map((el) => {
        const r = el.getBoundingClientRect()
        const pr = document.querySelector('.floor-panel')?.getBoundingClientRect()
        const covered = pr ? r.left < pr.right && r.right > pr.left && r.top < pr.bottom && r.bottom > pr.top : false
        return { id: el.getAttribute('data-twin-floor-marker'), x: Math.round(r.left), y: Math.round(r.top), covered }
      })
      return {
        view: window.__twinView,
        rail: rail ? { w: Math.round(rail.width), h: Math.round(rail.height) } : null,
        panel: panel ? { w: Math.round(panel.width), x: Math.round(panel.left) } : null,
        stage: stage ? { w: Math.round(stage.width), h: Math.round(stage.height) } : null,
        canvasCss: canvas ? { w: Math.round(canvas.getBoundingClientRect().width), h: Math.round(canvas.getBoundingClientRect().height) } : null,
        canvasPx: gl ? { w: gl.width, h: gl.height } : null,
        coveredMarkers: markers.filter((row) => row.covered).map((row) => row.id),
      }
    })
  out.layouts[`${width}-overview`] = await layoutOf()
  const shotOv = `/opt/cursor/artifacts/t014-rail-${label}-${width}-overview.png`
  await page.screenshot({ path: shotOv, type: 'png' })
  out.shots.push(shotOv)
  const marker = await page.$('[data-twin-floor-marker="F2"]')
  if (marker) await marker.click({ clickCount: 2 })
  else await page.evaluate(() => window.__twinFocusDevice?.({ floor: 'F2', deskId: null }))
  await page.waitForFunction(() => window.__twinView === 'floor' && window.__twinSelected === 'F2', { timeout: 45_000 })
  await page.evaluate(() => new Promise((r) => setTimeout(r, 500)))
  out.layouts[`${width}-F2`] = await layoutOf()
  const shotF2 = `/opt/cursor/artifacts/t014-rail-${label}-${width}-F2.png`
  await page.screenshot({ path: shotF2, type: 'png' })
  out.shots.push(shotF2)
  await page.close()
}

await mkdir('/opt/cursor/artifacts', { recursive: true })
await writeFile(`/opt/cursor/artifacts/t014-d273-extras-${label}.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
await browser.close()
