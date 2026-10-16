#!/usr/bin/env node
/**
 * D217：心跳停顿 / 进层时延 / 渲染进程 CPU。
 * 用法：node scripts/t017-d217-heartbeat.mjs [baseUrl] [label] [cells]
 * cells 默认：alarm:1s,search:1s,badge:1s,alarm:3s
 * 例：... http://127.0.0.1:5190 t017 alarm:1s,search:1s,badge:1s,alarm:3s
 */
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const here = dirname(fileURLToPath(import.meta.url))
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const label = process.argv[3] ?? 't017'
const cellsArg = process.argv[4] ?? 'alarm:1s,search:1s,badge:1s,alarm:3s'
const CELLS = cellsArg.split(',').map((item) => item.trim()).filter(Boolean)
const QUALITIES = ['perf', 'balanced']
const outDir = process.env.ARTIFACT_DIR ?? resolve(here, '../docs/T017-evidence')

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

function sampleRendererCpu(profileDir) {
  const out = execFileSync('ps', ['-eo', 'pid,pcpu,cmd'], { encoding: 'utf8' })
  let max = 0
  for (const line of out.split('\n')) {
    if (!line.includes('--type=renderer')) continue
    if (!line.includes(profileDir)) continue
    const cpu = Number(line.trim().split(/\s+/)[1])
    if (Number.isFinite(cpu) && cpu > max) max = cpu
  }
  return max
}

function cpuHot10s(samples, threshold = 90, needMs = 10_000) {
  let run = 0
  let best = 0
  for (const sample of samples) {
    if (sample.cpu >= threshold) {
      run += sample.dt
      if (run > best) best = run
    } else {
      run = 0
    }
  }
  return { longestHotMs: best, hit: best >= needMs }
}

