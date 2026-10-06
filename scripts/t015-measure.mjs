#!/usr/bin/env node
/**
 * T015 自测：软件渲染判档、demand 续帧、D148 调用数、空闲 CPU/帧率、硬门禁、交互出画。
 * 用法：node scripts/t015-measure.mjs [baseUrl] [label]
 */
import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const here = dirname(fileURLToPath(import.meta.url))
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const label = process.argv[3] ?? 'head'
const outDir = process.env.ARTIFACT_DIR ?? '/opt/cursor/artifacts/t015'
const shotDir = process.env.SHOT_DIR ?? '/opt/cursor/artifacts/screenshots'

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

function gzipCompress9(buffer) {
  const result = spawnSync(
    'python3',
    ['-c', 'import gzip,sys; sys.stdout.buffer.write(gzip.compress(sys.stdin.buffer.read(), 9))'],
    { input: buffer, maxBuffer: 32 * 1024 * 1024 },
  )
  if (result.status !== 0) throw new Error(`gzip.compress(9) 失败：${result.stderr?.toString() || result.status}`)
  return result.stdout.length
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function chromeArgs() {
  return [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1366,768',
  ]
}

function childPids(rootPid) {
  const seen = new Set()
  const stack = [rootPid]
  while (stack.length) {
    const pid = stack.pop()
    if (!pid || seen.has(pid)) continue
    seen.add(pid)
    const out = spawnSync('ps', ['-o', 'pid=', '--ppid', String(pid)], { encoding: 'utf8' })
    if (out.status === 0) {
      for (const line of out.stdout.split('\n')) {
        const child = Number(line.trim())
        if (child) stack.push(child)
      }
    }
  }
  return [...seen]
}

function cpuTicks(pids) {
  let ticks = 0
  for (const pid of pids) {
    try {
      const stat = require('node:fs').readFileSync(`/proc/${pid}/stat`, 'utf8')
      const close = stat.lastIndexOf(')')
      const parts = stat.slice(close + 2).split(' ')
      ticks += Number(parts[11] ?? 0) + Number(parts[12] ?? 0)
    } catch {
      // 进程已退出
    }
  }
  return ticks
}

function clkTck() {
  const out = spawnSync('getconf', ['CLK_TCK'], { encoding: 'utf8' })
  const value = Number(out.stdout.trim())
  return value > 0 ? value : 100
}

async function sampleCpu(browser, seconds) {
  const proc = browser.process()
  const pid = proc?.pid
  if (!pid) return { cores: null, reason: 'no browser pid' }
  const hz = clkTck()
  const pids0 = childPids(pid)
  const t0 = cpuTicks(pids0)
  const wall0 = Date.now()
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
  const pids1 = childPids(pid)
  const t1 = cpuTicks(pids1)
  const wall = (Date.now() - wall0) / 1000
  const cores = wall > 0 ? (t1 - t0) / hz / wall : null
  return { cores, pids: pids1.length, seconds: wall }
}

async function launch() {
  return puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: chromeArgs(),
  })
}

async function waitReady(page, timeout = 90_000) {
  await page.waitForFunction(() => window.__twinReady === true, { timeout })
}

async function waitInvalidate(page) {
  await page.waitForFunction(() => typeof window.__twinInvalidate === 'function', { timeout: 30_000 })
  await page.evaluate(() => window.__twinInvalidate())
}

function attachConsole(page) {
  const items = []
  const onConsole = (msg) => items.push({ type: msg.type(), text: msg.text() })
  const onError = (error) => items.push({ type: 'pageerror', text: error.message })
  page.on('console', onConsole)
  page.on('pageerror', onError)
  return {
    items,
    count() {
      return {
        errors: items.filter((item) => item.type === 'error' || item.type === 'pageerror').length,
        warnings: items.filter((item) => item.type === 'warning').length,
      }
    },
    dispose() {
      page.off('console', onConsole)
      page.off('pageerror', onError)
    },
  }
}

