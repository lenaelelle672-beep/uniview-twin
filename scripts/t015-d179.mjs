#!/usr/bin/env node
/**
 * T015 / D180 / D187 自测。
 * 帧率一律用 window.__twinFrames（R3F 每提交一帧 +1），不用 renderer.info.render.frame。
 * 后台：CDP Emulation.setFocusEmulationEnabled + Page.setWebLifecycleState hidden。
 * 空闲与 7 项出画：不调 __twinInvalidate、不额外动鼠标。
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
  return puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: chromeArgs,
    protocolTimeout: 180_000,
  })
}

async function waitReady(page) {
  const already = await page.evaluate(() => window.__twinReady === true).catch(() => false)
  if (already) return
  await page.waitForFunction(() => window.__twinReady === true, { timeout: 90_000 })
}

async function waitLoop(page) {
  await page.waitForFunction(() => typeof window.__twinFrames === 'number', { timeout: 20_000 }).catch(() => {})
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)))
}

function childPids(root) {
  const { spawnSync } = require('node:child_process')
  const seen = new Set()
  const stack = [root]
  while (stack.length) {
    const pid = stack.pop()
    if (!pid || seen.has(pid)) continue
    seen.add(pid)
    const out = spawnSync('ps', ['-o', 'pid=', '--ppid', String(pid)], { encoding: 'utf8' })
    if (out.status === 0) {
      for (const line of out.stdout.split('\n')) {
        const n = Number(line.trim())
        if (n) stack.push(n)
      }
    }
  }
  return [...seen]
}

function cpuTicks(pids) {
  let t = 0
  let matched = 0
  for (const pid of pids) {
    try {
      const cmd = require('node:fs').readFileSync(`/proc/${pid}/cmdline`, 'utf8')
      if (!/type=renderer|type=gpu-process|type=gpu/i.test(cmd)) continue
      const stat = require('node:fs').readFileSync(`/proc/${pid}/stat`, 'utf8')
      const parts = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
      t += Number(parts[11] ?? 0) + Number(parts[12] ?? 0)
      matched += 1
    } catch {
      // gone
    }
  }
  return { t, matched }
}

const CLK = Number(require('node:child_process').spawnSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).stdout.trim()) || 100

async function pageCpuCores(_page, browser, seconds) {
  const root = browser.process()?.pid
  const pids = root ? childPids(root) : []
  const a = cpuTicks(pids)
  const wall0 = Date.now()
  await new Promise((r) => setTimeout(r, seconds * 1000))
  const b = cpuTicks(root ? childPids(root) : pids)
  const wall = (Date.now() - wall0) / 1000
  const procCores = wall > 0 ? (b.t - a.t) / CLK / wall : null
  return {
    cores: procCores,
    via: 'proc-renderer-gpu',
    pids: pids.length,
    matched: b.matched,
  }
}

async function snapshot(page) {
  return page.evaluate(() => ({
    frames: window.__twinFrames ?? 0,
    gl: window.__twinGlFrame ?? window.__twinStats?.frame ?? 0,
    at: performance.now(),
    schedule: window.__twinSchedule ?? null,
    gpu: window.__twinGpu ?? null,
    hidden: document.hidden,
    visibility: document.visibilityState,
  }))
}

async function forceHiddenCdp(page) {
  const client = await page.createCDPSession()
  await client.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {})
  let lifecycle = null
  for (const state of ['hidden', 'frozen']) {
    try {
      await client.send('Page.setWebLifecycleState', { state })
      lifecycle = state
      break
    } catch {
      // 本 Chrome 可能只认 frozen/active
    }
  }
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.evaluate(() => new Promise((r) => setTimeout(r, 250)))
  client._twinLifecycle = lifecycle
  return client
}

async function sampleIdle(page, browser, seconds, hide = false) {
  await waitLoop(page)
  let cdp = null
  let lifecycle = null
  if (hide) {
    cdp = await forceHiddenCdp(page)
    lifecycle = cdp._twinLifecycle ?? null
  }
  const start = await snapshot(page)
  const cpu = await pageCpuCores(page, browser, seconds)
  const end = await page.evaluate((t0) => {
    const at = performance.now()
    const sec = (at - t0.at) / 1000
    const frames = window.__twinFrames ?? 0
    const gl = window.__twinGlFrame ?? window.__twinStats?.frame ?? 0
    return {
      frames,
      gl,
      sec,
      fps: (frames - t0.frames) / sec,
      glFps: (gl - t0.gl) / sec,
      frameDelta: frames - t0.frames,
      schedule: window.__twinSchedule ?? null,
      gpu: window.__twinGpu ?? null,
      hidden: document.hidden,
      visibility: document.visibilityState,
    }
  }, start)
  if (cdp) await cdp.detach().catch(() => {})
  return {
    ...end,
    expectedHz: hide ? 0 : (start.schedule?.hz ?? end.schedule?.hz ?? null),
    cpu: cpu.cores,
    cpuDetail: cpu,
    url: page.url(),
    lifecycle,
  }
}

async function openScene(browser, path) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await waitReady(page)
  if (path.includes('view=floor')) {
    await page.waitForFunction(() => (window.__twinInterior?.renderedDesks ?? 0) > 0, { timeout: 45_000 }).catch(() => {})
  }
  return page
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
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)))
  const hid = await page.evaluate(() => window.__twinBadges === 0)
  await page.evaluate(() => new Promise((r) => setTimeout(r, 600)))
  await page.evaluate(() => window.__twinSetExploded?.(false))
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)))
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
      await Promise.race([
        window.__twinInvalidate(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('invalidate timeout')), 8000)),
      ]).catch(() => {})
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

async function sampleMotion(browser) {
  const out = {}
  for (const [key, path, kind] of [
    ['explodeBalanced', '/?q=balanced', 'explode'],
    ['explodePerf', '/?q=perf', 'explode'],
    ['flyBalanced', '/?q=balanced&view=floor&floor=F12', 'fly'],
    ['flyPerf', '/?q=perf&view=floor&floor=F12', 'fly'],
  ]) {
    const page = await openScene(browser, path)
    await waitReady(page)
    await waitLoop(page)
    if (kind === 'explode') {
      await page.evaluate(() => window.__twinSetExploded?.(true))
    } else {
      await page.evaluate(() => {
        const d = (window.__twinDevices ?? []).find((x) => x.floorId === 'F12' && x.deskId)
        if (d) window.__twinFocusDevice?.({ floor: 'F12', deskId: d.deskId, deviceId: d.id })
      })
    }
    out[key] = await sampleIdle(page, browser, 1.2)
    await page.close()
  }
  return out
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const idles = []
  for (let i = 0; i < 2; i += 1) {
    console.error(`idle ${i + 1}/2`)
    const browser = await launch()
    async function scene(name, path, seconds, hide = false) {
      console.error(`  ${name}`)
      try {
        const page = await openScene(browser, path)
        const row = await sampleIdle(page, browser, seconds, hide)
        await page.close()
        return row
      } catch (error) {
        console.error(`  ${name} FAIL`, error.message)
        return { error: error.message, expectedHz: null, glFps: null, useFrameFps: null, cpu: null }
      }
    }
    const autoOverview = await scene('auto overview', '/', 8)
    const hidden = await scene('hidden', '/', 4, true)
    const balancedOverview = await scene('balanced overview', '/?q=balanced', 8)
    const autoF12 = await scene('auto F12', '/?view=floor&floor=F12', 8)
    const balancedF12 = await scene('balanced F12', '/?q=balanced&view=floor&floor=F12', 8)
    const perfF12 = await scene('perf F12', '/?q=perf&view=floor&floor=F12', 8)

    await browser.close()
    idles.push({ autoOverview, balancedOverview, hidden, autoF12, balancedF12, perfF12 })
    await writeFile(`${outDir}/d180-${label}-idle.json`, JSON.stringify({ idles }, null, 2))
  }

  let calls = {}
  let motion = {}
  let demand = { error: 'skipped' }
  let consoleCount = { errors: 0, warnings: 0 }
  try {
    const browser = await launch()
    const consoles = []
    const page = await browser.newPage()
    page.on('console', (m) => consoles.push(m.type()))
    page.on('pageerror', () => consoles.push('pageerror'))
    await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
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
      await page.waitForFunction(() => (window.__twinInterior?.renderedDesks ?? 0) > 0, { timeout: 45_000 }).catch(() => {})
      await waitLoop(page)
      calls[key] = await measureCalls(page)
    }
    consoleCount = {
      errors: consoles.filter((t) => t === 'error' || t === 'pageerror').length,
      warnings: consoles.filter((t) => t === 'warning').length,
    }
    await page.close()
    motion = await sampleMotion(browser)
    demand = await demandVisual(browser)
    await shots(browser)
    await browser.close()
  } catch (error) {
    console.error('post-idle FAIL', error.message)
    demand = { error: error.message }
  }

  const report = {
    label,
    base,
    chromeArgs,
    method: {
      visual: '0.5s screenshot, no __twinInvalidate, no extra mouse',
      idle: '__twinFrames increment/sec (one R3F commit = +1); gl.render.frame is diagnostic only',
      hidden: 'CDP Emulation.setFocusEmulationEnabled + Page.setWebLifecycleState hidden',
      cpu: 'software auto (no ?q=) /proc renderer+gpu ticks / wall; ?q=balanced report-only',
      calls: 'D148: wait 2s then 60x await __twinInvalidate',
    },
    gates: {
      overviewIdleFps: 2,
      overviewIdleCpu: 1.0,
      f12IdleCpu: 1.5,
      hiddenFps: 0,
      hardGate: 435764,
      cpuAppliesTo: 'software-auto no ?q=',
    },
    median: {
      autoGpu: idles[0]?.autoOverview.gpu ?? null,
      autoOverviewFps: median(idles.map((x) => x.autoOverview.fps)),
      autoOverviewExpected: median(idles.map((x) => x.autoOverview.expectedHz)),
      autoOverviewCpu: median(idles.map((x) => x.autoOverview.cpu)),
      balancedOverviewFps: median(idles.map((x) => x.balancedOverview.fps)),
      balancedOverviewExpected: median(idles.map((x) => x.balancedOverview.expectedHz)),
      balancedOverviewCpu: median(idles.map((x) => x.balancedOverview.cpu)),
      hiddenFps: median(idles.map((x) => x.hidden.fps)),
      hiddenFrameDelta: median(idles.map((x) => x.hidden.frameDelta)),
      autoF12Fps: median(idles.map((x) => x.autoF12.fps)),
      autoF12Expected: median(idles.map((x) => x.autoF12.expectedHz)),
      autoF12Cpu: median(idles.map((x) => x.autoF12.cpu)),
      balancedF12Fps: median(idles.map((x) => x.balancedF12.fps)),
      balancedF12Expected: median(idles.map((x) => x.balancedF12.expectedHz)),
      balancedF12Cpu: median(idles.map((x) => x.balancedF12.cpu)),
      perfF12Fps: median(idles.map((x) => x.perfF12.fps)),
      perfF12Expected: median(idles.map((x) => x.perfF12.expectedHz)),
      perfF12Cpu: median(idles.map((x) => x.perfF12.cpu)),
    },
    motion: {
      explodeBalanced: { fps: motion.explodeBalanced?.fps, expectedHz: motion.explodeBalanced?.expectedHz },
      explodePerf: { fps: motion.explodePerf?.fps, expectedHz: motion.explodePerf?.expectedHz },
      flyBalanced: { fps: motion.flyBalanced?.fps, expectedHz: motion.flyBalanced?.expectedHz },
      flyPerf: { fps: motion.flyPerf?.fps, expectedHz: motion.flyPerf?.expectedHz },
    },
    glSync: {
      samples: 'cached once in defaultFramebufferSamples',
      getError: 'dev or window.__twinGlDebug only',
      otherPerFrame: [
        'MonitorPass/balancedFx: gl.getDrawingBufferSize (canvas w/h, not GPU getParameter)',
        'RenderProbe: gl.info.reset() (CPU counter, not GPU sync)',
        'Scene onCreated / gpuDetect: getParameter(UNMASKED_RENDERER) once',
      ],
    },
    calls,
    demand,
    console: consoleCount,
    idles,
    motionRaw: motion,
  }
  await writeFile(`${outDir}/d180-${label}.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
