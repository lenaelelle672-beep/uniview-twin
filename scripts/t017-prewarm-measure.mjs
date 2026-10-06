#!/usr/bin/env node
/**
 * T017 / D188 自测：预热后进 F12→F22→F18→F3→F1，记 programs 增量和最长单帧。
 * 用法：node scripts/t017-prewarm-measure.mjs [baseUrl] [label]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const here = dirname(fileURLToPath(import.meta.url))
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const label = process.argv[3] ?? 't017'
const outDir = process.env.ARTIFACT_DIR ?? resolve(here, '../docs/T017-evidence')
const HARD_GATE = 435_664
const waitPrewarm = process.env.T017_WAIT_PREWARM !== '0'

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

function gzipCompress9(buffer) {
  const result = spawnSync(
    'python3',
    ['-c', 'import gzip,sys; sys.stdout.buffer.write(gzip.compress(sys.stdin.buffer.read(), 9))'],
    { input: buffer, maxBuffer: 32 * 1024 * 1024 },
  )
  if (result.status !== 0) throw new Error('gzip.compress(9) 失败')
  return result.stdout.length
}

function chromeArgs() {
  return [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
    '--window-size=1366,768',
  ]
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
    args: chromeArgs(),
  })
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
    window.__t017Frames = { frames, stop() { active = false } }
  })
}

async function frameStats(page, since) {
  return page.evaluate((start) => {
    const all = (window.__t017Frames?.frames ?? []).filter((frame) => frame.at >= start)
    const dts = all.map((frame) => frame.dt)
    const max = dts.length ? Math.max(...dts) : null
    let stableAt = null
    for (let i = 0; i < dts.length; i += 1) {
      const slice = dts.slice(i, i + 8)
      if (slice.length === 8 && slice.every((dt) => dt < 50)) {
        stableAt = all[i].at
        break
      }
    }
    return {
      samples: dts.length,
      maxFrameMs: max,
      meanFrameMs: dts.length ? dts.reduce((sum, dt) => sum + dt, 0) / dts.length : null,
      settleMs: stableAt != null ? stableAt - start : null,
    }
  }, since)
}

async function pageState(page) {
  return page.evaluate(() => {
    const resources = performance.getEntriesByType('resource').map((entry) => ({
      url: entry.name,
      startTime: entry.startTime,
      responseEnd: 'responseEnd' in entry ? entry.responseEnd : 0,
    }))
    const textRuntime = resources.find((entry) => entry.url.includes('textRuntime'))
    const woff = resources.find((entry) => /NotoSansSC-Regular-subset\.woff/i.test(entry.url))
    return {
      ready: window.__twinReady === true,
      firstFrameAt: window.__twinFirstFrameAt ?? null,
      prewarmed: window.__twinPrewarmed === true,
      prewarm: window.__twinPrewarm ?? null,
      view: window.__twinView ?? null,
      floor: window.__twinSelected ?? null,
      programs: window.__twinMemory?.programs ?? null,
      calls: window.__twinStats?.calls ?? null,
      composerLive: window.__twinComposerLive === true,
      resources,
      textRuntimeStart: textRuntime?.startTime ?? null,
      woffStart: woff?.startTime ?? null,
      woffAfterTextRuntime:
        textRuntime != null && woff != null ? woff.startTime >= textRuntime.responseEnd : null,
    }
  })
}

async function waitReady(page) {
  await page.waitForFunction(() => window.__twinReady === true && window.__twinFirstFrameAt != null, {
    timeout: 90_000,
  })
}

async function waitPrewarmed(page) {
  await page.waitForFunction(() => window.__twinPrewarmed === true, { timeout: 180_000 })
}

async function enterFloor(page, floor, deskId = null, deviceId = null) {
  const started = await page.evaluate(() => performance.now())
  const programsBefore = await page.evaluate(() => window.__twinMemory?.programs ?? 0)
  await page.evaluate(
    (target) => {
      window.__twinFocusDevice?.(target)
    },
    { floor, deskId, deviceId },
  )
  await page
    .waitForFunction(
      (id) => window.__twinView === 'floor' && window.__twinSelected === id && window.__twinInterior?.floorId === id,
      { timeout: 90_000 },
      floor,
    )
    .catch(() => {})
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 2500)))
  const programsAfter = await page.evaluate(() => window.__twinMemory?.programs ?? 0)
  const frames = await frameStats(page, started)
  return {
    floor,
    deskId,
    deviceId,
    programsBefore,
    programsAfter,
    programDelta: programsAfter - programsBefore,
    ...frames,
  }
}

async function findAlarmTarget(page, floor, kind) {
  return page.evaluate(
    (want) => {
      const devices = window.__twinDevices ?? []
      if (want.kind === 'printer') {
        return devices.find((device) => device.floorId === want.floor && device.type === 'printer' && device.status === 'alarm') ?? null
      }
      return devices.find((device) => device.deskId === `${want.floor}-1` && device.status === 'alarm') ?? devices[0] ?? null
    },
    { floor, kind },
  )
}

async function measureHardGate(browser, quality) {
  const page = await browser.newPage()
  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  const bodies = new Map()
  const external = []
  page.on('response', async (response) => {
    const url = response.url()
    if (!url.startsWith(baseUrl)) {
      external.push(url)
      return
    }
    try {
      bodies.set(url, Buffer.from(await response.buffer()))
    } catch {
      // ignore
    }
  })
  const errors = []
  const warnings = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
    if (msg.type() === 'warning') warnings.push(msg.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))

  await page.goto(`${baseUrl}/?q=${quality}`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page)
  const timing = await page.evaluate(() => {
    const first = window.__twinFirstFrameAt
    return {
      firstFrameAt: first,
      resources: performance.getEntriesByType('resource').map((entry) => ({
        url: entry.name,
        startTime: entry.startTime,
        afterFirstFrame: first != null && entry.startTime > first,
      })),
    }
  })
  const afterByUrl = new Map(timing.resources.map((entry) => [entry.url, entry.afterFirstFrame]))
  const files = [...bodies.entries()].map(([url, buffer]) => {
    const path = url.replace(baseUrl, '')
    return {
      url: path,
      gzip: gzipCompress9(buffer),
      afterFirstFrame: Boolean(afterByUrl.get(url)),
      hdr: /\.hdr(\?|$)/i.test(path),
      favicon: /favicon/i.test(path),
      balancedFx: /balancedFx/i.test(path),
      monitorSamples: /MonitorSamples/i.test(path),
    }
  })
  const firstScreen = files.filter(
    (file) => !file.hdr && !file.favicon && !file.afterFirstFrame && !file.balancedFx && !file.monitorSamples,
  )
  const hardGate = firstScreen.reduce((sum, file) => sum + file.gzip, 0)
  await page.close()
  return { quality, hardGate, files: firstScreen.map((file) => file.url), errors, warnings, external }
}

async function measureTour(browser, quality, { early } = { early: false }) {
  const page = await browser.newPage()
  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  const errors = []
  const warnings = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
    if (msg.type() === 'warning') warnings.push(msg.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))

  const client = await page.createCDPSession()
  await client.send('Performance.enable')
  await page.goto(`${baseUrl}/?q=${quality}`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page)
  await attachFrameWatch(page)

  if (early) {
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 800)))
  } else if (waitPrewarm) {
    await waitPrewarmed(page).catch(() => {})
  } else {
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 8000)))
  }

  const before = await pageState(page)
  const khr = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl')
    return Boolean(gl?.getExtension('KHR_parallel_shader_compile'))
  })

  const f12 = await enterFloor(page, 'F12')
  const f22 = await enterFloor(page, 'F22')
  const f18 = await enterFloor(page, 'F18', 'F18-1')
  const f3Target = await findAlarmTarget(page, 'F3', 'desk')
  const f3 = await enterFloor(page, 'F3', f3Target?.deskId ?? 'F3-1', f3Target?.id ?? null)
  const printer = await findAlarmTarget(page, 'F1', 'printer')
  const f1 = await enterFloor(page, 'F1', printer?.deskId ?? null, printer?.id ?? null)
  const after = await pageState(page)
  const metrics = await client.send('Performance.getMetrics')
  const screenshot = await page.screenshot({ encoding: 'binary' })
  await page.close()
  return {
    quality,
    early,
    load: loadavg(),
    khrParallelShaderCompile: khr,
    before,
    after,
    stops: { f12, f22, f18, f3, f1 },
    metrics: Object.fromEntries(metrics.metrics.map((item) => [item.name, item.value])),
    errors,
    warnings,
    screenshot,
  }
}

async function main() {
  const browser = await launch()
  const report = {
    label,
    baseUrl,
    waitPrewarm,
    load: loadavg(),
    hardGateLimit: HARD_GATE,
    createdAt: new Date().toISOString(),
  }
  try {
    report.hardGate = {
      balanced: await measureHardGate(browser, 'balanced'),
      perf: await measureHardGate(browser, 'perf'),
    }
    report.balanced = await measureTour(browser, 'balanced', { early: false })
    report.perf = await measureTour(browser, 'perf', { early: false })
    report.balancedEarly = await measureTour(browser, 'balanced', { early: true })
    report.perfEarly = await measureTour(browser, 'perf', { early: true })
  } finally {
    await browser.close()
  }

  await mkdir(outDir, { recursive: true })
  const shots = process.env.SCREENSHOT_DIR ?? '/opt/cursor/artifacts/screenshots'
  await mkdir(shots, { recursive: true })
  for (const [name, tour] of [
    ['balanced-f1', report.balanced],
    ['perf-f1', report.perf],
  ]) {
    if (tour?.screenshot) {
      await writeFile(resolve(shots, `t017-${label}-${name}.png`), tour.screenshot)
      delete tour.screenshot
    }
  }
  delete report.balancedEarly?.screenshot
  delete report.perfEarly?.screenshot
  const jsonPath = resolve(outDir, `t017-${label}.json`)
  await writeFile(jsonPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  console.log(`wrote ${jsonPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
