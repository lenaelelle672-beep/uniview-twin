#!/usr/bin/env node
/**
 * D191：等 __twinPrewarmed 后按 F12→F22→F18→F3→F1 进层，记 programs 增量和 cacheKey 差。
 * 用法：node scripts/t017-d191-prewarm-measure.mjs [url] [label] [mode]
 * mode = after | early
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const here = dirname(fileURLToPath(import.meta.url))
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const label = process.argv[3] ?? 't017'
const mode = process.argv[4] ?? 'after'
const outDir = process.env.ARTIFACT_DIR ?? resolve(here, '../docs/T017-evidence')

function chromePath() {
  return (
    process.env.CHROME_PATH ??
    ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((path) => {
      try {
        require('node:fs').accessSync(path)
        return path
      } catch {
        return null
      }
    })
  )
}

function loadavg() {
  const [a, b, c] = os.loadavg()
  return { load1: a, load5: b, load15: c, cpus: os.cpus().length }
}

async function launch() {
  return puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--no-sandbox',
      '--window-size=1366,768',
    ],
  })
}

async function attachFrames(page) {
  await page.evaluate(() => {
    const frames = []
    const longTasks = []
    let prev = performance.now()
    const tick = (now) => {
      frames.push({ at: now, dt: now - prev })
      prev = now
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push({ at: entry.startTime, dt: entry.duration })
      })
      observer.observe({ type: 'longtask', buffered: true })
    } catch {
      // ignore
    }
    window.__t017Frames = { frames, longTasks }
  })
}

async function frameStats(page, since) {
  return page.evaluate((start) => {
    const all = (window.__t017Frames?.frames ?? []).filter((frame) => frame.at >= start)
    const dts = all.map((frame) => frame.dt)
    const longs = (window.__t017Frames?.longTasks ?? []).filter((task) => task.at >= start).map((task) => task.dt)
    return {
      samples: dts.length,
      maxFrameMs: dts.length ? Math.max(...dts) : null,
      maxLongTaskMs: longs.length ? Math.max(...longs) : null,
    }
  }, since)
}

function isShadowKey(key, name) {
  return /SHADOW|DEPTH|DISTANCE|MeshDepth|MeshDistance/i.test(`${key} ${name}`)
}

async function enterStop(page, stop) {
  const before = await page.evaluate(() => window.__twinSnapPrograms?.('before') ?? [])
  const started = await page.evaluate(() => performance.now())
  await page.evaluate((target) => {
    if (target.search) {
      const box = document.querySelector('input[type="search"], input[placeholder*="搜索"]')
      if (box) {
        box.focus()
        box.value = target.search
        box.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }
    window.__twinFocusDevice?.(target)
  }, stop)
  await page
    .waitForFunction(
      (id) => window.__twinView === 'floor' && window.__twinSelected === id && window.__twinInterior?.floorId === id,
      { timeout: 90_000 },
      stop.floor,
    )
    .catch(() => {})
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 2200)))
  const after = await page.evaluate((id) => window.__twinSnapPrograms?.(`after-${id}`) ?? [], stop.floor)
  const beforeKeys = new Set(before.map((item) => item.cacheKey))
  const added = after.filter((item) => !beforeKeys.has(item.cacheKey))
  const frames = await frameStats(page, started)
  return {
    ...stop,
    programsBefore: before.length,
    programsAfter: after.length,
    programDelta: added.length,
    added: added.map((item) => ({
      name: item.name,
      cacheKey: item.cacheKey,
      shadow: isShadowKey(item.cacheKey, item.name),
    })),
    addedColor: added.filter((item) => !isShadowKey(item.cacheKey, item.name)).length,
    addedShadow: added.filter((item) => isShadowKey(item.cacheKey, item.name)).length,
    ...frames,
  }
}

async function findPrinter(page) {
  return page.evaluate(() => {
    const devices = window.__twinDevices ?? []
    return (
      devices.find((device) => device.floorId === 'F1' && device.type === 'printer' && device.status === 'alarm') ??
      devices.find((device) => device.floorId === 'F1' && device.type === 'printer') ??
      { id: 'F1-PR1', floorId: 'F1' }
    )
  })
}

async function runTour(browser, quality) {
  const page = await browser.newPage()
  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(`${baseUrl}/?q=${quality}`, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForFunction(() => window.__twinReady === true && window.__twinFirstFrameAt != null, { timeout: 90_000 })
  await attachFrames(page)

  let waitMs = 0
  if (mode === 'early') {
    const delay = 4000
    await page.evaluate((ms) => new Promise((resolve) => setTimeout(resolve, ms)), delay)
    waitMs = delay
  } else {
    const t0 = Date.now()
    await page.waitForFunction(() => window.__twinPrewarmed === true, { timeout: 180_000 }).catch(() => {})
    waitMs = Date.now() - t0
  }

  const prewarm = await page.evaluate(() => ({
    prewarmed: window.__twinPrewarmed === true,
    prewarm: window.__twinPrewarm ?? null,
    composerLive: window.__twinComposerLive === true,
    hasComposerInput: Boolean(window.__twinComposerInput),
    programs: window.__twinMemory?.programs ?? null,
  }))

  const printer = await findPrinter(page)
  const stops = []
  stops.push(await enterStop(page, { floor: 'F12', deskId: null, deviceId: null, path: 'list' }))
  stops.push(await enterStop(page, { floor: 'F22', deskId: null, deviceId: null, path: 'list' }))
  stops.push(await enterStop(page, { floor: 'F18', deskId: 'F18-1', deviceId: null, path: 'search', search: 'F18-1' }))
  stops.push(await enterStop(page, { floor: 'F3', deskId: 'F3-1', deviceId: null, path: 'alarm' }))
  stops.push(
    await enterStop(page, {
      floor: 'F1',
      deskId: printer.deskId ?? null,
      deviceId: printer.id ?? 'F1-PR1',
      path: 'printer',
    }),
  )
  await page.close()
  return { quality, mode, waitMs, load: loadavg(), prewarm, stops, errors }
}

async function main() {
  const browser = await launch()
  const report = { createdAt: new Date().toISOString(), label, baseUrl, mode, load: loadavg(), tours: [] }
  try {
    report.tours.push(await runTour(browser, 'balanced'))
    report.tours.push(await runTour(browser, 'perf'))
  } finally {
    await browser.close()
  }
  await mkdir(outDir, { recursive: true })
  const jsonPath = resolve(outDir, `t017-d191-${label}-${mode}.json`)
  await writeFile(jsonPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  console.log(`wrote ${jsonPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