async function launch() {
  const executablePath = chromePath()
  if (!executablePath) throw new Error('找不到 Chrome')
  return puppeteer.launch({
    executablePath,
    headless: true,
    userDataDir: `/tmp/d217-chrome-${label}`,
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

function parseCell(cell) {
  const [path, window] = cell.split(':')
  return { path, window }
}

async function waitTargetView(page, timeout = 8_000) {
  await page.waitForFunction(
    () => window.__twinView === 'floor' && window.__twinSelected === 'F1',
    { timeout },
  )
}

async function clickPrinterRow(page) {
  const appearedAt = await page.evaluate(() => {
    const started = performance.now()
    return new Promise((resolve, reject) => {
      const deadline = started + 8_000
      const tick = () => {
        const row = document.querySelector('button.alarm-row[aria-label*="F1-PR1"]')
        if (row) {
          window.__d217RowAt = performance.now()
          row.click()
          window.__d217PrinterClickAt = performance.now()
          window.__d217PrinterClickDelay = window.__d217PrinterClickAt - window.__d217RowAt
          resolve(window.__d217RowAt)
          return
        }
        if (performance.now() > deadline) {
          reject(new Error('告警行 F1-PR1 未出现'))
          return
        }
        requestAnimationFrame(tick)
      }
      tick()
    })
  })
  return appearedAt
}

async function runAlarm(page, window) {
  if (window === '1s') {
    await page.waitForFunction(() => window.__d217AlarmClicked === true, { timeout: 20_000 })
  } else {
    await page.waitForFunction(() => window.__twinReady === true, { timeout: 60_000 })
    await page.waitForFunction(
      () => performance.now() - (window.__twinReadyAt ?? 0) >= 3200,
      { timeout: 20_000 },
    )
    await page.evaluate(() => {
      window.__d217AlarmClickAt = performance.now()
      document.getElementById('alarm-toggle')?.click()
    })
  }
  await page.waitForFunction(() => document.getElementById('alarm-drawer')?.open === true, { timeout: 8_000 })
  const rowAt = await clickPrinterRow(page)
  const clickAt = await page.evaluate(() => window.__d217AlarmClickAt ?? window.__d217RowAt)
  return { clickAt, rowAt }
}

async function runSearch(page, window) {
  await page.waitForFunction(() => window.__twinReady === true, { timeout: 60_000 })
  if (window === '3s') {
    await page.waitForFunction(
      () => performance.now() - (window.__twinReadyAt ?? 0) >= 3200,
      { timeout: 20_000 },
    )
  } else {
    await page.waitForFunction(
      () => performance.now() - (window.__twinReadyAt ?? 0) <= 1000 || window.__twinReady === true,
      { timeout: 20_000 },
    )
  }
  await page.click('input.search')
  await page.type('input.search', 'F1-1', { delay: 10 })
  await page.waitForSelector('.search-option', { timeout: 5_000 })
  const clickAt = await page.evaluate(() => {
    window.__d217SearchClickAt = performance.now()
    return window.__d217SearchClickAt
  })
  await page.click('.search-option')
  return { clickAt, rowAt: null }
}

async function runBadge(page, window) {
  await page.waitForFunction(() => window.__twinReady === true, { timeout: 60_000 })
  if (window === '3s') {
    await page.waitForFunction(
      () => performance.now() - (window.__twinReadyAt ?? 0) >= 3200,
      { timeout: 20_000 },
    )
  }
  await page.waitForFunction(() => (window.__twinBadgeCenters?.length ?? 0) > 0, { timeout: 10_000 })
  const point = await page.evaluate(() => {
    const center = window.__twinBadgeCenters?.find((item) => item.id === 'F1')
    if (!center || !window.__twinProject) return null
    const projected = window.__twinProject(center.x, center.y, center.z)
    if (!projected || projected.behind) return null
    return projected
  })
  if (!point) throw new Error('找不到 F1 徽标')
  const clickAt = await page.evaluate(() => performance.now())
  await page.mouse.click(point.x, point.y, { clickCount: 2 })
  return { clickAt, rowAt: null }
}

async function runCell(browser, quality, cell) {
  const { path, window } = parseCell(cell)
  const page = await browser.newPage()
  const profile = `/tmp/d217-chrome-${label}`

  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  await page.evaluateOnNewDocument((autoAlarm) => {
    window.__d217Beat = { last: performance.now(), maxGap: 0 }
    setInterval(() => {
      const now = performance.now()
      const gap = now - window.__d217Beat.last
      window.__d217Beat.last = now
      if (gap > window.__d217Beat.maxGap) window.__d217Beat.maxGap = gap
    }, 50)
    if (!autoAlarm) return
    setInterval(() => {
      if (window.__twinReady !== true) return
      if (window.__d217AlarmClicked) return
      window.__d217AlarmClicked = true
      window.__d217AlarmClickAt = performance.now()
      document.getElementById('alarm-toggle')?.click()
    }, 16)
  }, path === 'alarm' && window === '1s')

  const cpuSamples = []
  let lastCpuAt = Date.now()
  const cpuTimer = setInterval(() => {
    const now = Date.now()
    const cpu = sampleRendererCpu(profile)
    cpuSamples.push({ t: now, dt: now - lastCpuAt, cpu })
    lastCpuAt = now
  }, 400)

  const started = Date.now()
  try {
    await page.goto(`${baseUrl}/?q=${quality}`, { waitUntil: 'load', timeout: 90_000 })
    await page.waitForFunction(() => window.__twinReady === true, { timeout: 60_000 })
    const readyAt = await page.evaluate(() => window.__twinReadyAt ?? performance.now())
    let action
    if (path === 'alarm') action = await runAlarm(page, window)
    else if (path === 'search') action = await runSearch(page, window)
    else action = await runBadge(page, window)

    const enterStarted = Date.now()
    await waitTargetView(page, 8_000)
    const enteredAt = await page.evaluate(() => performance.now())
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1500)))
    const beat = await page.evaluate(() => ({
      maxGap: window.__d217Beat?.maxGap ?? null,
      readyAt: window.__twinReadyAt ?? null,
      clickAt: window.__d217AlarmClickAt ?? window.__d217SearchClickAt ?? null,
      rowAt: window.__d217RowAt ?? null,
      view: window.__twinView,
      selected: window.__twinSelected,
      frames: window.__twinFrames ?? 0,
      prewarmed: window.__twinPrewarmed === true,
    }))
    const clickAfterReady = (action.clickAt ?? beat.clickAt ?? enteredAt) - readyAt
    const rowAfterReady = action.rowAt != null ? action.rowAt - readyAt : null
    const printerClickDelay = await page.evaluate(() => window.__d217PrinterClickDelay ?? null)
    const clickToView = enteredAt - (action.rowAt ?? action.clickAt ?? beat.clickAt ?? readyAt)
    const hot = cpuHot10s(cpuSamples)
    const maxPause = beat.maxGap ?? 0
    return {
      label,
      quality,
      path,
      window,
      clickAfterReadyMs: clickAfterReady,
      alarmRowAfterReadyMs: rowAfterReady,
      alarmRowAfterToggleMs: action.rowAt != null && action.clickAt != null ? action.rowAt - action.clickAt : null,
      printerClickDelayMs: printerClickDelay,
      clickToViewMs: clickToView,
      maxHeartbeatGapMs: maxPause,
      rendererHot10s: hot.hit,
      rendererLongestHotMs: hot.longestHotMs,
      frames: beat.frames,
      prewarmed: beat.prewarmed,
      errors,
      elapsedMs: Date.now() - started,
      enterWaitMs: Date.now() - enterStarted,
      ok:
        clickToView <= 8_000 &&
        maxPause <= 6_000 &&
        !hot.hit &&
        errors.length === 0 &&
        (path !== 'alarm' || printerClickDelay == null || printerClickDelay <= 200),
    }
  } catch (error) {
    return {
      label,
      quality,
      path,
      window,
      ok: false,
      error: String(error),
      maxHeartbeatGapMs: await page.evaluate(() => window.__d217Beat?.maxGap ?? null).catch(() => null),
      rendererHot10s: cpuHot10s(cpuSamples).hit,
      rendererLongestHotMs: cpuHot10s(cpuSamples).longestHotMs,
      errors,
      elapsedMs: Date.now() - started,
    }
  } finally {
    clearInterval(cpuTimer)
    await page.close()
  }
}

async function main() {
  const browser = await launch()
  const cases = []
  try {
    for (const quality of QUALITIES) {
      for (const cell of CELLS) {
        cases.push(await runCell(browser, quality, cell))
      }
    }
  } finally {
    await browser.close()
  }
  const report = {
    createdAt: new Date().toISOString(),
    baseUrl,
    label,
    cells: CELLS,
    cases,
    ok: cases.every((item) => item.ok),
  }
  await mkdir(outDir, { recursive: true })
  const jsonPath = resolve(outDir, `t017-d217-${label}.json`)
  await writeFile(jsonPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  console.log(`wrote ${jsonPath}`)
  if (!report.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
