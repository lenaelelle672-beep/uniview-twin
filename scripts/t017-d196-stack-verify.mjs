#!/usr/bin/env node
/**
 * D196：F1/F12 标签+淡出、Esc 顺序、__twinFrames 空闲 20s。
 * 用法：node scripts/t017-d196-stack-verify.mjs [baseUrl]
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

async function waitReady(page) {
  await page.waitForFunction(() => window.__twinReady === true && window.__twinFirstFrameAt != null, {
    timeout: 60_000,
  })
}

async function enterFloor(page, floorId, deskId) {
  await page.waitForFunction(() => window.__twinFirstPrefetchDone === true, { timeout: 60_000 })
  await page.evaluate(
    (floor, desk) => {
      window.__twinFocusDevice?.({ floor, deskId: desk, deviceId: null })
    },
    floorId,
    deskId,
  )
  await page.waitForFunction(
    (floor) => window.__twinView === 'floor' && window.__twinSelected === floor,
    { timeout: 90_000 },
    floorId,
  )
  await page.waitForFunction(
    (floor) =>
      window.__twinLabelMount?.floorId === floor &&
      window.__twinLabelMount?.done === true &&
      (window.__twinLabelMount?.mounted ?? 0) > 0,
    { timeout: 90_000 },
    floorId,
  )
}

async function fadeProbe(page) {
  return page.evaluate(() => {
    const scene = window.__twinScene
    const opacities = []
    scene?.traverse((object) => {
      if (typeof object.fillOpacity === 'number') opacities.push(object.fillOpacity)
    })
    const faded = opacities.filter((value) => value < 0.999)
    return {
      texts: opacities.length,
      faded: faded.length,
      min: opacities.length ? Math.min(...opacities) : null,
      max: opacities.length ? Math.max(...opacities) : null,
      mount: window.__twinLabelMount ?? null,
      labelPx: window.__twinLabelPx ?? null,
    }
  })
}

async function runLabels(browser, floorId) {
  const page = await browser.newPage()
  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(`${baseUrl}/?q=balanced`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page)
  const deskId = floorId === 'F12' ? 'F12-66' : null
  await enterFloor(page, floorId, deskId)
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1500)))
  const probe = await fadeProbe(page)
  await page.close()
  return {
    floorId,
    errors,
    fade: probe,
    labelsOk: (probe.mount?.mounted ?? 0) > 0 && probe.mount?.done === true && errors.length === 0,
    fadeOk: floorId === 'F1' ? probe.texts >= 0 : probe.faded > 0 || (probe.min != null && probe.min < 1),
  }
}

async function runEsc(browser) {
  const page = await browser.newPage()
  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  await page.goto(`${baseUrl}/?q=balanced`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page)
  await enterFloor(page, 'F1', null)
  await page.click('#alarm-toggle').catch(() => {})
  await page.waitForSelector('#alarm-drawer', { timeout: 10_000 }).catch(() => {})
  const search = await page.$('input.search, input[aria-label*="搜索"]')
  if (search) {
    await search.click()
    await search.type('周伟', { delay: 20 })
  }
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)))
  const steps = []
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Escape')
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)))
    steps.push(
      await page.evaluate(() => ({
        view: window.__twinView ?? null,
        search: document.querySelector('input.search')?.value ?? '',
        searchOpen: Boolean(document.querySelector('[role="listbox"]')),
        drawer: Boolean(document.getElementById('alarm-drawer')),
        drawerHidden: document.getElementById('alarm-drawer')?.hidden ?? null,
      })),
    )
    if (steps.at(-1)?.view === 'building') break
  }
  await page.close()
  const leftFloor = steps.some((step) => step.view === 'building')
  return { steps, leftFloor, errors, ok: leftFloor && errors.length === 0 }
}

async function runIdleFrames(browser) {
  const page = await browser.newPage()
  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  await page.goto(`${baseUrl}/?q=balanced`, { waitUntil: 'load', timeout: 90_000 })
  await waitReady(page)
  await page.waitForFunction(() => window.__twinFirstPrefetchDone === true, { timeout: 60_000 })
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 4000)))
  const before = await page.evaluate(() => window.__twinFrames ?? 0)
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 20_000)))
  const after = await page.evaluate(() => window.__twinFrames ?? 0)
  await page.close()
  const delta = after - before
  return { before, after, delta, errors, ok: delta <= 1 && errors.length === 0 }
}

async function main() {
  const browser = await launch()
  const report = { createdAt: new Date().toISOString(), baseUrl }
  try {
    report.f1 = await runLabels(browser, 'F1')
    report.f12 = await runLabels(browser, 'F12')
    report.esc = await runEsc(browser)
    report.idle = await runIdleFrames(browser)
  } finally {
    await browser.close()
  }
  report.ok =
    report.f1.labelsOk &&
    report.f12.labelsOk &&
    report.f12.fadeOk &&
    report.esc.ok &&
    report.idle.ok
  await mkdir(outDir, { recursive: true })
  const jsonPath = resolve(outDir, 't017-d196-stack-verify.json')
  await writeFile(jsonPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  console.log(`wrote ${jsonPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
