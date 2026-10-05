#!/usr/bin/env node
/**
 * D148：门禁看稳态——楼层动画结束后停 2s，再取连续 60 帧整帧调用数中位数（inject.js）。
 * 峰值只报：从点进楼层到动画结束的单帧最大，并标阶段（进场动画 / 标签同步 / 爆炸视图）。
 * 上限 = 同档总览稳态 + 50。RoomLabels 单列。inject 只从 INJECT_JS 读，不进仓库。
 */
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const injectPath =
  process.env.INJECT_JS ?? '/home/ubuntu/.cursor/projects/workspace/uploads/inject_3efd.js'

function chromePath() {
  return (
    process.env.CHROME_PATH ??
    ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((path) => {
      try {
        require('node:fs').accessSync(path)
        return true
      } catch {
        return null
      }
    })
  )
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

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

function prefixCalls(rows, prefix, pass) {
  return rows.filter((row) => row.pass === pass && row.path.includes(prefix)).reduce((sum, row) => sum + row.calls, 0)
}

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

async function attribFrame(page) {
  return page.evaluate(async () => {
    const P = window.__perf
    P.attrib.requested = true
    const waitStart = performance.now()
    while (!P.attrib.done && performance.now() - waitStart < 2500) {
      await new Promise((resolve) => setTimeout(resolve, 16))
    }
    return {
      frameCalls: P.attrib.frameCalls ?? null,
      rows: P.attrib.done ?? [],
    }
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
      lastRenderCalls: window.__twinStats?.calls ?? null,
      samples: collected,
    }
  })
}

async function measureOverview(page, quality) {
  const consoles = []
  const onConsole = (msg) => consoles.push({ type: msg.type(), text: msg.text() })
  const onError = (error) => consoles.push({ type: 'pageerror', text: error.message })
  page.on('console', onConsole)
  page.on('pageerror', onError)

  await page.goto(`${baseUrl}/?q=${quality}`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page, quality)
  const steady = await collectSteady60(page)
  const attrib = await attribFrame(page)
  const rows = summarizeRows(attrib.rows)

  page.off('console', onConsole)
  page.off('pageerror', onError)

  return {
    quality,
    view: 'overview',
    steadyMedian: steady.medianCalls,
    steadyMin: steady.minCalls,
    steadyMax: steady.maxCalls,
    steadyCount: steady.count,
    lastRenderCalls: steady.lastRenderCalls,
    roomLabels: prefixCalls(rows, 'RoomLabels', 'main'),
    limit: (steady.medianCalls ?? 0) + 50,
    glProbe: await page.evaluate(() => window.__twinGlProbe ?? null),
    console: {
      errors: consoles.filter((item) => item.type === 'error' || item.type === 'pageerror').length,
      warnings: consoles.filter((item) => item.type === 'warning').length,
      blit: consoles.filter((item) => /glBlitFramebuffer|Depth\/stencil/i.test(item.text)).length,
    },
  }
}

