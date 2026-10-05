#!/usr/bin/env node
/** D155：F4→F12→F22 格栅 hi/lo 裁切 + 影子，对照 b d76c562。 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const currentUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const bUrl = (process.argv[3] ?? 'http://127.0.0.1:5195').replace(/\/$/, '')
const evidenceDir = resolve(process.cwd(), 'docs/T012-evidence')
const shotDir = process.env.ARTIFACT_DIR ?? '/opt/cursor/artifacts/screenshots'
const FLOORS = ['F4', 'F12', 'F22']

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

async function waitReady(page) {
  await page.waitForFunction(() => window.__twinReady === true, { timeout: 90_000 })
  await page
    .waitForFunction(
      () => window.__twinComposerLive === true && document.querySelector('.scene-root')?.dataset.fxReady === '1',
      { timeout: 45_000 },
    )
    .catch(() => {})
}

async function waitFloor(page, floorId) {
  await page
    .waitForFunction(
      (id) =>
        (window.__twinView === 'floor' || document.querySelector('.scene-root')?.dataset.view === 'floor') &&
        (window.__twinInterior?.renderedDesks ?? 0) >= 80,
      { timeout: 90_000 },
      floorId,
    )
    .catch(() => {})
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 2200)))
}

async function inspectGrille(page) {
  return page.evaluate(() => {
    const scene = window.__twinScene ?? window.__perf?.scenes?.[0]
    const rows = []
    scene?.getObjectByName('EastGrille')?.traverse((object) => {
      const list = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []
      for (const material of list) {
        if (material?.name !== 'east_grille') continue
        const plane = material.clippingPlanes?.[0]
        rows.push({
          mesh: object.name || null,
          url: object.userData?.url ?? null,
          clipCount: material.clippingPlanes?.length ?? 0,
          clipShadows: Boolean(material.clipShadows),
          constant: plane?.constant ?? null,
          normalY: plane?.normal?.y ?? null,
          depthClip: object.customDepthMaterial?.clippingPlanes?.length ?? 0,
          depthClipShadows: Boolean(object.customDepthMaterial?.clipShadows),
        })
      }
    })
    return {
      view: window.__twinView ?? document.querySelector('.scene-root')?.dataset.view ?? null,
      selected: window.__twinSelected ?? null,
      rows,
    }
  })
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
for y in range(h):
    for x in range(w):
        ra,ga,ba = pa[x,y]
        rb,gb,bb = pb[x,y]
        d = abs(ra-rb)+abs(ga-gb)+abs(ba-bb)
        acc += d
        if d > 12:
            diff_n += 1
            pv[x,y] = (255, 32, 32)
        else:
            pv[x,y] = (ra//3, ga//3, ba//3)
vis.save(${JSON.stringify(outPath)})
print(json.dumps({"meanAbs": acc/(w*h*3), "pctChanged": 100*diff_n/(w*h), "changedPixels": diff_n}))
`
  const result = spawnSync('python3', ['-c', py], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr || 'pixel diff failed')
  return JSON.parse(result.stdout)
}

async function openFloor(browser, url, floorId) {
  const page = await browser.newPage()
  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  await page.goto(`${url}/?q=balanced&view=floor&floor=${floorId}`, { waitUntil: 'load', timeout: 120_000 })
  await waitReady(page)
  await waitFloor(page, floorId)
  return page
}

async function main() {
  await mkdir(shotDir, { recursive: true })
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
  const report = { currentUrl, bUrl, floors: {}, overview: {}, failures: [] }
  for (const floorId of FLOORS) {
    const current = await openFloor(browser, currentUrl, floorId)
    const inspect = await inspectGrille(current)
    const currentShot = await shot(current, `d155-grille-${floorId.toLowerCase()}-current`)
    await current.close()
    const baseline = await openFloor(browser, bUrl, floorId)
    const bInspect = await inspectGrille(baseline)
    const bShot = await shot(baseline, `d155-grille-${floorId.toLowerCase()}-b`)
    await baseline.close()
    const vis = resolve(shotDir, `d155-grille-${floorId.toLowerCase()}-diff.png`)
    const diff = pixelDiff(currentShot, bShot, vis)
    await writeFile(resolve(evidenceDir, `d155-grille-${floorId.toLowerCase()}-diff.png`), await readFile(vis))
    const clipped = inspect.rows.length > 0 && inspect.rows.every((row) => row.clipCount > 0 && row.clipShadows)
    const row = { inspect, bInspect, currentShot, bShot, diffShot: vis, clipped, ...diff }
    report.floors[floorId] = row
    if (!clipped) report.failures.push(`${floorId} grille not clipped`)
    console.error(`${floorId} clip=${clipped} meanAbs=${diff.meanAbs.toFixed(4)} pct=${diff.pctChanged.toFixed(3)} rows=${inspect.rows.length}`)
  }
  const overview = await browser.newPage()
  await overview.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  await overview.goto(`${currentUrl}/?q=balanced`, { waitUntil: 'load', timeout: 120_000 })
  await waitReady(overview)
  await overview.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1500)))
  report.overview = await inspectGrille(overview)
  report.overview.shot = await shot(overview, 'd155-grille-overview-current')
  const overviewClear = report.overview.rows.every((row) => !row.clipCount)
  if (!overviewClear) report.failures.push('overview still clipped')
  await overview.close()
  report.ok = report.failures.length === 0
  await writeFile(resolve(evidenceDir, 'd155-grille-cut.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ok: report.ok, failures: report.failures }, null, 2))
  await browser.close()
  if (!report.ok) process.exit(2)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
