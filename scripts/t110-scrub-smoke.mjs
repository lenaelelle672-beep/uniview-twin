#!/usr/bin/env node
/**
 * T110：单层里拖爆炸滑杆，实例矩阵每一档都跟进度。
 * 桌、椅、显示器、圆标的平移都要等于 rest + 工位分包装的 __twinBadgeExplodeDelta。
 * 写完之后桌子的包围球要包住每个实例。拖完停住，demand 不再自续。
 * 用法：`node scripts/t110-scrub-smoke.mjs [baseUrl] [label]`
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const label = process.argv[3] ?? 'current'
const FLOOR = process.env.T110_FLOOR ?? 'F4'
const WIDTHS = [1024, 1366, 1920]
const THEMES = ['day', 'night']
const STEPS = [0.3, 0.55, 0.8, 0.45]
const MESHES = ['WorkstationDesks', 'WorkstationChairs', 'WorkstationMonitors', 'DeviceBadges']
const TOLERANCE = 1e-3
const IDLE_WINDOW_MS = 1800
const IDLE_MAX_FRAMES = 3
/** swiftshader 下一帧可能要几百毫秒，按进度轮询，不按固定时长。 */
const STEP_TIMEOUT_MS = 6000

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

const sleep = (page, ms) => page.evaluate((wait) => new Promise((resolve) => setTimeout(resolve, wait)), ms)

function readRests(names) {
  const scene = window.__twinScene
  const rests = {}
  for (const name of names) {
    const mesh = scene?.getObjectByName(name)
    const array = mesh?.instanceMatrix?.array
    if (!array) continue
    const points = []
    for (let index = 0; index < mesh.count; index += 1) {
      points.push([array[index * 16 + 12], array[index * 16 + 13], array[index * 16 + 14]])
    }
    rests[name] = points
  }
  return rests
}

