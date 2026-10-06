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

function median(values) {
  const xs = values.filter((n) => typeof n === 'number').sort((a, b) => a - b)
  if (xs.length === 0) return null
  return xs[Math.floor(xs.length / 2)]
}

function maxOf(values) {
  const xs = values.filter((n) => typeof n === 'number')
  return xs.length ? Math.max(...xs) : null
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

async function open(search = '?q=balanced') {
  const page = await browser.newPage()
  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  const grows = []
  await page.evaluateOnNewDocument(() => {
    const stamps = []
    let last = performance.now()
    const tick = () => {
      const now = performance.now()
      stamps.push({ at: now, dt: now - last })
      last = now
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    window.__twinRafStamps = stamps
    const orig = console.info.bind(console)
    console.info = (...args) => {
      const text = args.map((item) => (typeof item === 'string' ? item : '')).join(' ')
      if (text.includes('Increasing SDF texture size')) {
        window.__qaAtlasGrows = window.__qaAtlasGrows ?? []
        window.__qaAtlasGrows.push({ at: performance.now(), text })
      }
      orig(...args)
    }
  })
  page.on('console', (msg) => {
    const text = msg.text()
    if (text.includes('Increasing SDF texture size')) grows.push({ at: Date.now(), text })
  })
  await page.goto(`${baseUrl}/${search}`, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForFunction(() => window.__twinReady === true, { timeout: 90_000 })
  page.__atlas = grows
  return page
}

async function waitReady(page, started) {
  return page.evaluate(async (t0) => {
    const find = () => {
      let batch = null
      window.__twinScene?.traverse((obj) => {
        if (obj.name === 'RoomLabelBatchedText') batch = obj
      })
      return batch
    }
    let last = -1
    let stable = 0
    const begin = performance.now()
    while (performance.now() - begin < 25_000) {
      const batch = find()
      const members = batch?._members
      if (members && members.size && window.__twinLabelFading !== true) {
        let vis = 0
        let ready = 0
        for (const text of members.keys()) {
          if (text.scale?.x > 0.05 && (text.fillOpacity ?? 0) >= 0.98) {
            vis += 1
            if (text.textRenderInfo?.blockBounds) ready += 1
          }
        }
        if (vis > 0 && vis === ready) {
          if (vis === last) stable += 1
          else {
            last = vis
            stable = 1
          }
          if (stable >= 3) {
            const o = window.__twinLabelOverlap
            const p = window.__twinLabelPhases ?? {}
            return {
              ms: Math.round(performance.now() - t0),
              vis,
              syncs: window.__twinLabelSyncs ?? 0,
              batch: true,
              overlap: o?.overlapPairs ?? null,
              mismatch: o?.mismatch ?? null,
              hidden: o?.hidden ?? null,
              tier2: o?.tier2 ?? null,
              px: window.__twinLabelPx ?? null,
              restReason: window.__twinCameraRestReason ?? p.restReason ?? null,
              clickToRest: p.restAt != null ? Math.round(p.restAt - t0) : null,
              clickToMove:
                window.__twinCameraMoveAt != null ? Math.round(window.__twinCameraMoveAt - t0) : null,
              avoidMs: p.avoidMs ?? null,
              syncMs: p.syncMs ?? null,
              fadeMs: p.fadeMs ?? (p.fadeDoneAt != null && p.fadeStartAt != null ? Math.round(p.fadeDoneAt - p.fadeStartAt) : null),
              maxFrameAvoid: p.maxFrameAvoid ?? null,
              maxFrameSync: p.maxFrameSync ?? null,
              maxFrameFade: p.maxFrameFade ?? null,
              newGlyphs: window.__twinGlyphPreload?.newOnEntry ?? {},
              packStep: p.packStep ?? null,
              atlasHeight: window.__twinGlyphPreload?.atlasHeight ?? null,
            }
          }
        } else {
          last = -1
          stable = 0
        }
      }
      await new Promise((r) => requestAnimationFrame(r))
    }
    return { ms: null, vis: last, syncs: window.__twinLabelSyncs ?? 0, batch: Boolean(find()) }
  }, started)
}

function maxRafSince(page, sinceAt) {
  return page.evaluate((t0) => {
    const stamps = window.__twinRafStamps ?? []
    const slice = stamps.filter((row) => (row.at ?? 0) >= t0)
    if (!slice.length) return null
    return Math.round(Math.max(...slice.map((row) => row.dt)))
  }, sinceAt)
}

function d263Frames(page) {
  return page.evaluate(() => {
    const first = window.__twinFirstFrameAt
    const stamps = window.__twinRafStamps ?? []
    const after = first == null ? [] : stamps.filter((row) => row.at >= first + 2000 && row.at !== first)
    const list = after.map((row) => Math.round(row.dt))
    return {
      firstFrameAt: first ?? null,
      count: list.length,
      max: list.length ? Math.max(...list) : null,
      frames: list,
    }
  })
}

async function enterFloor(page, floor) {
  const clickAt = await page.evaluate(() => {
    window.__twinCameraMoveAt = undefined
    return performance.now()
  })
  const marker = await page.$(`[data-twin-floor-marker="${floor}"]`)
  if (marker) await marker.click({ clickCount: 2 })
  else await page.evaluate((id) => window.__twinFocusDevice?.({ floor: id, deskId: null }), floor)
  await page.waitForFunction((id) => window.__twinView === 'floor' && window.__twinSelected === id, { timeout: 45_000 }, floor)
  return clickAt
}

const out = {
  label,
  baseUrl,
  idle: null,
  clickToMove: {},
  floors: {},
  consecutive: [],
  missing: { direct: {} },
}

{
  const page = await open()
  await page.waitForFunction(() => window.__twinFirstFrameAt != null, { timeout: 30_000 })
  const idleStart = await page.evaluate(() => performance.now())
  await page.waitForFunction(() => window.__twinGlyphPreload?.done === true, { timeout: 45_000 }).catch(() => {})
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)))
  const idle = await page.evaluate((t0) => {
    const g = window.__twinGlyphPreload
    return {
      unique: g?.unique ?? 0,
      done: g?.done ?? false,
      batchSize: g?.batchSize ?? null,
      firstBatchSize: g?.firstBatchSize ?? null,
      batches: g?.batches ?? [],
      warmup: g?.warmup ?? [],
      atlasGrows: g?.atlasGrows ?? [],
      qaAtlasGrows: window.__qaAtlasGrows ?? [],
      atlasHeight: g?.atlasHeight ?? null,
      waitMs: Math.round(performance.now() - t0),
    }
  }, idleStart)
  idle.consoleAtlas = page.__atlas
  idle.d263 = await d263Frames(page)
  idle.maxFrame = idle.d263.max
  out.idle = idle
  await page.close()
}

