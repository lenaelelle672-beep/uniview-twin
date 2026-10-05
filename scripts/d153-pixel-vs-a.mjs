#!/usr/bin/env node
/** D153：同机位 F4/F12/F22/B1 × 均衡/性能，对 a 2d36d8d 像素对比。 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const currentUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const aUrl = (process.argv[3] ?? 'http://127.0.0.1:5192').replace(/\/$/, '')
const evidenceDir = resolve(process.cwd(), 'docs/T012-evidence')
const shotDir = process.env.ARTIFACT_DIR ?? '/opt/cursor/artifacts/screenshots'
const FLOORS = (process.env.FLOORS ?? 'F4,F12,F22,B1').split(',').map((id) => id.trim())
const QUALITIES = (process.env.QUALITIES ?? 'balanced,perf').split(',').map((id) => id.trim())

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

async function waitFloor(page, floorId) {
  const wantDesks = floorId === 'B1' ? 8 : 80
  await page
    .waitForFunction(
      (id, desks) => {
        const interior = window.__twinInterior
        if (interior?.floorId === id && (interior.renderedDesks ?? 0) >= desks) return true
        if (window.__twinView === 'floor' && window.__twinSelected === id && (interior?.renderedDesks ?? 0) >= desks) {
          return true
        }
        const root = document.querySelector('.scene-root')
        return root?.dataset.view === 'floor' && (interior?.renderedDesks ?? 0) >= desks
      },
      { timeout: 90_000 },
      floorId,
      wantDesks,
    )
    .catch(() => {})
  await page
    .waitForFunction(
      () =>
        Boolean(
          window.__twinScene?.getObjectByName?.('RoomLabels') ||
            window.__perf?.scenes?.[0]?.getObjectByName('RoomLabels') ||
            window.__twinSlab,
        ),
      { timeout: 30_000 },
    )
    .catch(() => {})
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 3200)))
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

async function readPose(page) {
  return page.evaluate(() => {
    const rig = window.__twinRig
    const cam = rig?.camera
    if (!cam) return null
    const position = { x: cam.position.x, y: cam.position.y, z: cam.position.z }
    const target = { x: 0, y: 0, z: 0 }
    if (typeof rig.getTarget === 'function') {
      const out = {
        x: 0,
        y: 0,
        z: 0,
        set(x, y, z) {
          this.x = x
          this.y = y
          this.z = z
          return this
        },
      }
      const got = rig.getTarget(out)
      target.x = got?.x ?? out.x
      target.y = got?.y ?? out.y
      target.z = got?.z ?? out.z
    } else {
      const e = cam.matrixWorld.elements
      target.x = position.x - e[8] * 48
      target.y = position.y - e[9] * 48
      target.z = position.z - e[10] * 48
    }
    return {
      position: [position.x, position.y, position.z],
      target: [target.x, target.y, target.z],
      fov: cam.fov ?? null,
    }
  })
}

async function applyPose(page, pose) {
  if (!pose) return
  await page.evaluate((next) => {
    const rig = window.__twinRig
    if (!rig || typeof rig.setLookAt !== 'function') return
    rig.smoothTime = 0
    rig.maxPolarAngle = Math.PI
    if (rig.camera && next.fov) {
      rig.camera.fov = next.fov
      rig.camera.updateProjectionMatrix()
    }
    void rig.setLookAt(next.position[0], next.position[1], next.position[2], next.target[0], next.target[1], next.target[2], false)
    rig.update?.(0)
  }, pose)
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)))
}

async function collectCBoxes(page) {
  return page.evaluate(() => {
    const boxes = []
    const add = (box, source) => {
      if (!box) return
      boxes.push({ source, x: box.x, y: box.y, w: box.w, h: box.h })
    }
    const monitors = window.__twinMonitorBoxes
    add(monitors?.alarm?.box, 'MonitorSamples.alarm')
    add(monitors?.online?.box, 'MonitorSamples.online')
    for (const patch of monitors?.alarm?.patches ?? []) add(patch.box, `MonitorSamples.alarm.${patch.name}`)
    for (const patch of monitors?.online?.patches ?? []) add(patch.box, `MonitorSamples.online.${patch.name}`)
    const scene = window.__twinScene ?? window.__perf?.scenes?.[0]
    const camera = window.__twinRig?.camera
    const canvas = document.querySelector('canvas')
    if (scene && camera && canvas && window.THREE == null) {
      const width = canvas.width
      const height = canvas.height
      scene.traverse((object) => {
        const name = object.name || ''
        if (!/DeviceBadges|DeskFlash|BadgeAlarm|highlight/i.test(name)) return
        if (!object.visible) return
        object.updateWorldMatrix?.(true, false)
        const box3 = object.userData?.__box
        if (!box3 && object.geometry?.boundingBox == null && object.geometry?.computeBoundingBox) {
          object.geometry.computeBoundingBox()
        }
      })
    }
    return boxes
  })
}

async function openFloor(browser, url, quality, floorId) {
  const page = await browser.newPage()
  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  await page.goto(`${url}/?q=${quality}&view=floor&floor=${floorId}`, { waitUntil: 'load', timeout: 120_000 })
  await waitReady(page, quality)
  await waitFloor(page, floorId)
  return page
}

function pixelDiff(aPath, bPath, outPath, maskBoxes) {
  const py = `
from pathlib import Path
from PIL import Image, ImageDraw
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
mask = set()
boxes = ${JSON.stringify(maskBoxes ?? [])}
pad = 6
for box in boxes:
    x0 = max(0, int(box['x']) - pad)
    y0 = max(0, int(box['y']) - pad)
    x1 = min(w, int(box['x'] + box['w']) + pad)
    y1 = min(h, int(box['y'] + box['h']) + pad)
    for y in range(y0, y1):
        for x in range(x0, x1):
            mask.add((x, y))
other_n = 0
other_diff = 0
other_acc = 0
for y in range(h):
    for x in range(w):
        ra,ga,ba = pa[x,y]
        rb,gb,bb = pb[x,y]
        d = abs(ra-rb)+abs(ga-gb)+abs(ba-bb)
        acc += d
        if d > maxd: maxd = d
        changed = d > 12
        if changed:
            diff_n += 1
            pv[x,y] = (255, 32, 32)
        else:
            pv[x,y] = (ra//3, ga//3, ba//3)
        if (x, y) not in mask:
            other_n += 1
            other_acc += d
            if changed: other_diff += 1
total = w*h
vis.save(${JSON.stringify(outPath)})
print(json.dumps({
  "width": w, "height": h,
  "meanAbs": acc / (total*3),
  "maxChannelSum": maxd,
  "pctChanged": 100*diff_n/total,
  "changedPixels": diff_n,
  "otherMeanAbs": (other_acc / (other_n*3)) if other_n else 0,
  "otherPctChanged": (100*other_diff/other_n) if other_n else 0,
  "otherChangedPixels": other_diff,
  "maskedPixels": len(mask),
}))
`
  const result = spawnSync('python3', ['-c', py], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr || 'pixel diff failed')
  return JSON.parse(result.stdout)
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
  const report = {
    currentUrl,
    aUrl,
    method: 'same-camera canvas 1366x768 vs a 2d36d8d',
    threshold: 'channelSum>12',
    cases: {},
    failures: [],
  }
  for (const quality of QUALITIES) {
    for (const floorId of FLOORS) {
      const key = `${floorId.toLowerCase()}-${quality}`
      const baseline = await openFloor(browser, aUrl, quality, floorId)
      const aPose = await readPose(baseline)
      const aShot = await shot(baseline, `d153-a-compare-${key}-a`)
      const aDesks = await baseline.evaluate(() => window.__twinInterior?.renderedDesks ?? 0)
      await baseline.close()

      const current = await openFloor(browser, currentUrl, quality, floorId)
      await applyPose(current, aPose)
      const pose = await readPose(current)
      const cBoxes = await collectCBoxes(current)
      const currentShot = await shot(current, `d153-a-compare-${key}-current`)
      const cut = await current.evaluate(() => window.__twinCut ?? null)
      const desks = await current.evaluate(() => window.__twinInterior?.renderedDesks ?? 0)
      await current.close()

      const vis = resolve(shotDir, `d153-a-compare-${key}-diff.png`)
      const diff = pixelDiff(currentShot, aShot, vis, cBoxes)
      await writeFile(resolve(evidenceDir, `d153-a-compare-${key}-diff.png`), await readFile(vis))
      const row = {
        quality,
        floorId,
        pose,
        aPose,
        desks,
        aDesks,
        cut,
        cBoxes,
        currentShot,
        aShot,
        diffShot: vis,
        ...diff,
        otherRegionsClean: diff.otherPctChanged <= 0.15,
      }
      report.cases[key] = row
      if (!row.otherRegionsClean) report.failures.push(`${key} otherPctChanged ${diff.otherPctChanged.toFixed(3)}`)
      console.error(
        `${key} meanAbs=${diff.meanAbs.toFixed(4)} pct=${diff.pctChanged.toFixed(3)} otherPct=${diff.otherPctChanged.toFixed(3)} desks=${desks}/${aDesks}`,
      )
    }
  }
  report.ok = report.failures.length === 0
  await writeFile(resolve(evidenceDir, 'd153-pixel-vs-a.json'), JSON.stringify(report, null, 2))
  await writeFile(resolve(shotDir, 'd153-pixel-vs-a.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ok: report.ok, failures: report.failures, summary: Object.fromEntries(Object.entries(report.cases).map(([k, v]) => [k, { meanAbs: v.meanAbs, pctChanged: v.pctChanged, otherPctChanged: v.otherPctChanged }])) }, null, 2))
  await browser.close()
  if (!report.ok) process.exit(2)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
