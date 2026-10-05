#!/usr/bin/env node
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')

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

async function mem(page) {
  return page.evaluate(() => ({
    calls: window.__twinStats?.calls ?? 0,
    memory: window.__twinMemory ?? null,
    quality: document.querySelector('.scene-root')?.dataset.quality ?? '',
  }))
}

async function main() {
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
  const report = { floors: {}, switches: [], failures: [] }

  for (const floorId of ['F4', 'F12', 'F22']) {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
    await page.goto(`${baseUrl}/?q=balanced&view=floor&floor=${floorId}`, { waitUntil: 'load', timeout: 90_000 })
    await waitReady(page, 'balanced')
    await page.waitForFunction(
      (id) => window.__twinView === 'floor' && window.__twinSelected === id && (window.__twinInterior?.renderedDesks ?? 0) > 0,
      { timeout: 90_000 },
      floorId,
    )
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 800)))
    const state = await page.evaluate(() => ({
      view: window.__twinView,
      selected: window.__twinSelected,
      desks: window.__twinInterior?.renderedDesks ?? 0,
    }))
    report.floors[floorId] = { ...state, pageErrors: errors }
    if (errors.length) report.failures.push(`${floorId} ${errors[0]}`)
    await page.close()
    console.error(`smoke ${floorId} desks=${state.desks} err=${errors.length}`)
  }

  const page = await browser.newPage()
  const logs = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') logs.push({ type: msg.type(), text: msg.text() })
  })
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  await page.goto(`${baseUrl}/?q=balanced`, { waitUntil: 'load' })
  await waitReady(page, 'balanced')
  report.switches.push({ label: 'cold-balanced', ...(await mem(page)) })
  for (let i = 1; i <= 5; i += 1) {
    await page.click('button[aria-label="画质：性能"]')
    await page.waitForFunction(() => document.querySelector('.scene-root')?.dataset.quality === 'perf', { timeout: 45_000 })
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)))
    await page.click('button[aria-label="画质：均衡"]')
    await page.waitForFunction(
      () =>
        document.querySelector('.scene-root')?.dataset.quality === 'balanced' &&
        document.querySelector('.scene-root')?.dataset.fxReady === '1' &&
        window.__twinComposerLive === true,
      { timeout: 45_000 },
    )
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 600)))
    report.switches.push({ label: `c${i}`, ...(await mem(page)) })
  }
  const c2 = report.switches.find((item) => item.label === 'c2')
  const c5 = report.switches.find((item) => item.label === 'c5')
  report.switchHold = {
    c2: c2?.memory ?? null,
    c5: c5?.memory ?? null,
    hold:
      c2?.memory?.textures === c5?.memory?.textures &&
      c2?.memory?.geometries === c5?.memory?.geometries &&
      c2?.memory?.programs === c5?.memory?.programs,
  }
  report.console = {
    errors: logs.filter((item) => item.type === 'error').length,
    warnings: logs.filter((item) => item.type === 'warning').length,
    blit: logs.filter((item) => /glBlitFramebuffer|Depth\/stencil/i.test(item.text)).length,
    items: logs.slice(0, 8),
  }
  if (!report.switchHold.hold) report.failures.push('c5 vs c2 grew')
  if (report.console.blit) report.failures.push(`blit ${report.console.blit}`)
  await page.close()
  await browser.close()
  report.ok = report.failures.length === 0
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