function pixelChanged(a, b) {
  if (!a || !b || a.length !== b.length) return { changed: true, ratio: 1, reason: 'size-mismatch' }
  let n = 0
  let changed = 0
  for (let i = 0; i < a.length; i += 16) {
    const dr = Math.abs(a[i] - b[i])
    const dg = Math.abs(a[i + 1] - b[i + 1])
    const db = Math.abs(a[i + 2] - b[i + 2])
    n += 1
    if (Math.max(dr, dg, db) > 8) changed += 1
  }
  return { changed: changed / n > 0.002, ratio: changed / n }
}

async function screenshotPng(page, name) {
  await mkdir(shotDir, { recursive: true })
  const path = resolve(shotDir, name)
  await page.screenshot({ path, type: 'png' })
  return path
}

async function canvasPixels(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return null
    const ctx = document.createElement('canvas')
    ctx.width = canvas.width
    ctx.height = canvas.height
    const g = ctx.getContext('2d')
    g.drawImage(canvas, 0, 0)
    return {
      width: canvas.width,
      height: canvas.height,
      data: Array.from(g.getImageData(0, 0, canvas.width, canvas.height).data),
    }
  })
}

async function measureHardGate(browser, search) {
  const page = await browser.newPage()
  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  const bodies = new Map()
  page.on('response', async (response) => {
    const url = response.url()
    if (!url.startsWith(baseUrl)) return
    try {
      bodies.set(url, Buffer.from(await response.buffer()))
    } catch {
      // skip
    }
  })
  const requests = []
  page.on('request', (request) => {
    if (request.url().startsWith(baseUrl)) requests.push(request.url())
  })
  await page.goto(`${baseUrl}/${search}`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page)
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)))
  const timing = await page.evaluate(() => ({
    firstFrameAt: window.__twinFirstFrameAt ?? null,
    readyAt: window.__twinReadyAt ?? null,
    gpu: window.__twinGpu ?? null,
    resources: performance.getEntriesByType('resource').map((entry) => ({
      url: entry.name,
      startTime: entry.startTime,
      afterFirstFrame: window.__twinFirstFrameAt != null && entry.startTime > window.__twinFirstFrameAt,
    })),
  }))
  const files = [...bodies.entries()].map(([url, buffer]) => {
    const path = url.replace(baseUrl, '')
    const after = timing.resources.find((item) => item.url === url)?.afterFirstFrame
    return {
      path,
      gzip: gzipCompress9(buffer),
      afterFirstFrame: Boolean(after),
      hdr: /\.hdr(\?|$)/i.test(path),
      favicon: /favicon/i.test(path),
      balancedFx: /balancedFx/i.test(path),
      monitorSamples: /MonitorSamples/i.test(path),
    }
  })
  const firstScreen = files.filter((file) => !file.hdr && !file.favicon && !file.afterFirstFrame && !file.balancedFx && !file.monitorSamples)
  const hardGate = firstScreen.reduce((sum, file) => sum + file.gzip, 0)
  const balancedFx = requests.filter((url) => /balancedFx/i.test(url)).length
  await page.close()
  return {
    hardGate,
    balancedFxRequests: balancedFx,
    gpu: timing.gpu,
    readyAt: timing.readyAt,
    firstFrameAt: timing.firstFrameAt,
    files: firstScreen.map((file) => ({ path: file.path, gzip: file.gzip })),
  }
}

async function measureIdle(browser, search, seconds = 10) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  const consoles = attachConsole(page)
  await page.goto(`${baseUrl}/${search}`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page)
  await waitInvalidate(page)
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1500)))
  const start = await page.evaluate(() => ({
    count: window.__twinFrameCount ?? 0,
    at: performance.now(),
    gpu: window.__twinGpu ?? null,
  }))
  const cpu = await sampleCpu(browser, seconds)
  const end = await page.evaluate((started) => {
    const count = window.__twinFrameCount ?? 0
    const at = performance.now()
    return {
      count,
      at,
      fps: (count - started.count) / ((at - started.at) / 1000),
      gpu: window.__twinGpu ?? null,
    }
  }, start)
  const consoleCount = consoles.count()
  consoles.dispose()
  await page.close()
  return { fps: end.fps, frames: end.count - start.count, cpu, gpu: end.gpu, console: consoleCount }
}