function scrubTo(value) {
  const input = document.querySelector('input[data-explode-progress]')
  if (!input) return false
  input.value = String(value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  return true
}

async function settleOn({ value, timeout, tolerance }) {
  const start = performance.now()
  while (performance.now() - start < timeout) {
    const progress = window.__twinStationExplode?.progress
    if (typeof progress === 'number' && Math.abs(progress - value) <= tolerance) {
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
      return Math.round(performance.now() - start)
    }
    await new Promise((resolve) => setTimeout(resolve, 16))
  }
  return null
}

function sample({ rests, floorId }) {
  const scene = window.__twinScene
  const delta = window.__twinBadgeExplodeDelta
  const stats = window.__twinStationExplode
  const meshes = {}
  for (const [name, points] of Object.entries(rests)) {
    const mesh = scene?.getObjectByName(name)
    const array = mesh?.instanceMatrix?.array
    if (!array || typeof delta !== 'function') continue
    let worst = 0
    let moved = 0
    let outside = 0
    const sphere = mesh.boundingSphere
    for (let index = 0; index < points.length; index += 1) {
      const [rx, ry, rz] = points[index]
      const want = delta(floorId, rx, rz, false)
      const x = array[index * 16 + 12]
      const y = array[index * 16 + 13]
      const z = array[index * 16 + 14]
      worst = Math.max(worst, Math.abs(x - (rx + want.x)), Math.abs(y - (ry + want.y)), Math.abs(z - (rz + want.z)))
      moved = Math.max(moved, Math.hypot(x - rx, z - rz))
      if (sphere) {
        const d = Math.hypot(x - sphere.center.x, y - sphere.center.y, z - sphere.center.z)
        if (d > sphere.radius + 1e-3) outside += 1
      }
    }
    meshes[name] = { count: points.length, worst, moved, outside, radius: sphere?.radius ?? null }
  }
  return {
    progress: stats?.progress ?? null,
    animating: stats?.animating ?? null,
    frames: window.__twinFrames ?? 0,
    meshes,
  }
}

async function runCase(browser, width, theme) {
  const page = await browser.newPage()
  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await page.setViewport({ width, height: Math.round((width * 9) / 16), deviceScaleFactor: 1 })
  await page.goto(`${baseUrl}/?q=balanced&view=floor&floor=${FLOOR}`, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForFunction(() => window.__twinReady === true, { timeout: 240_000 })
  await page.waitForFunction((id) => window.__twinView === 'floor' && window.__twinSelected === id, { timeout: 45_000 }, FLOOR)
  if (theme === 'night') {
    await page.waitForFunction(() => typeof window.__twinSetDayNight === 'function', { timeout: 30_000 })
    await page.evaluate(() => window.__twinSetDayNight('night'))
  }
  await page.waitForFunction(
    () =>
      window.__twinStationExplode != null &&
      typeof window.__twinBadgeExplodeDelta === 'function' &&
      document.querySelector('input[data-explode-progress]') != null &&
      (window.__twinScene?.getObjectByName('WorkstationDesks')?.count ?? 0) > 0,
    { timeout: 60_000 },
  )
  await sleep(page, 2500)
  const rests = await page.evaluate(readRests, MESHES)
  const steps = []
  for (const value of STEPS) {
    const before = await page.evaluate(() => window.__twinFrames ?? 0)
    const ok = await page.evaluate(scrubTo, value)
    if (!ok) throw new Error('找不到爆炸滑杆')
    const settleMs = await page.evaluate(settleOn, { value, timeout: STEP_TIMEOUT_MS, tolerance: TOLERANCE })
    const shot = await page.evaluate(sample, { rests, floorId: FLOOR })
    steps.push({ value, settleMs, framesForStep: shot.frames - before, ...shot })
  }
  await sleep(page, 2500)
  const idleStart = await page.evaluate(() => window.__twinFrames ?? 0)
  await sleep(page, IDLE_WINDOW_MS)
  const idleEnd = await page.evaluate(() => window.__twinFrames ?? 0)
  await page.evaluate(scrubTo, 0)
  await page.evaluate(settleOn, { value: 0, timeout: STEP_TIMEOUT_MS, tolerance: TOLERANCE })
  const closed = await page.evaluate(sample, { rests, floorId: FLOOR })
  await page.close()

  const failures = []
  for (const step of steps) {
    if (step.settleMs == null) failures.push(`${step.value}: ${STEP_TIMEOUT_MS}ms 内没出帧`)
    if (step.progress == null || Math.abs(step.progress - step.value) > TOLERANCE) {
      failures.push(`${step.value}: 工位进度 ${step.progress}`)
    }
    for (const name of ['WorkstationDesks', 'WorkstationChairs', 'WorkstationMonitors', 'DeviceBadges']) {
      const mesh = step.meshes[name]
      if (!mesh) continue
      if (mesh.worst > TOLERANCE) failures.push(`${step.value}: ${name} 离目标 ${mesh.worst.toFixed(4)} m`)
    }
    const desks = step.meshes.WorkstationDesks
    if (!desks || desks.moved <= 0) failures.push(`${step.value}: 桌子没动`)
    if (desks && desks.outside > 0) failures.push(`${step.value}: 桌子包围球漏掉 ${desks.outside} 个实例`)
  }
  for (const [name, mesh] of Object.entries(closed.meshes)) {
    if (mesh.moved > TOLERANCE) failures.push(`收拢后 ${name} 离 rest ${mesh.moved.toFixed(4)} m`)
  }
  const idleFrames = idleEnd - idleStart
  if (idleFrames > IDLE_MAX_FRAMES) failures.push(`停住后 ${IDLE_WINDOW_MS}ms 仍画了 ${idleFrames} 帧`)
  if (pageErrors.length) failures.push(`pageerror ${pageErrors[0]}`)
  if (consoleErrors.length) failures.push(`console.error ${consoleErrors[0]}`)
  return {
    width,
    theme,
    counts: Object.fromEntries(Object.entries(rests).map(([name, points]) => [name, points.length])),
    steps: steps.map((step) => ({
      value: step.value,
      progress: step.progress,
      animating: step.animating,
      settleMs: step.settleMs,
      framesForStep: step.framesForStep,
      worst: Object.fromEntries(Object.entries(step.meshes).map(([name, mesh]) => [name, Number(mesh.worst.toFixed(5))])),
      deskMoved: Number((step.meshes.WorkstationDesks?.moved ?? 0).toFixed(4)),
      deskRadius: step.meshes.WorkstationDesks?.radius ?? null,
      deskOutside: step.meshes.WorkstationDesks?.outside ?? null,
    })),
    idleFrames,
    closedProgress: closed.progress,
    pageErrors: pageErrors.length,
    consoleErrors: consoleErrors.length,
    failures,
  }
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    protocolTimeout: 600_000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  })
  const report = { label, baseUrl, floor: FLOOR, cases: [], failures: [] }
  try {
    for (const width of WIDTHS) {
      for (const theme of THEMES) {
        const result = await runCase(browser, width, theme)
        report.cases.push(result)
        for (const failure of result.failures) report.failures.push(`${width} ${theme} ${failure}`)
        console.error(`${width} ${theme} failures=${result.failures.length} idle=${result.idleFrames}`)
      }
    }
  } finally {
    await browser.close()
  }
  report.ok = report.failures.length === 0
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