async function measureEnterFloor(page, quality, floorId) {
  const consoles = []
  const onConsole = (msg) => consoles.push({ type: msg.type(), text: msg.text() })
  const onError = (error) => consoles.push({ type: 'pageerror', text: error.message })
  page.on('console', onConsole)
  page.on('pageerror', onError)

  await page.goto(`${baseUrl}/?q=${quality}`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page, quality)
  await page.waitForSelector(`[data-floor-id="${floorId}"]`, { timeout: 30_000 })
  await page.waitForSelector('button[aria-label="视图：单层"]', { timeout: 15_000 })

  await page.evaluate(() => {
    window.__d148 = { clickAt: performance.now(), stamps: [] }
  })

  const clickAt = await page.evaluate(() => window.__d148.clickAt)
  await page.click(`[data-floor-id="${floorId}"]`)
  await page.click('button[aria-label="视图：单层"]')

  const enter = await page.evaluate(
    async (id, wantPeople) => {
      const P = window.__perf
      const stamps = window.__d148.stamps
      const deadline = performance.now() + 45_000
      let doneAt = null
      let lastT = -1
      while (performance.now() < deadline) {
        const last = P.frames.at(-1)
        const scene = P.scenes?.[0]
        const labels = Boolean(scene?.getObjectByName('RoomLabels'))
        const people = Boolean(scene?.getObjectByName('CorridorPeople'))
        const desks = window.__twinInterior?.renderedDesks ?? 0
        const explode = window.__twinExplode?.progress ?? 0
        const slab = window.__twinSlab?.floorId ?? null
        const snap = {
          t: last?.t ?? performance.now(),
          calls: last?.calls ?? null,
          labels,
          people,
          desks,
          view: window.__twinView ?? null,
          selected: window.__twinSelected ?? null,
          explode,
          slab,
        }
        if (last && last.t > lastT) {
          stamps.push(snap)
          lastT = last.t
        }
        const settled =
          snap.view === 'floor' &&
          snap.selected === id &&
          desks >= 80 &&
          labels &&
          (!wantPeople || people) &&
          slab === id &&
          (explode <= 0.01 || explode >= 0.99)
        if (settled && doneAt == null) doneAt = performance.now()
        // 标签同步算进场动画的一部分：物体挂上后再录至少 20 帧，避免峰值漏掉 troika 出字。
        if (settled && stamps.filter((item) => item.labels).length >= 20) break
        await new Promise((resolve) => requestAnimationFrame(resolve))
      }
      return {
        clickAt: window.__d148.clickAt,
        doneAt,
        stamps,
      }
    },
    floorId,
    quality !== 'perf',
  )

  if (!enter.doneAt) {
    throw new Error(`${quality} ${floorId} 楼层动画未在 45s 内结束`)
  }

  const peakStamps = enter.stamps.filter((snap) => snap.calls != null && snap.t >= clickAt)
  let peak = null
  for (const snap of peakStamps) {
    if (!peak || snap.calls > peak.calls) {
      peak = {
        calls: snap.calls,
        t: snap.t,
        phase: classifyPhase(snap),
        labelsPresent: snap.labels,
        desks: snap.desks,
        explode: snap.explode,
      }
    }
  }

  const steady = await collectSteady60(page)
  const attrib = await attribFrame(page)
  const rows = summarizeRows(attrib.rows)
  const roomLabels = prefixCalls(rows, 'RoomLabels', 'main')
  const shadow = rows.filter((row) => row.pass === 'shadow').reduce((sum, row) => sum + row.calls, 0)
  const main = rows.filter((row) => row.pass === 'main').reduce((sum, row) => sum + row.calls, 0)

  page.off('console', onConsole)
  page.off('pageerror', onError)

  return {
    quality,
    floorId,
    animMs: enter.doneAt != null ? Math.round(enter.doneAt - enter.clickAt) : null,
    peakCalls: peak?.calls ?? null,
    peakPhase: peak?.phase ?? null,
    peak: peak,
    steadyMedian: steady.medianCalls,
    steadyMin: steady.minCalls,
    steadyMax: steady.maxCalls,
    steadyCount: steady.count,
    lastRenderCalls: steady.lastRenderCalls,
    roomLabels,
    minusLabels: steady.medianCalls != null ? steady.medianCalls - roomLabels : null,
    shadow,
    main,
    corridorPeople: prefixCalls(rows, 'CorridorPeople', 'main'),
    top: rows.slice(0, 12),
    glProbe: await page.evaluate(() => window.__twinGlProbe ?? null),
    console: {
      errors: consoles.filter((item) => item.type === 'error' || item.type === 'pageerror').length,
      warnings: consoles.filter((item) => item.type === 'warning').length,
      blit: consoles.filter((item) => /glBlitFramebuffer|Depth\/stencil/i.test(item.text)).length,
      items: consoles.filter((item) => item.type === 'error' || item.type === 'warning').slice(0, 8),
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

  const report = { method: 'D148', views: {}, overview: {} }
  for (const quality of ['balanced', 'perf']) {
    const overviewPage = await browser.newPage()
    await overviewPage.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
    await overviewPage.evaluateOnNewDocument(inject)
    report.overview[quality] = await measureOverview(overviewPage, quality)
    await overviewPage.close()
    console.error(
      `overview-${quality} steady=${report.overview[quality].steadyMedian} limit=${report.overview[quality].limit} blit=${report.overview[quality].console.blit}`,
    )

    const floorPage = await browser.newPage()
    await floorPage.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
    await floorPage.evaluateOnNewDocument(inject)
    const key = `f12-${quality}`
    report.views[key] = await measureEnterFloor(floorPage, quality, 'F12')
    const row = report.views[key]
    row.overviewSteady = report.overview[quality].steadyMedian
    row.limit = report.overview[quality].limit
    row.pass = row.steadyMedian != null && row.limit != null ? row.steadyMedian <= row.limit : false
    await floorPage.close()
    console.error(
      `${key} steady=${row.steadyMedian} peak=${row.peakCalls} phase=${row.peakPhase} labels=${row.roomLabels} minus=${row.minusLabels} limit=${row.limit} pass=${row.pass} blit=${row.console.blit}`,
    )
  }

  await browser.close()
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