async function measureCalls(page) {
  await waitInvalidate(page)
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 2000)))
  return page.evaluate(async () => {
    const values = []
    for (let i = 0; i < 60; i += 1) {
      await window.__twinInvalidate()
      values.push(window.__twinStats?.calls ?? null)
    }
    const nums = values.filter((value) => typeof value === 'number')
    const sorted = [...nums].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const medianCalls =
      sorted.length === 0 ? null : sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    return { medianCalls, min: sorted[0] ?? null, max: sorted.at(-1) ?? null, count: nums.length }
  })
}

async function measureDrag(browser, search) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  await page.goto(`${baseUrl}/${search}`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page)
  await waitInvalidate(page)
  const box = await page.$eval('canvas', (el) => {
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  const t0 = Date.now()
  const n0 = await page.evaluate(() => window.__twinFrameCount ?? 0)
  await page.mouse.move(box.x, box.y)
  await page.mouse.down()
  const cpu = await sampleCpu(browser, 2)
  for (let i = 0; i < 20; i += 1) {
    await page.mouse.move(box.x + i * 8, box.y)
  }
  await page.mouse.up()
  const n1 = await page.evaluate(() => window.__twinFrameCount ?? 0)
  const elapsed = Date.now() - t0
  const frames = n1 - n0
  const frameMs = frames > 0 ? elapsed / frames : null
  await page.close()
  return { cpu, frames, frameMs }
}

async function demandCases(browser) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  await page.goto(`${baseUrl}/?q=perf&view=floor&floor=F12`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page)
  await page.waitForFunction(() => window.__twinInterior?.renderedDesks > 0, { timeout: 45_000 }).catch(() => {})
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 800)))

  const results = {}
  const beforeSearch = await canvasPixels(page)
  await page.evaluate(() => {
    const device = (window.__twinDevices ?? []).find((item) => item.floorId === 'F12' && item.deskId)
    if (device) window.__twinFocusDevice?.({ floor: 'F12', deskId: device.deskId, deviceId: device.id })
  })
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)))
  const afterSearch = await canvasPixels(page)
  results.searchFly = pixelChanged(beforeSearch?.data, afterSearch?.data)

  const flashA = await canvasPixels(page)
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 600)))
  const flashB = await canvasPixels(page)
  results.alarmFlash = pixelChanged(flashA?.data, flashB?.data)

  await page.goto(`${baseUrl}/?q=balanced`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page)
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 800)))
  const beforeHover = await canvasPixels(page)
  await page.hover('[data-floor-id="F12"]')
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)))
  const afterHover = await canvasPixels(page)
  results.hover = pixelChanged(beforeHover?.data, afterHover?.data)

  const beforeFloor = await canvasPixels(page)
  await page.click('[data-floor-id="F12"]')
  await page.click('button[aria-label="视图：单层"]')
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)))
  const afterFloor = await canvasPixels(page)
  results.enterFloor = pixelChanged(beforeFloor?.data, afterFloor?.data)

  await page.waitForFunction(() => window.__twinView === 'floor', { timeout: 20_000 }).catch(() => {})
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1200)))
  const beforeExit = await canvasPixels(page)
  await page.click('button.back-button')
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)))
  const afterExit = await canvasPixels(page)
  results.exitFloor = pixelChanged(beforeExit?.data, afterExit?.data)

  await page.evaluate(() => window.__twinSetExploded?.(true))
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 900)))
  const badgesHidden = await page.evaluate(() => window.__twinBadges === 0)
  await page.evaluate(() => window.__twinSetExploded?.(false))
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 900)))
  const badgesShown = await page.evaluate(() => (window.__twinBadges ?? 0) > 0)
  results.labels = { pass: badgesHidden && badgesShown, badgesHidden, badgesShown }

  const beforeQ = await canvasPixels(page)
  await page.click('button[aria-label="画质：性能"]')
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)))
  const afterQ = await canvasPixels(page)
  results.qualitySwitch = pixelChanged(beforeQ?.data, afterQ?.data)

  const sizes = {}
  for (const width of [1024, 1440, 1920]) {
    await page.setViewport({ width, height: 768, deviceScaleFactor: 1 })
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)))
    const pix = await canvasPixels(page)
    sizes[width] = { width: pix?.width ?? null, height: pix?.height ?? null }
  }
  results.resize = {
    pass: sizes[1024].width !== sizes[1440].width && sizes[1440].width !== sizes[1920].width,
    sizes,
  }

  await page.close()
  return results
}

