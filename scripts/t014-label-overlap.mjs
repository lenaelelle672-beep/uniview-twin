#!/usr/bin/env node
/**
 * D247 / D248 / D249：
 * 1. F1–F8 × 1024/1366/1920：独立测量 overlapPairs=0，maxOffset≤48，hiddenAfterZoom=0。
 * 2. 1366/1920 第二级全可见；1024 报告隐藏数。
 * 3. 拉近三档（默认/中间/最近）可见数递增。
 * 4. 字高：1366/1920 = 16±1，1024 ≥15。
 * 5. 进层 sync ≤2。截图 8 + 中间档 + F12。
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
const WIDTHS = [1024, 1366, 1920]
const OVERLAP_FLOORS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']
const CONSOLE_FLOORS = [...OVERLAP_FLOORS, 'F14']
const MAX_OFFSET = 48
const ZOOM_STEPS = [
  { name: 'default', factor: 1 },
  { name: 'mid', factor: 0.48 },
  { name: 'close', factor: 0.18 },
]

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
    () =>
      window.__twinView === 'floor' &&
      window.__twinLabelOverlap &&
      typeof window.__twinLabelOverlap.overlapPairs === 'number' &&
      typeof window.__twinLabelOverlap.maxOffset === 'number' &&
      window.__twinLabelOverlap.tier2 &&
      (window.__twinLabelSyncs ?? 0) >= 1 &&
      window.__twinLabelReadyAt,
    { timeout: 90_000 },
  )
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)))
  return page.evaluate(() =>
    structuredClone({
      overlap: window.__twinLabelOverlap,
      px: window.__twinLabelPx,
      syncs: window.__twinLabelSyncs ?? 0,
      syncMs:
        window.__twinLabelReadyAt && window.__twinLabelSyncStartedAt
          ? window.__twinLabelReadyAt - window.__twinLabelSyncStartedAt
          : window.__twinLabelPackMs ?? null,
      distance: window.__twinRig?.distance ?? null,
      graze: window.__twinLabelOverlap?.grazePairs ?? 0,
      mismatch: window.__twinLabelOverlap?.mismatch ?? 0,
      maxAngle: window.__twinLabelOverlap?.maxAngle ?? 0,
    }),
  )
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

async function zoomTo(page, factor) {
  return page.evaluate((scale) => {
    const rig = window.__twinRig
    if (!rig) return { ok: false, reason: 'no __twinRig' }
    if (!window.__twinDefaultDistance) window.__twinDefaultDistance = rig.distance
    const next = Math.max(rig.minDistance || 8, window.__twinDefaultDistance * scale)
    void rig.dollyTo(next, false)
    rig.update(0)
    return { ok: true, next, after: rig.distance, syncs: window.__twinLabelSyncs ?? 0 }
  }, factor)
}

function viewportHeight(width) {
  return width === 1920 ? 1080 : 768
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
  await page.setViewport({ width, height: viewportHeight(width), deviceScaleFactor: 1 })
  await page.goto(`${baseUrl}/?q=${quality}`, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForFunction(() => window.__twinReady === true, { timeout: 90_000 })
  return { page, consoles, external }
}

function summarize(bundle) {
  const def = bundle.overlap
  const tier = def.tier2 ?? { visible: 0, total: 0, hidden: 0 }
  return {
    overlapPairs: def.overlapPairs,
    maxOffset: Number(def.maxOffset?.toFixed?.(2) ?? def.maxOffset),
    merged: def.merged,
    hidden: def.hidden,
    hiddenAfterZoom: def.hiddenAfterZoom,
    tier2Visible: tier.visible,
    tier2Total: tier.total,
    tier2Hidden: tier.hidden,
    visible: def.visible?.length ?? 0,
    px: bundle.px?.px ?? null,
    syncs: bundle.syncs,
    syncMs: bundle.syncMs,
    grazePairs: def.grazePairs ?? bundle.graze ?? 0,
    mismatch: def.mismatch ?? bundle.mismatch ?? 0,
    maxAngle: Number((def.maxAngle ?? bundle.maxAngle ?? 0).toFixed?.(2) ?? def.maxAngle ?? 0),
    pairs: def.pairs ?? [],
    region: (def.region ?? []).map((row) => ({
      text: row.text,
      box: row.box,
    })),
  }
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const browser = await launch()
  const report = {
    overlap: {},
    zoomLadder: {},
    fontPx: {},
    syncs: {},
    shots: [],
    consoles: {},
    external: {},
    regionF3: null,
  }

  for (const width of WIDTHS) {
    const { page, consoles, external } = await openPage(browser, 'balanced', width)
    report.overlap[width] = {}
    report.zoomLadder[width] = {}
    report.fontPx[width] = {}
    report.syncs[width] = {}
    for (const floorId of OVERLAP_FLOORS) {
      await enterFloor(page, floorId)
      await page.evaluate(() => {
        window.__twinDefaultDistance = undefined
      })
      const ladder = []
      for (const step of ZOOM_STEPS) {
        if (step.factor !== 1) await zoomTo(page, step.factor)
        const bundle = await waitOverlap(page)
        const row = { ...summarize(bundle), step: step.name, factor: step.factor, distance: bundle.distance }
        ladder.push(row)
        if (step.name === 'default') {
          report.overlap[width][floorId] = row
          report.fontPx[width][floorId] = row.px
          report.syncs[width][floorId] = { syncs: row.syncs, syncMs: row.syncMs }
          if (width === 1366 && floorId === 'F3') report.regionF3 = { pairs: row.pairs, region: row.region }
        }
      }
      report.zoomLadder[width][floorId] = ladder.map((row) => ({
        step: row.step,
        visible: row.visible,
        hidden: row.hidden,
        tier2Visible: row.tier2Visible,
        tier2Total: row.tier2Total,
        syncs: row.syncs,
      }))
      await leaveFloor(page)
    }
    await enterFloor(page, 'F12')
    await page.evaluate(() => {
      window.__twinDefaultDistance = undefined
    })
    const f12 = summarize(await waitOverlap(page))
    report.fontPx[width].F12 = f12.px
    report.syncs[width].F12 = { syncs: f12.syncs, syncMs: f12.syncMs }
    await leaveFloor(page)
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

  {
    const { page, consoles, external } = await openPage(browser, 'perf', 1366)
    for (const floorId of CONSOLE_FLOORS) {
      await enterFloor(page, floorId)
      await waitOverlap(page)
      await leaveFloor(page)
    }
    report.consoles.perf = consoles
    report.external.perf = external
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
    const { page } = await openPage(browser, spec.quality, 1366)
    if (spec.night) {
      await page.evaluate(() => window.__twinSetDayNight?.('night'))
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)))
    }
    await enterFloor(page, 'F3')
    await waitOverlap(page)
    if (spec.zoom) {
      await zoomTo(page, 0.22)
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 800)))
    }
    const path = resolve(outDir, `${spec.name}.png`)
    await page.screenshot({ path })
    report.shots.push(path)
    await page.close()
  }

  {
    const { page } = await openPage(browser, 'balanced', 1366)
    await enterFloor(page, 'F3')
    await waitOverlap(page)
    await zoomTo(page, 0.48)
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 800)))
    const mid = resolve(outDir, 'F3_1366_mid_balanced_day.png')
    await page.screenshot({ path: mid })
    report.shots.push(mid)
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

  {
    const { page } = await openPage(browser, 'balanced', 1366)
    await enterFloor(page, 'F1')
    await waitOverlap(page)
    const before = await page.evaluate(() => window.__twinLabelSyncs ?? 0)
    await zoomTo(page, 0.48)
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)))
    await zoomTo(page, 0.18)
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)))
    const after = await page.evaluate(() => window.__twinLabelSyncs ?? 0)
    report.f1ZoomSyncs = { before, after }
    await page.close()
  }

  {
    const { page } = await openPage(browser, 'balanced', 1366)
    await enterFloor(page, 'F2')
    await waitOverlap(page)
    const f2 = resolve(outDir, 'F2_1366_default_balanced_day.png')
    await page.screenshot({ path: f2 })
    report.shots.push(f2)
    const before = await page.evaluate(() => window.__twinLabelSyncs ?? 0)
    await page.evaluate(async () => {
      const rig = window.__twinRig
      if (!rig) return
      const started = performance.now()
      let angle = 0
      while (performance.now() - started < 10_000) {
        angle += 0.12
        void rig.rotateTo(angle, rig.polarAngle, false)
        rig.update(0)
        await new Promise((resolve) => requestAnimationFrame(resolve))
      }
    })
    const after = await page.evaluate(() => window.__twinLabelSyncs ?? 0)
    report.dragSyncs = { before, after }
    await page.close()
  }

  const failed = []
  if (report.dragSyncs && report.dragSyncs.after !== report.dragSyncs.before) {
    failed.push(`drag10s syncs ${report.dragSyncs.before}->${report.dragSyncs.after}`)
  }
  for (const width of WIDTHS) {
    for (const floorId of OVERLAP_FLOORS) {
      const row = report.overlap[width][floorId]
      if (row.overlapPairs !== 0) failed.push(`${floorId}@${width} overlapPairs=${row.overlapPairs} ${JSON.stringify(row.pairs)}`)
      if (row.mismatch > 0) failed.push(`${floorId}@${width} mismatch=${row.mismatch}`)
      if (row.maxAngle > 15) failed.push(`${floorId}@${width} maxAngle=${row.maxAngle}`)
      if (row.hiddenAfterZoom !== 0) failed.push(`${floorId}@${width} hiddenAfterZoom=${row.hiddenAfterZoom}`)
      if (row.maxOffset > MAX_OFFSET) failed.push(`${floorId}@${width} maxOffset=${row.maxOffset}`)
      if (width >= 1366 && row.tier2Hidden > 0) {
        failed.push(`${floorId}@${width} tier2 ${row.tier2Visible}/${row.tier2Total}`)
      }
      const px = row.px
      if (typeof px === 'number') {
        if (width === 1024 && px < 15) failed.push(`${floorId}@${width} px=${px}`)
        if (width >= 1366 && (px < 15 || px > 17)) failed.push(`${floorId}@${width} px=${px}`)
      }
      if (row.syncs > 2) failed.push(`${floorId}@${width} syncs=${row.syncs}`)
      const ladder = report.zoomLadder[width][floorId]
      if (ladder && ladder.length === 3) {
        if (ladder[1].visible < ladder[0].visible && ladder[2].visible < ladder[1].visible) {
          failed.push(`${floorId}@${width} zoom not gradual ${ladder.map((item) => item.visible).join('>')}`)
        }
      }
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
        overlap: Object.fromEntries(
          WIDTHS.map((width) => [
            width,
            Object.fromEntries(
              OVERLAP_FLOORS.map((floorId) => {
                const row = report.overlap[width][floorId]
                return [
                  floorId,
                  `${row.overlapPairs}/${row.grazePairs}/${row.mismatch}/${row.maxAngle}/${row.maxOffset}/${row.merged}/${row.hidden}/${row.tier2Visible}/${row.tier2Total}/${row.hiddenAfterZoom}`,
                ]
              }),
            ),
          ]),
        ),
        zoomLadder: report.zoomLadder,
        fontPx: report.fontPx,
        syncs: report.syncs,
        f1ZoomSyncs: report.f1ZoomSyncs,
        dragSyncs: report.dragSyncs,
        regionF3: report.regionF3,
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
