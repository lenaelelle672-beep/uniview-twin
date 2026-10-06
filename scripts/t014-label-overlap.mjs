#!/usr/bin/env node
/**
 * 拉近测量（可复现）：
 * 1. 1366×768 ?q=balanced，进入单层，等 window.__twinLabelOverlap。
 * 2. 默认视角记 merged / hidden / hiddenAfterZoom。
 * 3. 拉近：const rig = window.__twinRig; rig.dollyTo(rig.distance * 0.18, false); rig.update(0)
 * 4. 再读探针。hiddenAfterZoom 必须为 0。
 *
 * 探针里的 hiddenAfterZoom 同时用屏幕坐标相对质心放大 8 倍再跑避让，不依赖真实相机。
 *
 * 用法：node scripts/t014-label-overlap.mjs [baseUrl]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const outDir = process.env.ARTIFACT_DIR ?? '/opt/cursor/artifacts'
const FLOORS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F12', 'F22', 'F14']

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

async function launch() {
  const puppeteer = require('puppeteer-core')
  return puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--no-sandbox',
    ],
  })
}

async function waitOverlap(page) {
  await page.waitForFunction(
    () => window.__twinView === 'floor' && window.__twinLabelOverlap && typeof window.__twinLabelOverlap.hidden === 'number',
    { timeout: 60_000 },
  )
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 900)))
  return page.evaluate(() => structuredClone(window.__twinLabelOverlap))
}

async function zoomIn(page) {
  return page.evaluate(() => {
    const rig = window.__twinRig
    if (!rig) return { ok: false, reason: 'no __twinRig' }
    const before = rig.distance
    const next = Math.max(rig.minDistance || 8, before * 0.18)
    void rig.dollyTo(next, false)
    rig.update(0)
    return { ok: true, before, next, after: rig.distance }
  })
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const browser = await launch()
  const page = await browser.newPage()
  const requests = []
  const consoles = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') consoles.push({ floor: null, type: msg.type(), text: msg.text() })
  })
  page.on('pageerror', (error) => consoles.push({ floor: null, type: 'pageerror', text: error.message }))
  page.on('request', (req) => {
    const url = req.url()
    if (!url.startsWith(baseUrl) && !url.startsWith('data:') && !url.startsWith('blob:')) requests.push(url)
  })
  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  await page.goto(`${baseUrl}/?q=balanced`, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForFunction(() => window.__twinReady === true, { timeout: 90_000 })

  const report = { floors: {}, shots: [], consoles: [], external: [] }
  for (const floorId of FLOORS) {
    await page.evaluate((id) => window.__twinFocusDevice?.({ floor: id, deskId: null }), floorId)
    await page.waitForFunction((id) => window.__twinView === 'floor' && window.__twinSelected === id, { timeout: 45_000 }, floorId)
    const def = await waitOverlap(page)
    const shotDefault = resolve(outDir, `${floorId}_1366_default.png`)
    if (floorId === 'F3' || floorId === 'F12') await page.screenshot({ path: shotDefault })
    const zoom = await zoomIn(page)
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 700)))
    const after = await page.evaluate(() => structuredClone(window.__twinLabelOverlap))
    const shotZoom = resolve(outDir, `${floorId}_1366_zoom.png`)
    if (floorId === 'F3' || floorId === 'F12') await page.screenshot({ path: shotZoom })
    const floorConsoles = await page.evaluate(() => [])
    report.floors[floorId] = { default: def, zoomed: after, zoom }
    if (floorId === 'F3' || floorId === 'F12') report.shots.push(shotDefault, shotZoom)
    await page.evaluate(() => window.__twinSelectFloor?.(null))
    await page.keyboard.press('Escape')
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)))
    void floorConsoles
  }
  report.consoles = consoles
  report.external = requests
  const out = resolve(here, '../docs/T012-evidence/t014-label-overlap.json')
  await writeFile(out, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ out, floors: report.floors, consoles: consoles.length, external: requests, shots: report.shots }, null, 2))
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
