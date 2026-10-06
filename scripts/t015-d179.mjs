#!/usr/bin/env node
/**
 * T015 / D178 / D179 自测。
 * 空闲与 7 项出画：不调 __twinInvalidate、不额外动鼠标。
 * 调用数：每帧前 await __twinInvalidate()。
 * CPU：CDP SystemInfo 本页 renderer + gpu 的 cpuTime 增量 / 墙钟。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const base = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const label = process.argv[3] ?? 'head'
const outDir = process.env.ARTIFACT_DIR ?? '/opt/cursor/artifacts/t015'

const chromeArgs = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--window-size=1366,768',
]

function chromePath() {
  return process.env.CHROME_PATH ?? '/usr/local/bin/google-chrome'
}

function median(xs) {
  const a = xs.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((x, y) => x - y)
  if (!a.length) return null
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

async function launch() {
  return puppeteer.launch({ executablePath: chromePath(), headless: true, args: chromeArgs })
}

async function waitReady(page) {
  await page.waitForFunction(() => window.__twinReady === true, { timeout: 90_000 })
}

async function waitLoop(page) {
  await page.waitForFunction(() => window.__twinFirstFrameAt != null, { timeout: 30_000 })
  await page.waitForFunction(() => window.__twinSchedule != null || window.__twinGlFrame != null, { timeout: 15_000 }).catch(() => {})
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)))
}

async function pageCpuCores(page, seconds) {
  const client = await page.createCDPSession()
  let before
  try {
    before = await client.send('SystemInfo.getProcessInfo')
  } catch {
    return { cores: null, reason: 'no SystemInfo.getProcessInfo' }
  }
  await new Promise((r) => setTimeout(r, seconds * 1000))
  const after = await client.send('SystemInfo.getProcessInfo')
  const pick = (info) => {
    const rows = info.processInfo ?? info
    const list = Array.isArray(rows) ? rows : []
    const gpu = list.filter((p) => /gpu/i.test(p.type ?? ''))
    const renderer = list.filter((p) => /renderer|tab/i.test(p.type ?? ''))
    return [...gpu, ...renderer]
  }
  const mapTime = (list) => {
    const m = new Map()
    for (const p of list) m.set(p.id ?? p.pid, p.cpuTime ?? 0)
    return m
  }
  const a = pick(after)
  const b = mapTime(pick(before))
  let delta = 0
  for (const p of a) delta += (p.cpuTime ?? 0) - (b.get(p.id ?? p.pid) ?? 0)
  return { cores: delta / seconds, processes: a.map((p) => ({ type: p.type, id: p.id, cpuTime: p.cpuTime })) }
}

async function sampleIdle(page, seconds, hide = false) {
  await waitReady(page)
  await waitLoop(page)
  if (hide) {
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.evaluate(() => new Promise((r) => setTimeout(r, 200)))
  }
  const start = await page.evaluate(() => ({
    gl: window.__twinGlFrame ?? window.__twinStats?.frame ?? 0,
    count: window.__twinFrameCount ?? 0,
    at: performance.now(),
    schedule: window.__twinSchedule ?? null,
    gpu: window.__twinGpu ?? null,
  }))
  const cpu = await pageCpuCores(page, seconds)
  const end = await page.evaluate((t0) => {
    const at = performance.now()
    const sec = (at - t0.at) / 1000
    const gl = window.__twinGlFrame ?? window.__twinStats?.frame ?? 0
    const count = window.__twinFrameCount ?? 0
    return {
      gl,
      count,
      sec,
      glFps: (gl - t0.gl) / sec,
      useFrameFps: (count - t0.count) / sec,
      schedule: window.__twinSchedule ?? null,
      gpu: window.__twinGpu ?? null,
    }
  }, start)
  return { ...end, expectedHz: start.schedule?.hz ?? end.schedule?.hz ?? null, cpu: cpu.cores, cpuDetail: cpu, hidden: hide }
}

function pixChanged(a, b) {
  if (!a || !b || a.length !== b.length) return { pass: false, ratio: 1 }
  let n = 0
  let ch = 0
  for (let i = 0; i < a.length; i += 16) {
    n += 1
    if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 8) ch += 1
  }
  return { pass: ch / n > 0.002, ratio: +(ch / n).toFixed(4) }
}

async function canvasPix(page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas')
    if (!c) return null
    const o = document.createElement('canvas')
    o.width = c.width
    o.height = c.height
    const g = o.getContext('2d')
    g.drawImage(c, 0, 0)
    return { w: c.width, h: c.height, d: Array.from(g.getImageData(0, 0, c.width, c.height).data) }
  })
}

async function demandVisual(browser) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  await page.goto(`${base}/?q=perf&view=floor&floor=F12`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page)
  await page.waitForFunction(() => (window.__twinInterior?.renderedDesks ?? 0) > 0, { timeout: 45_000 }).catch(() => {})
  await waitLoop(page)
  await page.evaluate(() => new Promise((r) => setTimeout(r, 800)))

  const a0 = await canvasPix(page)
  await page.evaluate(() => {
    const d = (window.__twinDevices ?? []).find((x) => x.floorId === 'F12' && x.deskId)
    if (d) window.__twinFocusDevice?.({ floor: 'F12', deskId: d.deskId, deviceId: d.id })
  })
  await page.evaluate(() => new Promise((r) => setTimeout(r, 500)))
  const a1 = await canvasPix(page)

  const f0 = await canvasPix(page)
  await page.evaluate(() => new Promise((r) => setTimeout(r, 600)))
  const f1 = await canvasPix(page)

  await page.goto(`${base}/?q=balanced`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page)
  await waitLoop(page)
  await page.evaluate(() => new Promise((r) => setTimeout(r, 800)))
  const h0 = await canvasPix(page)
  await page.hover('[data-floor-id="F12"]')
  await page.evaluate(() => new Promise((r) => setTimeout(r, 500)))
  const h1 = await canvasPix(page)

  const e0 = await canvasPix(page)
  await page.click('[data-floor-id="F12"]')
  await page.click('button[aria-label="视图：单层"]')
  await page.evaluate(() => new Promise((r) => setTimeout(r, 500)))
  const e1 = await canvasPix(page)
  await page.waitForFunction(() => window.__twinView === 'floor', { timeout: 20_000 }).catch(() => {})
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1500)))
  const x0 = await canvasPix(page)
  await page.click('button.back-button')
  await page.evaluate(() => new Promise((r) => setTimeout(r, 500)))
  const x1 = await canvasPix(page)

  await page.evaluate(() => window.__twinSetExploded?.(true))
  await page.evaluate(() => new Promise((r) => setTimeout(r, 900)))
  const hid = await page.evaluate(() => window.__twinBadges === 0)
  await page.evaluate(() => window.__twinSetExploded?.(false))
  await page.evaluate(() => new Promise((r) => setTimeout(r, 900)))
  const shown = await page.evaluate(() => (window.__twinBadges ?? 0) > 0)

  const q0 = await canvasPix(page)
  await page.click('button[aria-label="画质：性能"]')
  await page.evaluate(() => new Promise((r) => setTimeout(r, 500)))
  const q1 = await canvasPix(page)

  const sizes = {}
  for (const w of [1024, 1440, 1920]) {
    await page.setViewport({ width: w, height: 768, deviceScaleFactor: 1 })
    await page.evaluate(() => new Promise((r) => setTimeout(r, 500)))
    const p = await canvasPix(page)
    sizes[w] = p?.w ?? null
  }
  await page.close()
  return {
    searchFly: pixChanged(a0?.d, a1?.d),
    alarmFlash: pixChanged(f0?.d, f1?.d),
    hover: pixChanged(h0?.d, h1?.d),
    enterFloor: pixChanged(e0?.d, e1?.d),
    exitFloor: pixChanged(x0?.d, x1?.d),
    labels: { pass: hid && shown, hid, shown },
    qualitySwitch: pixChanged(q0?.d, q1?.d),
    resize: { pass: sizes[1024] !== sizes[1440] && sizes[1440] !== sizes[1920], sizes },
    usedInvalidate: false,
  }
}

async function measureCalls(page) {
  await page.waitForFunction(() => typeof window.__twinInvalidate === 'function', { timeout: 20_000 })
  return page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 2000))
    const values = []
    for (let i = 0; i < 60; i += 1) {
      await window.__twinInvalidate()
      values.push(window.__twinStats?.calls ?? null)
    }
    const nums = values.filter((v) => typeof v === 'number').sort((a, b) => a - b)
    const mid = Math.floor(nums.length / 2)
    const med = nums.length === 0 ? null : nums.length % 2 ? nums[mid] : Math.round((nums[mid - 1] + nums[mid]) / 2)
    return { medianCalls: med, min: nums[0] ?? null, max: nums.at(-1) ?? null, n: nums.length }
  })
}

async function shots(browser) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  const dir = '/opt/cursor/artifacts/screenshots'
  await mkdir(dir, { recursive: true })
  await page.goto(`${base}/`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page)
  await waitLoop(page)
  await page.screenshot({ path: `${dir}/t015_overview_auto.png` })
  await page.goto(`${base}/?q=balanced`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page)
  await waitLoop(page)
  await page.screenshot({ path: `${dir}/t015_overview_balanced.png` })
  await page.goto(`${base}/?q=perf&view=floor&floor=F12`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page)
  await page.waitForFunction(() => (window.__twinInterior?.renderedDesks ?? 0) > 0, { timeout: 45_000 }).catch(() => {})
  await waitLoop(page)
  await page.screenshot({ path: `${dir}/t015_f12_alarm.png` })
  await page.goto(`${base}/?q=balanced&view=floor&floor=F12`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page)
  await page.waitForFunction(() => (window.__twinInterior?.renderedDesks ?? 0) > 0, { timeout: 45_000 }).catch(() => {})
  await waitLoop(page)
  await page.screenshot({ path: `${dir}/t015_f12_occlusion.png` })
  await page.close()
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const idles = []
  for (let i = 0; i < 3; i += 1) {
    console.error(`idle ${i + 1}/3`)
    const browser = await launch()
    const overview = await browser.newPage()
    await overview.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
    await overview.goto(`${base}/`, { waitUntil: 'load', timeout: 90_000 })
    const auto = await sampleIdle(overview, 8)
    await overview.goto(`${base}/?q=balanced`, { waitUntil: 'load', timeout: 90_000 })
    const balanced = await sampleIdle(overview, 8)
    const hidden = await sampleIdle(overview, 4, true)
    await overview.close()
    const floor = await browser.newPage()
    await floor.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
    await floor.goto(`${base}/?q=perf&view=floor&floor=F12`, { waitUntil: 'load', timeout: 90_000 })
    await floor.waitForFunction(() => (window.__twinInterior?.renderedDesks ?? 0) > 0, { timeout: 45_000 }).catch(() => {})
    const f12 = await sampleIdle(floor, 8)
    await floor.close()
    await browser.close()
    idles.push({ auto, balanced, hidden, f12 })
  }

  const browser = await launch()
  const consoles = []
  const page = await browser.newPage()
  page.on('console', (m) => consoles.push(m.type()))
  page.on('pageerror', () => consoles.push('pageerror'))
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  const calls = {}
  await page.goto(`${base}/?q=balanced`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page)
  await waitLoop(page)
  calls.overviewBalanced = await measureCalls(page)
  await page.goto(`${base}/?q=perf`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page)
  await waitLoop(page)
  calls.overviewPerf = await measureCalls(page)
  for (const [key, q, floor] of [
    ['f12Balanced', 'balanced', 'F12'],
    ['f12Perf', 'perf', 'F12'],
    ['f22Balanced', 'balanced', 'F22'],
    ['f22Perf', 'perf', 'F22'],
  ]) {
    await page.goto(`${base}/?q=${q}&view=floor&floor=${floor}`, { waitUntil: 'load', timeout: 90_000 })
    await waitReady(page)
    await page.waitForFunction(() => (window.__twinInterior?.renderedDesks ?? 0) > 0, { timeout: 45_000 }).catch(() => {})
    await waitLoop(page)
    calls[key] = await measureCalls(page)
  }
  const consoleCount = {
    errors: consoles.filter((t) => t === 'error' || t === 'pageerror').length,
    warnings: consoles.filter((t) => t === 'warning').length,
  }
  await page.close()
  const demand = await demandVisual(browser)
  await shots(browser)
  await browser.close()

  const report = {
    label,
    base,
    chromeArgs,
    method: {
      visual: '0.5s screenshot, no __twinInvalidate, no extra mouse',
      idle: 'gl.info.render.frame + useFrame count, no invalidate',
      cpu: 'CDP SystemInfo renderer+gpu cpuTime / wall',
      calls: 'D148: wait 2s then 60x await __twinInvalidate',
    },
    gates: {
      overviewIdleFps: 2,
      overviewIdleCpu: 1.0,
      f12IdleCpu: 1.5,
      hiddenFps: 0,
      hardGate: 435764,
    },
    median: {
      autoGpu: idles[0]?.auto.gpu ?? null,
      overviewAutoGlFps: median(idles.map((x) => x.auto.glFps)),
      overviewAutoUseFps: median(idles.map((x) => x.auto.useFrameFps)),
      overviewAutoExpected: median(idles.map((x) => x.auto.expectedHz)),
      overviewAutoCpu: median(idles.map((x) => x.auto.cpu)),
      overviewBalancedGlFps: median(idles.map((x) => x.balanced.glFps)),
      overviewBalancedUseFps: median(idles.map((x) => x.balanced.useFrameFps)),
      overviewBalancedExpected: median(idles.map((x) => x.balanced.expectedHz)),
      overviewBalancedCpu: median(idles.map((x) => x.balanced.cpu)),
      hiddenGlFps: median(idles.map((x) => x.hidden.glFps)),
      hiddenUseFps: median(idles.map((x) => x.hidden.useFrameFps)),
      f12GlFps: median(idles.map((x) => x.f12.glFps)),
      f12UseFps: median(idles.map((x) => x.f12.useFrameFps)),
      f12Expected: median(idles.map((x) => x.f12.expectedHz)),
      f12Cpu: median(idles.map((x) => x.f12.cpu)),
    },
    calls,
    demand,
    console: consoleCount,
    idles,
  }
  await writeFile(`${outDir}/d179-${label}.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
