#!/usr/bin/env node
/**
 * D214：ready 后立刻进层不能卡死。
 * 用法：node scripts/t017-d214-enter-floor.mjs [baseUrl]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const here = dirname(fileURLToPath(import.meta.url))
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const outDir = process.env.ARTIFACT_DIR ?? resolve(here, '../docs/T017-evidence')
const QUALITIES = ['perf', 'balanced']
const ROUNDS = 2

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

function attachConsole(page) {
  const errors = []
  const warnings = []
  const requests = []
  page.on('console', (msg) => {
    const text = msg.text()
    if (msg.type() === 'error') errors.push(text)
    if (msg.type() === 'warning' || msg.type() === 'warn') warnings.push(text)
  })
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('request', (request) => {
    const url = request.url()
    if (!url.startsWith(baseUrl)) return
    requests.push(url.replace(baseUrl, '').split('?')[0])
  })
  return { errors, warnings, requests }
}

async function openPage(browser, quality) {
  const page = await browser.newPage()
  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  const logs = attachConsole(page)
  await page.goto(`${baseUrl}/?q=${quality}`, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForFunction(() => window.__twinReady === true, { timeout: 60_000 })
  const readyAt = await page.evaluate(() => window.__twinReadyAt ?? performance.now())
  return { page, logs, readyAt }
}

async function waitRoom21(page, timeout = 45_000) {
  await page.waitForFunction(
    () =>
      window.__twinView === 'floor' &&
      window.__twinSelected === 'F1' &&
      (window.__twinFrames ?? 0) > 1 &&
      Boolean(window.__twinLabelMount?.mountedIds?.includes('F1:room-21')),
    { timeout },
  )
  return page.evaluate(() => ({
    now: performance.now(),
    frames: window.__twinFrames ?? 0,
    view: window.__twinView,
    selected: window.__twinSelected,
    mount: window.__twinLabelMount ?? null,
    prewarmed: window.__twinPrewarmed === true,
    prewarmedAt: window.__twinPrewarmedAt ?? null,
    interior: Boolean(window.__twinScene?.getObjectByName('FloorInterior')),
  }))
}

async function clickAlarmF1(page) {
  await page.click('#alarm-toggle')
  await page.waitForSelector('#alarm-drawer', { timeout: 5_000 })
  await page.waitForFunction(() => document.getElementById('alarm-drawer')?.open === true, { timeout: 5_000 })
  const row = await page.waitForSelector('button.alarm-row[aria-label*="F1-PR1"]', { timeout: 8_000 })
  await row.click()
}

async function searchFlyF1(page) {
  await page.click('input.search')
  await page.type('input.search', 'F1-1', { delay: 15 })
  await page.waitForSelector('.search-option', { timeout: 8_000 })
  await page.click('.search-option')
}

async function clickBadgeF1(page) {
  await page.waitForFunction(() => (window.__twinBadgeCenters?.length ?? 0) > 0, { timeout: 10_000 })
  const point = await page.evaluate(() => {
    const center = window.__twinBadgeCenters?.find((item) => item.id === 'F1')
    if (!center || !window.__twinProject) return null
    const projected = window.__twinProject(center.x, center.y, center.z)
    if (!projected || projected.behind) return null
    return { x: projected.x, y: projected.y }
  })
  if (!point) throw new Error('找不到 F1 徽标投影')
  await page.mouse.click(point.x, point.y)
}

async function runCase(browser, quality, path, act) {
  const { page, logs, readyAt } = await openPage(browser, quality)
  const started = Date.now()
  try {
    if (path !== 'alarm-1s') {
      await page.waitForFunction(() => window.__twinFirstPrefetchDone === true, { timeout: 20_000 })
      const already = await page.evaluate(() => window.__twinPrewarmed === true)
      if (already) throw new Error('预热已结束，错过预热窗口')
    }
    const clickAt = await page.evaluate(() => performance.now())
    await act(page)
    const after = await waitRoom21(page)
    const floorJson = logs.requests.filter((url) => /^\/floors\/F0?1\.json$/.test(url))
    return {
      quality,
      path,
      clickAfterReadyMs: clickAt - readyAt,
      room21AfterReadyMs: after.now - readyAt,
      frames: after.frames,
      prewarmed: after.prewarmed,
      prewarmedAt: after.prewarmedAt,
      interior: after.interior,
      f01Requests: floorJson.length,
      errors: logs.errors,
      warnings: logs.warnings,
      elapsedMs: Date.now() - started,
      ok:
        after.frames > 1 &&
        after.interior &&
        floorJson.length > 0 &&
        logs.errors.length === 0 &&
        clickAt - readyAt < (path === 'alarm-1s' ? 1_200 : 20_000),
    }
  } catch (error) {
    const snap = await page
      .evaluate(() => ({
        view: window.__twinView,
        frames: window.__twinFrames ?? 0,
        prewarmed: window.__twinPrewarmed === true,
        selected: window.__twinSelected,
        mount: window.__twinLabelMount ?? null,
      }))
      .catch(() => null)
    return {
      quality,
      path,
      ok: false,
      error: String(error),
      snap,
      errors: logs.errors,
      warnings: logs.warnings,
      requests: [...new Set(logs.requests)].slice(0, 40),
      elapsedMs: Date.now() - started,
    }
  } finally {
    await page.close()
  }
}

async function runIdleFrames(browser, quality) {
  const { page, logs } = await openPage(browser, quality)
  try {
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 20_000)))
    const snap = await page.evaluate(() => ({
      frames: window.__twinFrames ?? 0,
      prewarmed: window.__twinPrewarmed === true,
      view: window.__twinView,
    }))
    return {
      quality,
      ...snap,
      errors: logs.errors,
      warnings: logs.warnings,
      ok: snap.frames <= 2 && logs.errors.length === 0 && logs.warnings.length === 0 && snap.view === 'building',
    }
  } finally {
    await page.close()
  }
}

async function main() {
  const browser = await launch()
  const cases = []
  try {
    for (const quality of QUALITIES) {
      for (let round = 1; round <= ROUNDS; round += 1) {
        cases.push({ round, ...(await runCase(browser, quality, 'alarm-1s', clickAlarmF1)) })
        cases.push({ round, ...(await runCase(browser, quality, 'search-fly', searchFlyF1)) })
        cases.push({ round, ...(await runCase(browser, quality, 'badge', clickBadgeF1)) })
      }
    }
    const idle = []
    for (const quality of QUALITIES) idle.push(await runIdleFrames(browser, quality))
    const report = {
      createdAt: new Date().toISOString(),
      baseUrl,
      cases,
      idle,
      ok: cases.every((item) => item.ok) && idle.every((item) => item.ok),
    }
    await mkdir(outDir, { recursive: true })
    const jsonPath = resolve(outDir, 't017-d214-enter-floor.json')
    await writeFile(jsonPath, JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
    console.log(`wrote ${jsonPath}`)
    if (!report.ok) process.exitCode = 1
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
