#!/usr/bin/env node
/**
 * D150：D148 口径拆 shadow/main，按组件归因。
 * 用法：node scripts/d150-attrib.mjs [baseUrl] [label] [floors=F12,F22]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const label = process.argv[3] ?? 'current'
const floors = (process.argv[4] ?? 'F12,F22').split(',').map((id) => id.trim())
const injectPath = process.env.INJECT_JS ?? '/home/ubuntu/.cursor/projects/workspace/uploads/inject_3efd.js'
const evidenceDir = resolve(process.cwd(), 'docs/T012-evidence')

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

const GROUPS = [
  ['RoomLabels', /RoomLabels/],
  ['CorridorPeople', /CorridorPeople|HumanArmature|people/i],
  ['DeviceBadges', /DeviceBadges/],
  ['FloorBadges', /FloorBadges|BadgeDigit|AlarmMarker/],
  ['WorkstationMonitors', /WorkstationMonitors/],
  ['WorkstationDesks', /WorkstationDesks/],
  ['WorkstationChairs', /WorkstationChairs/],
  ['FloorCores', /FloorCores/],
  ['FloorColumns', /FloorColumns/],
  ['FloorWalls', /FloorWalls/],
  ['FloorGlass', /FloorGlass/],
  ['FloorSlab', /FloorSlab|FloorPlate/],
  ['OfficeDesks', /OfficeDesks/],
  ['FloorCeiling', /FloorCeiling|Ceiling/],
  ['JsonFloorInterior', /FloorInterior/],
  ['TowerInterior', /TowerInterior/],
  ['EastBlock', /EastBlock/],
  ['Podium', /Podium/],
  ['Trees', /tree_/i],
  ['unnamed', /^\(unnamed\)$|^$/],
]

function summarizeRows(rows) {
  const byPath = new Map()
  for (const row of rows) {
    const key = `${row.pass}:${row.path}`
    const prev = byPath.get(key) ?? { path: row.path, pass: row.pass, calls: 0, tris: 0 }
    prev.calls += row.calls
    prev.tris += row.tris
    byPath.set(key, prev)
  }
  return [...byPath.values()].sort((a, b) => b.calls - a.calls)
}

function groupRows(rows) {
  const groups = {}
  const unused = rows.map((row) => ({ ...row }))
  for (const [name, pattern] of GROUPS) {
    const shadow = unused.filter((row) => row.pass === 'shadow' && pattern.test(row.path))
    const main = unused.filter((row) => row.pass === 'main' && pattern.test(row.path))
    const used = new Set([...shadow, ...main])
    for (const row of used) {
      const idx = unused.indexOf(row)
      if (idx >= 0) unused.splice(idx, 1)
    }
    const s = shadow.reduce((sum, row) => sum + row.calls, 0)
    const m = main.reduce((sum, row) => sum + row.calls, 0)
    if (s || m) groups[name] = { shadow: s, main: m, total: s + m }
  }
  const restS = unused.filter((row) => row.pass === 'shadow').reduce((sum, row) => sum + row.calls, 0)
  const restM = unused.filter((row) => row.pass === 'main').reduce((sum, row) => sum + row.calls, 0)
  if (restS || restM) groups.other = { shadow: restS, main: restM, total: restS + restM, paths: unused.slice(0, 12) }
  return groups
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

async function attribFrame(page) {
  return page.evaluate(async () => {
    const P = window.__perf
    P.attrib.requested = true
    const waitStart = performance.now()
    while (!P.attrib.done && performance.now() - waitStart < 2500) {
      await new Promise((resolve) => setTimeout(resolve, 16))
    }
    return { frameCalls: P.attrib.frameCalls ?? null, rows: P.attrib.done ?? [] }
  })
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
        collected.push({ t: last.t, calls: last.calls, tris: last.tris })
        lastT = last.t
      }
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
    const values = collected.map((frame) => frame.calls)
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const medianCalls =
      sorted.length === 0 ? null : sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    return {
      count: collected.length,
      medianCalls,
      minCalls: sorted[0] ?? null,
      maxCalls: sorted.at(-1) ?? null,
    }
  })
}

async function measureOverview(page, quality) {
  await page.goto(`${baseUrl}/?q=${quality}`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page, quality)
  const steady = await collectSteady60(page)
  const attrib = await attribFrame(page)
  const rows = summarizeRows(attrib.rows)
  return {
    quality,
    view: 'overview',
    steadyMedian: steady.medianCalls,
    limit: (steady.medianCalls ?? 0) + 50,
    gate: (steady.medianCalls ?? 0) + 50 - 5,
    shadow: rows.filter((row) => row.pass === 'shadow').reduce((sum, row) => sum + row.calls, 0),
    main: rows.filter((row) => row.pass === 'main').reduce((sum, row) => sum + row.calls, 0),
    groups: groupRows(rows),
    top: rows.slice(0, 16),
  }
}

async function measureFloor(page, quality, floorId) {
  await page.goto(`${baseUrl}/?q=${quality}&view=floor&floor=${floorId}`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page, quality)
  await page
    .waitForFunction(
      (id) =>
        window.__twinView === 'floor' ||
        window.__twinSelected === id ||
        document.querySelector('.scene-root')?.dataset.view === 'floor' ||
        (window.__twinInterior?.floorId === id),
      { timeout: 45_000 },
      floorId,
    )
    .catch(() => {})
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 3500)))
  const steady = await collectSteady60(page)
  const attrib = await attribFrame(page)
  const rows = summarizeRows(attrib.rows)
  return {
    quality,
    floorId,
    desks: await page.evaluate(() => window.__twinInterior?.renderedDesks ?? 0),
    monitors: await page.evaluate(() => Boolean(window.__twinScene?.getObjectByName?.('WorkstationMonitors') || window.__perf?.scenes?.[0]?.getObjectByName('WorkstationMonitors'))),
    slotsHint: await page.evaluate(() => window.__twinMonitorBoxes ?? null),
    steadyMedian: steady.medianCalls,
    shadow: rows.filter((row) => row.pass === 'shadow').reduce((sum, row) => sum + row.calls, 0),
    main: rows.filter((row) => row.pass === 'main').reduce((sum, row) => sum + row.calls, 0),
    roomLabels: rows.filter((row) => row.pass === 'main' && row.path.includes('RoomLabels')).reduce((sum, row) => sum + row.calls, 0),
    corridorPeople: rows.filter((row) => row.pass === 'main' && /CorridorPeople|HumanArmature|people/i.test(row.path)).reduce((sum, row) => sum + row.calls, 0),
    groups: groupRows(rows),
    top: rows.slice(0, 20),
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
  const report = { method: 'D148-attrib', label, baseUrl, views: {} }
  for (const quality of ['balanced']) {
    const overviewPage = await browser.newPage()
    await overviewPage.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
    await overviewPage.evaluateOnNewDocument(inject)
    report.views[`overview-${quality}`] = await measureOverview(overviewPage, quality)
    console.error(`overview-${quality} ${report.views[`overview-${quality}`].steadyMedian}`)
    await overviewPage.close()
    for (const floorId of floors) {
      const page = await browser.newPage()
      await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
      await page.evaluateOnNewDocument(inject)
      const key = `${floorId}-${quality}`
      report.views[key] = await measureFloor(page, quality, floorId)
      const row = report.views[key]
      row.overviewSteady = report.views[`overview-${quality}`].steadyMedian
      row.limit = report.views[`overview-${quality}`].limit
      row.gate = report.views[`overview-${quality}`].gate
      row.pass = row.steadyMedian != null && row.gate != null ? row.steadyMedian <= row.gate : false
      console.error(`${key} steady=${row.steadyMedian} shadow=${row.shadow} main=${row.main} pass=${row.pass}`)
      await page.close()
    }
  }
  await browser.close()
  await mkdir(evidenceDir, { recursive: true })
  await writeFile(resolve(evidenceDir, `d150-attrib-${label}.json`), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
