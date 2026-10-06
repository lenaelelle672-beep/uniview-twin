#!/usr/bin/env node
/**
 * D241 / D243 / D244：
 * 1. F1–F8 × 1366/1920/2560 默认视角 overlapPairs 必须为 0。
 * 2. F3 1366 默认记下客户休息室 / 外廊 的屏幕位移和盒宽。
 * 3. 截图：F3 1366 默认+拉近 × balanced/perf × 白天/夜间（8）+ F12 1366 默认。
 *
 * 用法：node scripts/t014-label-overlap.mjs [baseUrl]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const outDir = process.env.ARTIFACT_DIR ?? '/opt/cursor/artifacts'
const WIDTHS = [1366, 1920, 2560]
const OVERLAP_FLOORS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']
const CONSOLE_FLOORS = [...OVERLAP_FLOORS, 'F14']

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

async function launch() {
  const puppeteer = require('puppeteer-core')
  return puppeteer.launch({
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
}

async function waitOverlap(page) {
  await page.waitForFunction(
    () => window.__twinView === 'floor' && window.__twinLabelOverlap && typeof window.__twinLabelOverlap.overlapPairs === 'number',
    { timeout: 60_000 },
  )
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1000)))
  return page.evaluate(() => structuredClone(window.__twinLabelOverlap))
}

async function enterFloor(page, floorId) {
  await page.evaluate((id) => window.__twinFocusDevice?.({ floor: id, deskId: null }), floorId)
  await page.waitForFunction((id) => window.__twinView === 'floor' && window.__twinSelected === id, { timeout: 45_000 }, floorId)
}

async function leaveFloor(page) {
  await page.evaluate(() => window.__twinSelectFloor?.(null))
  await page.keyboard.press('Escape')
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 240)))
}

async function zoomIn(page, factor = 0.18) {
  return page.evaluate((scale) => {
    const rig = window.__twinRig
    if (!rig) return { ok: false, reason: 'no __twinRig' }
    const before = rig.distance
    const next = Math.max(rig.minDistance || 8, before * scale)
    void rig.dollyTo(next, false)
    rig.update(0)
    return { ok: true, before, next, after: rig.distance }
  }, factor)
}

async function samplePixels(page, sx, sy) {
  return page.evaluate(
    (x, y) => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return null
      const tmp = document.createElement('canvas')
      tmp.width = canvas.width
      tmp.height = canvas.height
      const ctx = tmp.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(canvas, 0, 0)
      const hex = (px, py) => {
        const d = ctx.getImageData(Math.max(0, Math.round(px)), Math.max(0, Math.round(py)), 1, 1).data
        return `#${[d[0], d[1], d[2]].map((n) => n.toString(16).padStart(2, '0')).join('')}`
      }
      return {
        center: hex(x, y),
        left: hex(x - 7, y),
        right: hex(x + 7, y),
        up: hex(x, y - 5),
        down: hex(x, y + 5),
      }
    },
    sx,
    sy,
  )
}

async function openPage(browser, quality, width) {
  const page = await browser.newPage()
  const consoles = []
  const external = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') consoles.push({ type: msg.type(), text: msg.text() })
  })
  page.on('pageerror', (error) => consoles.push({ type: 'pageerror', text: error.message }))
  page.on('request', (req) => {
    const url = req.url()
    if (!url.startsWith(baseUrl) && !url.startsWith('data:') && !url.startsWith('blob:')) external.push(url)
  })
  await page.setCacheEnabled(false)
  await page.setViewport({ width, height: 768, deviceScaleFactor: 1 })
  await page.goto(`${baseUrl}/?q=${quality}`, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForFunction(() => window.__twinReady === true, { timeout: 90_000 })
  return { page, consoles, external }
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const browser = await launch()
  const report = {
    overlap: {},
    d243: null,
    pixels: {},
    shots: [],
    consoles: {},
    external: {},
  }

  for (const width of WIDTHS) {
    const { page, consoles, external } = await openPage(browser, 'balanced', width)
    report.overlap[width] = {}
    for (const floorId of OVERLAP_FLOORS) {
      await enterFloor(page, floorId)
      const def = await waitOverlap(page)
      report.overlap[width][floorId] = {
        overlapPairs: def.overlapPairs,
        merged: def.merged,
        hidden: def.hidden,
        hiddenAfterZoom: def.hiddenAfterZoom,
        visible: def.visible?.length ?? 0,
      }
      if (width === 1366 && floorId === 'F3') {
        report.d243 = def.d243 ?? null
        const rest = def.d243?.rest
        if (rest) report.pixels.f3_rest_balanced_day = await samplePixels(page, rest.sx + rest.offsetX, rest.sy + rest.offsetY)
      }
      await leaveFloor(page)
    }
    if (width === 1366) {
      for (const floorId of CONSOLE_FLOORS) {
        await enterFloor(page, floorId)
        await waitOverlap(page)
        await leaveFloor(page)
      }
      report.consoles.balanced = consoles
      report.external.balanced = external
    }
    await page.close()
  }

  const shotSpecs = [
    { quality: 'balanced', night: false, zoom: false, name: 'F3_1366_default_balanced_day' },
    { quality: 'balanced', night: false, zoom: true, name: 'F3_1366_zoom_balanced_day' },
    { quality: 'balanced', night: true, zoom: false, name: 'F3_1366_default_balanced_night' },
    { quality: 'balanced', night: true, zoom: true, name: 'F3_1366_zoom_balanced_night' },
    { quality: 'perf', night: false, zoom: false, name: 'F3_1366_default_perf_day' },
    { quality: 'perf', night: false, zoom: true, name: 'F3_1366_zoom_perf_day' },
    { quality: 'perf', night: true, zoom: false, name: 'F3_1366_default_perf_night' },
    { quality: 'perf', night: true, zoom: true, name: 'F3_1366_zoom_perf_night' },
  ]

  for (const spec of shotSpecs) {
    const { page, consoles, external } = await openPage(browser, spec.quality, 1366)
    if (spec.night) {
      await page.evaluate(() => window.__twinSetDayNight?.('night'))
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)))
    }
    await enterFloor(page, 'F3')
    const overlap = await waitOverlap(page)
    if (spec.zoom) {
      await zoomIn(page, 0.22)
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 800)))
    }
    const path = resolve(outDir, `${spec.name}.png`)
    await page.screenshot({ path })
    report.shots.push(path)
    const rest = overlap.d243?.rest
    const key = `${spec.quality}_${spec.night ? 'night' : 'day'}_${spec.zoom ? 'zoom' : 'default'}`
    if (rest) report.pixels[key] = await samplePixels(page, rest.sx + rest.offsetX, rest.sy + rest.offsetY)
    if (spec.quality === 'perf' && !spec.night && !spec.zoom) {
      report.consoles.perf = consoles
      report.external.perf = external
    }
    await page.close()
  }

  {
    const { page } = await openPage(browser, 'balanced', 1366)
    await enterFloor(page, 'F12')
    await waitOverlap(page)
    const path = resolve(outDir, 'F12_1366_default.png')
    await page.screenshot({ path })
    report.shots.push(path)
    await page.close()
  }

  const failed = []
  for (const width of WIDTHS) {
    for (const floorId of OVERLAP_FLOORS) {
      const row = report.overlap[width][floorId]
      if (row.overlapPairs !== 0) failed.push(`${floorId}@${width}=${row.overlapPairs}`)
    }
  }
  report.failed = failed
  const out = resolve(here, '../docs/T012-evidence/t014-label-overlap.json')
  await writeFile(out, JSON.stringify(report, null, 2))
  console.log(
    JSON.stringify(
      {
        out,
        failed,
        overlap: report.overlap,
        d243: report.d243,
        pixels: report.pixels,
        shots: report.shots,
        consoles: Object.fromEntries(Object.entries(report.consoles).map(([key, rows]) => [key, rows.length])),
        external: Object.fromEntries(Object.entries(report.external).map(([key, rows]) => [key, rows.length])),
      },
      null,
      2,
    ),
  )
  await browser.close()
  if (failed.length > 0) process.exit(2)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