async function shots(browser) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  await page.goto(`${baseUrl}/`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page)
  await waitInvalidate(page)
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)))
  const overviewAuto = await screenshotPng(page, 't015_overview_auto.png')

  await page.goto(`${baseUrl}/?q=balanced`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page)
  await waitInvalidate(page)
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 800)))
  const overviewBalanced = await screenshotPng(page, 't015_overview_balanced.png')

  await page.goto(`${baseUrl}/?q=perf&view=floor&floor=F12`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page)
  await page.waitForFunction(() => window.__twinInterior?.renderedDesks > 0, { timeout: 45_000 }).catch(() => {})
  await waitInvalidate(page)
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 600)))
  const f12Alarm = await screenshotPng(page, 't015_f12_alarm.png')

  await page.goto(`${baseUrl}/?q=balanced&view=floor&floor=F12`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page)
  await page.waitForFunction(() => window.__twinInterior?.renderedDesks > 0, { timeout: 45_000 }).catch(() => {})
  await waitInvalidate(page)
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 800)))
  const f12Occ = await screenshotPng(page, 't015_f12_occlusion.png')
  await page.close()
  return { overviewAuto, overviewBalanced, f12Alarm, f12Occ }
}

async function once(kind) {
  const browser = await launch()
  try {
    if (kind === 'auto') {
      const gate = await measureHardGate(browser, '')
      const idle = await measureIdle(browser, '', 10)
      return { gate, idle }
    }
    if (kind === 'balanced') {
      const gate = await measureHardGate(browser, '?q=balanced')
      const calls = await (async () => {
        const page = await browser.newPage()
        await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
        await page.goto(`${baseUrl}/?q=balanced`, { waitUntil: 'load', timeout: 90_000 })
        await waitReady(page)
        const overview = await measureCalls(page)
        await page.click('[data-floor-id="F12"]')
        await page.click('button[aria-label="视图：单层"]')
        await page.waitForFunction(() => window.__twinView === 'floor' && window.__twinInterior?.renderedDesks > 0, {
          timeout: 45_000,
        })
        const f12 = await measureCalls(page)
        await page.goto(`${baseUrl}/?q=balanced&view=floor&floor=F22`, { waitUntil: 'load', timeout: 90_000 })
        await waitReady(page)
        await page.waitForFunction(() => window.__twinInterior?.renderedDesks > 0, { timeout: 45_000 }).catch(() => {})
        const f22 = await measureCalls(page)
        await page.close()
        return { overview, f12, f22 }
      })()
      const drag = await measureDrag(browser, '?q=balanced')
      return { gate, calls, drag }
    }
    if (kind === 'perf') {
      const idle = await measureIdle(browser, '?q=perf&view=floor&floor=F12', 8)
      const page = await browser.newPage()
      await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
      await page.goto(`${baseUrl}/?q=perf`, { waitUntil: 'load', timeout: 90_000 })
      await waitReady(page)
      const overview = await measureCalls(page)
      await page.goto(`${baseUrl}/?q=perf&view=floor&floor=F12`, { waitUntil: 'load', timeout: 90_000 })
      await waitReady(page)
      await page.waitForFunction(() => window.__twinInterior?.renderedDesks > 0, { timeout: 45_000 }).catch(() => {})
      const f12 = await measureCalls(page)
      await page.goto(`${baseUrl}/?q=perf&view=floor&floor=F22`, { waitUntil: 'load', timeout: 90_000 })
      await waitReady(page)
      await page.waitForFunction(() => window.__twinInterior?.renderedDesks > 0, { timeout: 45_000 }).catch(() => {})
      const f22 = await measureCalls(page)
      await page.close()
      const drag = await measureDrag(browser, '?q=perf')
      return { idle, calls: { overview, f12, f22 }, drag }
    }
    if (kind === 'demand') return { demand: await demandCases(browser), shots: await shots(browser) }
    return {}
  } finally {
    await browser.close()
  }
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const runs = []
  for (let i = 0; i < 3; i += 1) {
    console.error(`T015 run ${i + 1}/3`)
    const auto = await once('auto')
    const balanced = await once('balanced')
    const perf = await once('perf')
    runs.push({ auto, balanced, perf })
  }
  const demand = await once('demand')
  const report = {
    label,
    baseUrl,
    chromeArgs: chromeArgs(),
    median: {
      autoGpu: runs[0]?.auto.gate.gpu ?? null,
      autoBalancedFx: median(runs.map((run) => run.auto.gate.balancedFxRequests)),
      autoHardGate: median(runs.map((run) => run.auto.gate.hardGate)),
      balancedHardGate: median(runs.map((run) => run.balanced.gate.hardGate)),
      autoReady: median(runs.map((run) => run.auto.gate.readyAt).filter((v) => v != null)),
      balancedReady: median(runs.map((run) => run.balanced.gate.readyAt).filter((v) => v != null)),
      overviewIdleFps: median(runs.map((run) => run.auto.idle.fps)),
      overviewIdleCpu: median(runs.map((run) => run.auto.idle.cpu.cores).filter((v) => v != null)),
      f12IdleFps: median(runs.map((run) => run.perf.idle.fps)),
      f12IdleCpu: median(runs.map((run) => run.perf.idle.cpu.cores).filter((v) => v != null)),
      dragPerfFrameMs: median(runs.map((run) => run.perf.drag.frameMs).filter((v) => v != null)),
      dragPerfCpu: median(runs.map((run) => run.perf.drag.cpu.cores).filter((v) => v != null)),
      dragBalancedCpu: median(runs.map((run) => run.balanced.drag.cpu.cores).filter((v) => v != null)),
      calls: {
        overviewBalanced: median(runs.map((run) => run.balanced.calls.overview.medianCalls).filter((v) => v != null)),
        overviewPerf: median(runs.map((run) => run.perf.calls.overview.medianCalls).filter((v) => v != null)),
        f12Balanced: median(runs.map((run) => run.balanced.calls.f12.medianCalls).filter((v) => v != null)),
        f12Perf: median(runs.map((run) => run.perf.calls.f12.medianCalls).filter((v) => v != null)),
        f22Balanced: median(runs.map((run) => run.balanced.calls.f22.medianCalls).filter((v) => v != null)),
        f22Perf: median(runs.map((run) => run.perf.calls.f22.medianCalls).filter((v) => v != null)),
      },
      consoleErrors: median(runs.map((run) => run.auto.idle.console.errors)),
      consoleWarnings: median(runs.map((run) => run.auto.idle.console.warnings)),
    },
    demand: demand.demand,
    shots: demand.shots,
    runs,
  }
  const out = resolve(outDir, `t015-${label}.json`)
  await writeFile(out, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
