#!/usr/bin/env node
/**
 * T017 / D189：冷启动首次进 F1——打印机告警路径、楼层列表路径。
 * 记 __twinLabelPackMs 三段和最长单帧。A/B 同窗口交替。
 * 用法：node scripts/t017-label-pack-measure.mjs <urlA> <labelA> <urlB> <labelB>
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const here = dirname(fileURLToPath(import.meta.url))
const urlA = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const labelA = process.argv[3] ?? 't017'
const urlB = (process.argv[4] ?? 'http://127.0.0.1:5191').replace(/\/$/, '')
const labelB = process.argv[5] ?? 'ffb297c'
const outDir = process.env.ARTIFACT_DIR ?? resolve(here, '../docs/T017-evidence')
const shots = process.env.SCREENSHOT_DIR ?? '/opt/cursor/artifacts/screenshots'

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
  const executablePath = chromePath()
  if (!executablePath) throw new Error('找不到 Chrome')
  return puppeteer.launch({
    executablePath,
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

function injectBaselineTiming() {
  return `
    (function () {
      if (window.__twinLabelPackHook) return
      window.__twinLabelPackHook = true
      const empty = { sdf: 0, layout: 0, sync: 0, total: 0 }
      window.__twinLabelPackMs = { ...empty }
      const origNow = performance.now.bind(performance)
      const acc = { ...empty }
      window.__twinBeginLabelPack = function () {
        acc.sdf = acc.layout = acc.sync = acc.total = 0
        window.__twinLabelPackMs = { ...acc }
      }
      window.__twinAddLabelPack = function (sample) {
        acc.sdf += sample.sdf
        acc.layout += sample.layout
        acc.sync += sample.sync
        acc.total += sample.total
        window.__twinLabelPackMs = { ...acc }
      }
      const wrap = () => {
        const troika = window.__twinTroikaRef
        if (!troika?.preloadFont || troika.__twinWrapped) return
        troika.__twinWrapped = true
        const { preloadFont, Text, BatchedText } = troika
        const syncText = (text) => new Promise((resolve) => text.sync(() => resolve()))
        const origPreload = preloadFont
        troika.preloadFont = function (opts, cb) {
          const t0 = origNow()
          origPreload(opts, function () {
            window.__twinLastSdfWall = origNow() - t0
            cb && cb.apply(this, arguments)
          })
        }
        const origTextSync = Text.prototype.sync
        Text.prototype.sync = function (cb) {
          const t0 = origNow()
          return origTextSync.call(this, function () {
            window.__twinLastLayoutWall = (window.__twinLastLayoutWall || 0) + (origNow() - t0)
            cb && cb.apply(this, arguments)
          })
        }
        const origBatchSync = BatchedText.prototype.sync
        BatchedText.prototype.sync = function (cb) {
          const t0 = origNow()
          return origBatchSync.call(this, function () {
            const sync = origNow() - t0
            const sdf = window.__twinLastSdfWall || 0
            const layout = window.__twinLastLayoutWall || 0
            window.__twinLastSdfWall = 0
            window.__twinLastLayoutWall = 0
            window.__twinAddLabelPack({ sdf, layout, sync, total: sdf + layout + sync })
            cb && cb.apply(this, arguments)
          })
        }
      }
      const timer = setInterval(wrap, 50)
      setTimeout(() => clearInterval(timer), 60_000)
    })()
  `
}

async function attachFrameWatch(page) {
  await page.evaluate(() => {
    const frames = []
    let prev = performance.now()
    let active = true
    const tick = (now) => {
      if (!active) return
      frames.push({ at: now, dt: now - prev })
      prev = now
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    window.__t017Frames = {
      frames,
      stop() {
        active = false
      },
    }
  })
}

async function frameStats(page, since) {
  return page.evaluate((start) => {
    const all = (window.__t017Frames?.frames ?? []).filter((frame) => frame.at >= start)
    const dts = all.map((frame) => frame.dt)
    return {
      samples: dts.length,
      maxFrameMs: dts.length ? Math.max(...dts) : null,
      meanFrameMs: dts.length ? dts.reduce((sum, dt) => sum + dt, 0) / dts.length : null,
      p95FrameMs: dts.length ? dts.slice().sort((a, b) => a - b)[Math.floor(dts.length * 0.95)] : null,
    }
  }, since)
}

async function waitReady(page) {
  await page.waitForFunction(() => window.__twinReady === true && window.__twinFirstFrameAt != null, {
    timeout: 90_000,
  })
}

async function findPrinter(page) {
  return page.evaluate(() => {
    const devices = window.__twinDevices ?? []
    return (
      devices.find((device) => device.floorId === 'F1' && device.type === 'printer' && device.status === 'alarm') ??
      devices.find((device) => device.floorId === 'F1' && device.type === 'printer') ??
      null
    )
  })
}

async function runPath(browser, baseUrl, quality, pathKind, injectTiming) {
  const page = await browser.newPage()
  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  if (injectTiming) {
    await page.evaluateOnNewDocument(injectBaselineTiming())
  }
  const errors = []
  const warnings = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
    if (msg.type() === 'warning') warnings.push(msg.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))

  await page.goto(`${baseUrl}/?q=${quality}`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page)
  await attachFrameWatch(page)
  await page.evaluate(() => {
    window.__twinLabelPackMs = { sdf: 0, layout: 0, sync: 0, total: 0 }
    window.__twinBeginLabelPack?.()
  })

  const printer = await findPrinter(page)
  const started = await page.evaluate(() => performance.now())
  if (pathKind === 'alarm') {
    await page.evaluate(
      (target) => {
        window.__twinFocusDevice?.({
          floor: 'F1',
          deskId: target?.deskId ?? null,
          deviceId: target?.id ?? 'F1-PR1',
        })
      },
      printer,
    )
  } else {
    await page.evaluate(() => {
      document.querySelector('[data-floor-id="F1"]')?.click()
      window.__twinFocusDevice?.({ floor: 'F1', deskId: null, deviceId: null })
    })
  }

  await page
    .waitForFunction(
      () => window.__twinView === 'floor' && window.__twinSelected === 'F1' && window.__twinInterior?.floorId === 'F1',
      { timeout: 90_000 },
    )
    .catch(() => {})

  await page.waitForFunction(() => (window.__twinLabelMount?.done ?? true) === true || window.__twinLabelPackMs?.total > 0, {
    timeout: 20_000,
  }).catch(() => {})
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 2800)))

  const probe = await page.evaluate(() => ({
    pack: window.__twinLabelPackMs ?? null,
    mount: window.__twinLabelMount ?? null,
    interior: window.__twinInterior ?? null,
    view: window.__twinView ?? null,
    floor: window.__twinSelected ?? null,
    programs: window.__twinMemory?.programs ?? null,
    firstFrameAt: window.__twinFirstFrameAt ?? null,
    prewarmed: window.__twinPrewarmed === true,
  }))
  const frames = await frameStats(page, started)
  const shot = await page.screenshot({ encoding: 'binary' })
  await page.close()

  const priorityOnFirst =
    probe.mount?.priorityIds?.length && probe.mount?.firstBatchIds
      ? probe.mount.priorityIds.every((id) => probe.mount.firstBatchIds.includes(id))
      : null

  return {
    quality,
    path: pathKind,
    printer,
    ...probe,
    ...frames,
    priorityOnFirst,
    errors,
    warnings,
    load: loadavg(),
    shot,
  }
}

async function main() {
  const browser = await launch()
  const report = {
    createdAt: new Date().toISOString(),
    load: loadavg(),
    sides: { A: { url: urlA, label: labelA }, B: { url: urlB, label: labelB } },
    runs: [],
  }
  try {
    const plan = [
      ['A', urlA, labelA, 'balanced', 'alarm', false],
      ['B', urlB, labelB, 'balanced', 'alarm', true],
      ['A', urlA, labelA, 'balanced', 'list', false],
      ['B', urlB, labelB, 'balanced', 'list', true],
      ['A', urlA, labelA, 'perf', 'alarm', false],
      ['B', urlB, labelB, 'perf', 'alarm', true],
      ['A', urlA, labelA, 'perf', 'list', false],
      ['B', urlB, labelB, 'perf', 'list', true],
    ]
    for (const [side, url, label, quality, path, inject] of plan) {
      const result = await runPath(browser, url, quality, path, inject)
      const shotName = `t017-d189-${label}-${quality}-${path}.png`
      await mkdir(shots, { recursive: true })
      await writeFile(resolve(shots, shotName), result.shot)
      delete result.shot
      report.runs.push({ side, label, url, screenshot: shotName, ...result })
    }
  } finally {
    await browser.close()
  }

  await mkdir(outDir, { recursive: true })
  const jsonPath = resolve(outDir, 't017-d189-ab.json')
  await writeFile(jsonPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  console.log(`wrote ${jsonPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