for (const delay of [500, 1500, 3000]) {
  const runs = []
  for (let i = 0; i < 3; i += 1) {
    const page = await open()
    await page.waitForFunction(() => window.__twinReady === true, { timeout: 90_000 })
    await page.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), delay)
    const clickAt = await page.evaluate(() => {
      window.__twinCameraMoveAt = undefined
      const cam = window.__twinRig?.camera?.position
      window.__twinClickCam = cam ? { x: cam.x, y: cam.y, z: cam.z } : null
      return performance.now()
    })
    const marker = await page.$('[data-twin-floor-marker="F1"]')
    if (marker) await marker.click({ clickCount: 2 })
    else await page.evaluate(() => window.__twinFocusDevice?.({ floor: 'F1', deskId: null }))
    await page.waitForFunction(() => window.__twinView === 'floor' && window.__twinSelected === 'F1', { timeout: 45_000 })
    const moveMs = await page.evaluate((t0) => {
      const started = performance.now()
      const origin = window.__twinClickCam
      return new Promise((resolve) => {
        const poll = () => {
          if (typeof window.__twinCameraMoveAt === 'number') {
            resolve(Math.round(window.__twinCameraMoveAt - t0))
            return
          }
          const cam = window.__twinRig?.camera?.position
          if (origin && cam && (Math.abs(cam.x - origin.x) > 1e-4 || Math.abs(cam.y - origin.y) > 1e-4 || Math.abs(cam.z - origin.z) > 1e-4)) {
            resolve(Math.round(performance.now() - t0))
            return
          }
          if (performance.now() - started > 8000) {
            resolve(null)
            return
          }
          requestAnimationFrame(poll)
        }
        poll()
      })
    }, clickAt)
    runs.push(moveMs)
    await page.close()
  }
  out.clickToMove[`ready+${delay}`] = { runs, median: median(runs), max: maxOf(runs) }
}

