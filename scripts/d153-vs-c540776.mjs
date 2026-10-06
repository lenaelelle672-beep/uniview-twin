#!/usr/bin/env node
/** D153：本层告警 / 遮挡 / 标签对照 c540776，确认未改。 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const currentUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const cUrl = (process.argv[3] ?? 'http://127.0.0.1:5194').replace(/\/$/, '')
const evidenceDir = resolve(process.cwd(), 'docs/T012-evidence')
const shotDir = process.env.ARTIFACT_DIR ?? '/opt/cursor/artifacts/screenshots'

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

const F12 = 48.16
const POSES = {
  'label-f12': null,
  'alarm-f12': 'alarm',
  'occlusion-f12-slab': { eye: [8, F12 + 9.4, 22], target: [0, F12 + 0.6, 0] },
  'occlusion-f12-low-oblique': { eye: [16, F12 + 2.1, 20], target: [0, F12 + 1.1, -2] },
  'occlusion-f12-behind-column': { eye: [8.4, F12 + 1.7, 12.4], target: [8.4, F12 + 1.2, 1] },
  'occlusion-f12-corridor': { eye: [18, F12 + 1.6, 6.6], target: [-10, F12 + 1.2, 6.6] },
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

async function waitFloor(page) {
  await page
    .waitForFunction(
      () =>
        (window.__twinView === 'floor' || document.querySelector('.scene-root')?.dataset.view === 'floor') &&
        (window.__twinInterior?.renderedDesks ?? 0) >= 80 &&
        Boolean(window.__twinScene?.getObjectByName?.('RoomLabels') || window.__perf?.scenes?.[0]?.getObjectByName('RoomLabels')),
      { timeout: 90_000 },
    )
    .catch(() => {})
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 2200)))
}

async function lookAt(page, eye, target) {
  await page.evaluate(async (eye, target) => {
    const rig = window.__twinRig
    if (!rig?.setLookAt) return
    rig.smoothTime = 0
    rig.maxPolarAngle = Math.PI
    await rig.setLookAt(eye[0], eye[1], eye[2], target[0], target[1], target[2], false)
    rig.update?.(0)
  }, eye, target)
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 450)))
}

async function focusAlarm(page) {
  await page.waitForFunction(() => window.__twinMonitorBoxes?.alarm, { timeout: 45_000 }).catch(() => {})
  const deskId = await page.evaluate(() => window.__twinMonitorBoxes?.alarm?.deskId ?? null)
  if (deskId) {
    await page.evaluate((floor, desk) => window.__twinFocusDevice?.({ floor, deskId: desk }), 'F12', deskId)
    await page.waitForFunction((id) => window.__twinLocate?.deskId === id, { timeout: 20_000 }, deskId).catch(() => {})
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 700)))
  }
}

async function shot(page, name) {
  await mkdir(shotDir, { recursive: true })
  await mkdir(evidenceDir, { recursive: true })
  const dest = resolve(shotDir, `${name}.png`)
  const canvas = await page.$('canvas')
  if (canvas) await canvas.screenshot({ path: dest })
  else await page.screenshot({ path: dest })
  await writeFile(resolve(evidenceDir, `${name}.png`), await readFile(dest))
  return dest
}

function pixelDiff(aPath, bPath, outPath) {
  const py = `
from PIL import Image
import json
a = Image.open(${JSON.stringify(aPath)}).convert('RGB')
b = Image.open(${JSON.stringify(bPath)}).convert('RGB')
if a.size != b.size:
    b = b.resize(a.size)
w, h = a.size
pa, pb = a.load(), b.load()
vis = Image.new('RGB', (w, h))
pv = vis.load()
diff_n = 0
acc = 0
maxd = 0
for y in range(h):
    for x in range(w):
        ra,ga,ba = pa[x,y]
        rb,gb,bb = pb[x,y]
        d = abs(ra-rb)+abs(ga-gb)+abs(ba-bb)
        acc += d
        if d > maxd: maxd = d
        if d > 12:
            diff_n += 1
            pv[x,y] = (255, 32, 32)
        else:
            pv[x,y] = (ra//3, ga//3, ba//3)
total = w*h
vis.save(${JSON.stringify(outPath)})
print(json.dumps({
  "width": w, "height": h,
  "meanAbs": acc / (total*3),
  "maxChannelSum": maxd,
  "pctChanged": 100*diff_n/total,
  "changedPixels": diff_n,
}))
`
  const result = spawnSync('python3', ['-c', py], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr || 'pixel diff failed')
  return JSON.parse(result.stdout)
}

async function openF12(browser, url, quality) {
  const page = await browser.newPage()
  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  await page.goto(`${url}/?q=${quality}&view=floor&floor=F12`, { waitUntil: 'load', timeout: 120_000 })
  await waitReady(page, quality)
  await waitFloor(page)
  return page
}

async function main() {
  await mkdir(shotDir, { recursive: true })
  await mkdir(evidenceDir, { recursive: true })
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
  const report = { currentUrl, cUrl, method: 'F12 alarm/occlusion/label vs c540776', cases: {}, failures: [] }
  for (const quality of ['balanced', 'perf']) {
    for (const [name, pose] of Object.entries(POSES)) {
      const key = `${name}-${quality}`
      const current = await openF12(browser, currentUrl, quality)
      if (pose === 'alarm') await focusAlarm(current)
      else if (pose) await lookAt(current, pose.eye, pose.target)
      const currentShot = await shot(current, `d153-c540-${key}-current`)
      await current.close()

      const baseline = await openF12(browser, cUrl, quality)
      if (pose === 'alarm') await focusAlarm(baseline)
      else if (pose) await lookAt(baseline, pose.eye, pose.target)
      const cShot = await shot(baseline, `d153-c540-${key}-c540776`)
      await baseline.close()

      const vis = resolve(shotDir, `d153-c540-${key}-diff.png`)
      const diff = pixelDiff(currentShot, cShot, vis)
      await writeFile(resolve(evidenceDir, `d153-c540-${key}-diff.png`), await readFile(vis))
      const unchanged = diff.pctChanged <= 0.35 && diff.meanAbs <= 1.2
      report.cases[key] = { quality, name, currentShot, cShot, diffShot: vis, unchanged, ...diff }
      if (!unchanged) report.failures.push(`${key} pct=${diff.pctChanged.toFixed(3)} meanAbs=${diff.meanAbs.toFixed(3)}`)
      console.error(`${key} meanAbs=${diff.meanAbs.toFixed(4)} pct=${diff.pctChanged.toFixed(3)} unchanged=${unchanged}`)
    }
  }
  report.ok = report.failures.length === 0
  await writeFile(resolve(evidenceDir, 'd153-vs-c540776.json'), JSON.stringify(report, null, 2))
  await writeFile(resolve(shotDir, 'd153-vs-c540776.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ok: report.ok, failures: report.failures, summary: Object.fromEntries(Object.entries(report.cases).map(([k, v]) => [k, { meanAbs: v.meanAbs, pctChanged: v.pctChanged, unchanged: v.unchanged }])) }, null, 2))
  await browser.close()
  if (!report.ok) process.exit(2)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
