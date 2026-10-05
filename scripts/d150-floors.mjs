#!/usr/bin/env node
/** 总览 + F1–F22 + B1，两档 D148 稳态；F12/F22/B1 额外走点进峰值。 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const label = process.argv[3] ?? 'after'
const injectPath = process.env.INJECT_JS ?? '/home/ubuntu/.cursor/projects/workspace/uploads/inject_3efd.js'
const evidenceDir = resolve(process.cwd(), 'docs/T012-evidence')
const shotDir = process.env.ARTIFACT_DIR ?? '/opt/cursor/artifacts/screenshots'

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

const ALL =
  process.env.FLOORS === 'all'
    ? ['B1', ...Array.from({ length: 22 }, (_, i) => `F${i + 1}`)]
    : (process.env.FLOORS ?? 'B1,F12,F22').split(',').map((id) => id.trim())
const PEAK = new Set(['F12', 'F22', 'B1'])

function classifyPhase(snap) {
  if (snap.explode > 0.01 && snap.explode < 0.99) return '爆炸视图'
  if (snap.labels) return '标签同步'
  return '进场动画'
}

async function waitReady(page, quality) {
  await page.waitForFunction(() => window.__twinReady === true, { timeout: 90_000 })
  if (quality === 'balanced') {
    await page
      .waitForFunction(
        () => window.__twinComposerLive === true && document.querySelector('.scene-root')?.dataset.fxReady === '1',
        { timeout: 45_000 },
      )
      .catch(() => {})
  }
}

async function collectSteady60(page) {
  return page.evaluate(async () => {
    const P = window.__perf
    const mark = performance.now()
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const startT = performance.now()
    const collected = []
    let lastT = -1
    while (collected.length < 60 && performance.now() - startT < 8000) {
      const last = P.frames.at(-1)
      if (last && last.t > lastT && last.t >= mark) {
        collected.push(last.calls)
        lastT = last.t
      }
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
    const sorted = [...collected].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const medianCalls =
      sorted.length === 0 ? null : sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    return { medianCalls, minCalls: sorted[0] ?? null, maxCalls: sorted.at(-1) ?? null, count: collected.length }
  })
}

async function shot(page, name) {
  await mkdir(shotDir, { recursive: true })
  const dest = resolve(shotDir, `${name}.png`)
  const canvas = await page.$('canvas')
  if (canvas) await canvas.screenshot({ path: dest })
  else await page.screenshot({ path: dest })
  return dest
}

async function measureOverview(browser, inject, quality) {
  const page = await browser.newPage()
  const logs = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') logs.push({ type: msg.type(), text: msg.text() })
  })
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  await page.evaluateOnNewDocument(inject)
  await page.goto(`${baseUrl}/?q=${quality}`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page, quality)
  const steady = await collectSteady60(page)
  const mem = await page.evaluate(() => window.__twinMemory ?? null)
  await page.close()
  return {
    quality,
    view: 'overview',
    steadyMedian: steady.medianCalls,
    limit: (steady.medianCalls ?? 0) + 50,
    gate: (steady.medianCalls ?? 0) + 50 - 5,
    memory: mem,
    console: {
      errors: logs.filter((item) => item.type === 'error').length,
      warnings: logs.filter((item) => item.type === 'warning').length,
      blit: logs.filter((item) => /glBlitFramebuffer|Depth\/stencil/i.test(item.text)).length,
    },
  }
}

async function measureFloor(browser, inject, quality, floorId, doPeak) {
  const page = await browser.newPage()
  const logs = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') logs.push({ type: msg.type(), text: msg.text() })
  })
  page.on('pageerror', (error) => logs.push({ type: 'error', text: error.message }))
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  await page.evaluateOnNewDocument(inject)
  let peak = null
  if (doPeak) {
    await page.goto(`${baseUrl}/?q=${quality}`, { waitUntil: 'load', timeout: 90_000 })
    await waitReady(page, quality)
    const clickAt = await page.evaluate(() => performance.now())
    await page.waitForSelector(`[data-floor-id="${floorId}"]`, { timeout: 20_000 })
    await page.click(`[data-floor-id="${floorId}"]`)
    await page.click('button[aria-label="视图：单层"]')
    await page.waitForFunction(
      (id) => window.__twinView === 'floor' && window.__twinSelected === id,
      { timeout: 45_000 },
      floorId,
    )
    const stamps = await page.evaluate(async (id, wantPeople, started) => {
      const P = window.__perf
      const out = []
      const deadline = performance.now() + 40_000
      let lastT = -1
      while (performance.now() < deadline) {
        const last = P.frames.at(-1)
        const scene = P.scenes?.[0]
        const snap = {
          t: last?.t ?? performance.now(),
          calls: last?.calls ?? null,
          labels: Boolean(scene?.getObjectByName('RoomLabels')),
          people: Boolean(scene?.getObjectByName('CorridorPeople')),
          desks: window.__twinInterior?.renderedDesks ?? 0,
          explode: window.__twinExplode?.progress ?? 0,
          view: window.__twinView,
          selected: window.__twinSelected,
        }
        if (last && last.t > lastT && last.t >= started) {
          out.push(snap)
          lastT = last.t
        }
        const settled =
          snap.view === 'floor' &&
          snap.selected === id &&
          (id === 'B1' ? snap.desks >= 8 : snap.desks >= 80) &&
          snap.labels &&
          (!wantPeople || id === 'B1' || snap.people) &&
          (snap.explode <= 0.01 || snap.explode >= 0.99)
        if (settled && out.filter((item) => item.labels).length >= 12) break
        await new Promise((resolve) => requestAnimationFrame(resolve))
      }
      return out
    }, floorId, quality !== 'perf', clickAt)
    for (const snap of stamps) {
      if (snap.calls == null) continue
      if (!peak || snap.calls > peak.calls) peak = { calls: snap.calls, phase: classifyPhase(snap) }
    }
  } else {
    await page.goto(`${baseUrl}/?q=${quality}&view=floor&floor=${floorId}`, { waitUntil: 'load', timeout: 90_000 })
    await waitReady(page, quality)
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 2000)))
  }
  const steady = await collectSteady60(page)
  const desks = await page.evaluate(() => window.__twinInterior?.renderedDesks ?? 0)
  let shotPath = null
  if (quality === 'balanced' && (floorId === 'F12' || floorId === 'F22')) {
    shotPath = await shot(page, `d150_${floorId.toLowerCase()}_balanced`)
  }
  await page.close()
  return {
    quality,
    floorId,
    desks,
    steadyMedian: steady.medianCalls,
    peakCalls: peak?.calls ?? null,
    peakPhase: peak?.phase ?? null,
    shot: shotPath,
    console: {
      errors: logs.filter((item) => item.type === 'error').length,
      warnings: logs.filter((item) => item.type === 'warning').length,
      blit: logs.filter((item) => /glBlitFramebuffer|Depth\/stencil/i.test(item.text)).length,
    },
  }
}

async function main() {
  const inject = await readFile(injectPath, 'utf8')
  const browser = await puppeteer.launch({
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
  const report = { label, baseUrl, method: 'D148', overview: {}, floors: {}, failures: [] }
  for (const quality of ['balanced', 'perf']) {
    report.overview[quality] = await measureOverview(browser, inject, quality)
    console.error(`overview-${quality} ${report.overview[quality].steadyMedian} blit=${report.overview[quality].console.blit}`)
    const gate = report.overview[quality].gate
    for (const floorId of ALL) {
      const row = await measureFloor(browser, inject, quality, floorId, PEAK.has(floorId))
      row.overviewSteady = report.overview[quality].steadyMedian
      row.limit = report.overview[quality].limit
      row.gate = gate
      row.pass = row.steadyMedian != null && gate != null ? row.steadyMedian <= gate : false
      if (!row.pass) report.failures.push(`${floorId}-${quality} ${row.steadyMedian} > ${gate}`)
      if (row.console.blit) report.failures.push(`${floorId}-${quality} blit`)
      report.floors[`${floorId}-${quality}`] = row
      console.error(
        `${floorId}-${quality} steady=${row.steadyMedian} peak=${row.peakCalls} ${row.peakPhase ?? ''} pass=${row.pass}`,
      )
    }
  }
  report.ok = report.failures.length === 0
  await browser.close()
  await mkdir(evidenceDir, { recursive: true })
  await writeFile(resolve(evidenceDir, `d150-floors-${label}.json`), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ok: report.ok, failures: report.failures, overview: report.overview }, null, 2))
  if (!report.ok) process.exit(2)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