for (const floor of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']) {
  const runs = []
  for (let i = 0; i < 3; i += 1) {
    const page = await open()
    await page.waitForFunction(() => window.__twinReady === true, { timeout: 90_000 })
    await page.waitForFunction(() => window.__twinGlyphPreload?.done === true || performance.now() > 8000, { timeout: 20_000 }).catch(() => {})
    const resetAt = await page.evaluate(() => {
      const now = performance.now()
      if (Array.isArray(window.__twinRafStamps)) window.__twinRafStamps.length = 0
      window.__twinCameraMoveAt = undefined
      return now
    })
    const clickAt = await enterFloor(page, floor)
    const row = await waitReady(page, clickAt)
    row.maxFrame = await maxRafSince(page, resetAt)
    row.clickToMove = await page.evaluate((t0) =>
      window.__twinCameraMoveAt != null ? Math.round(window.__twinCameraMoveAt - t0) : null,
    clickAt)
    runs.push(row)
    await page.close()
  }
  const complete = runs.map((row) => row.ms)
  const frames = runs.map((row) => row.maxFrame)
  const fades = runs.map((row) => row.fadeMs)
  out.floors[floor] = {
    runs,
    medianMs: median(complete),
    maxMs: maxOf(complete),
    medianMaxFrame: median(frames),
    maxMaxFrame: maxOf(frames),
    medianFadeMs: median(fades),
  }
}

{
  const page = await open()
  await page.waitForFunction(() => window.__twinFirstFrameAt != null, { timeout: 30_000 })
  await page.waitForFunction(() => window.__twinGlyphPreload?.done === true, { timeout: 45_000 }).catch(() => {})
  for (const floor of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']) {
    const resetAt = await page.evaluate(() => {
      const now = performance.now()
      if (Array.isArray(window.__twinRafStamps)) window.__twinRafStamps.length = 0
      window.__twinCameraMoveAt = undefined
      return now
    })
    const clickAt = await enterFloor(page, floor)
    const row = await waitReady(page, clickAt)
    row.maxFrame = await maxRafSince(page, resetAt)
    row.atlas = await page.evaluate(() => ({
      grows: window.__twinGlyphPreload?.atlasGrows ?? [],
      qa: window.__qaAtlasGrows ?? [],
      height: window.__twinGlyphPreload?.atlasHeight ?? null,
    }))
    row.floor = floor
    out.consecutive.push(row)
  }
  out.consecutiveGrows = await page.evaluate(() => ({
    grows: window.__twinGlyphPreload?.atlasGrows ?? [],
    qa: window.__qaAtlasGrows ?? [],
    height: window.__twinGlyphPreload?.atlasHeight ?? null,
  }))
  await page.close()
}

for (const floor of ['F4', 'F6', 'F8']) {
  const page = await open(`?q=balanced&view=floor&floor=${floor}`)
  const started = await page.evaluate(() => performance.now())
  await page.waitForFunction((id) => window.__twinView === 'floor' && window.__twinSelected === id, { timeout: 45_000 }, floor).catch(() => {})
  const row = await waitReady(page, started)
  out.missing.direct[floor] = { batch: row.batch, ms: row.ms, syncs: row.syncs }
  await page.close()
}

await mkdir('/opt/cursor/artifacts', { recursive: true })
await writeFile(`/opt/cursor/artifacts/t014-d264-${label}.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
await browser.close()
