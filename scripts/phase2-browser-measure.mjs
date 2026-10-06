#!/usr/bin/env node
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5190'
const outDir = process.env.ARTIFACT_DIR ?? '/opt/cursor/artifacts/screenshots'
const evidenceDir = resolve(process.cwd(), 'docs/T012-evidence')

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

async function waitReady(page) {
  await page.waitForFunction(() => window.__twinReady === true && (window.__twinStats?.calls ?? 0) > 0, {
    timeout: 90_000,
  })
  await page
    .waitForFunction(
      () => {
        const quality = document.querySelector('.scene-root')?.dataset.quality
        if (quality !== 'balanced') return true
        return window.__twinComposerLive === true && document.querySelector('.scene-root')?.dataset.fxReady === '1'
      },
      { timeout: 45_000 },
    )
    .catch(() => {})
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1200)))
}

async function stats(page) {
  return page.evaluate(() => ({
    ...(window.__twinStats ?? {}),
    badges: window.__twinBadges ?? 0,
    fxReady: document.querySelector('.scene-root')?.dataset.fxReady ?? '',
    quality: document.querySelector('.scene-root')?.dataset.quality ?? '',
    warmup: window.__twinWarmup ?? null,
    memory: window.__twinMemory ?? null,
    glProbe: window.__twinGlProbe ?? null,
    budget: window.__twinOverlayBudget ?? null,
    inventory: window.__twinTargetInventory ?? null,
    blitSites: window.__twinBlitSites ?? null,
    composerLive: window.__twinComposerLive ?? false,
  }))
}

function relativeLuminance(r, g, b) {
  const lin = [r, g, b].map((value) => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

function rgbToHsv(r, g, b) {
  const rr = r / 255
  const gg = g / 255
  const bb = b / 255
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const delta = max - min
  let h = 0
  if (delta !== 0) {
    if (max === rr) h = ((gg - bb) / delta) % 6
    else if (max === gg) h = (bb - rr) / delta + 2
    else h = (rr - gg) / delta + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max }
}

function isRedHue(h) {
  return h <= 20 || h >= 340
}

function sampleBox(data, width, height, box) {
  const x0 = Math.max(0, Math.floor(box.x))
  const y0 = Math.max(0, Math.floor(box.y))
  const x1 = Math.min(width, Math.ceil(box.x + box.w))
  const y1 = Math.min(height, Math.ceil(box.y + box.h))
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const offset = (y * width + x) * 4
      r += data[offset]
      g += data[offset + 1]
      b += data[offset + 2]
      n += 1
    }
  }
  if (n === 0) return null
  r /= n
  g /= n
  b /= n
  return { r, g, b, hex: '#' + [r, g, b].map((value) => Math.round(value).toString(16).padStart(2, '0')).join(''), L: relativeLuminance(r, g, b) }
}

async function keepEvidence(file) {
  await mkdir(evidenceDir, { recursive: true })
  const dest = resolve(evidenceDir, file.split('/').pop())
  if (dest !== file) await copyFile(file, dest)
  return dest
}

async function screenshotCanvas(page, name) {
  const canvas = await page.$('canvas')
  const file = resolve(outDir, `${name}.png`)
  await canvas.screenshot({ path: file })
  await keepEvidence(file)
  return file
}

async function annotateBoxes(page, name, boxes) {
  const dataUrl = await page.evaluate((rects) => {
    const source = document.querySelector('canvas')
    const copy = document.createElement('canvas')
    copy.width = source.width
    copy.height = source.height
    const ctx = copy.getContext('2d')
    ctx.drawImage(source, 0, 0)
    for (const rect of rects) {
      if (!rect?.box) continue
      ctx.save()
      ctx.strokeStyle = rect.color
      ctx.lineWidth = 3
      ctx.strokeRect(rect.box.x, rect.box.y, rect.box.w, rect.box.h)
      ctx.fillStyle = rect.color
      ctx.font = '16px sans-serif'
      ctx.fillText(rect.label, rect.box.x, Math.max(14, rect.box.y - 6))
      ctx.restore()
    }
    return copy.toDataURL('image/png')
  }, boxes)
  const file = resolve(outDir, `${name}.png`)
  const bytes = Buffer.from(dataUrl.split(',')[1], 'base64')
  await writeFile(file, bytes)
  await keepEvidence(file)
  return file
}

function ratioFrom(alarm, normal) {
  if (!alarm || !normal || !(normal.L > 0)) return null
  return alarm.L / normal.L
}

function boxAreaOk(box) {
  return box && box.w >= 4 && box.h >= 4
}

function samplePatches(data, width, height, entry) {
  if (!entry?.box) return []
  const boxes = [
    { name: 'full', box: entry.box },
    ...((entry.patches ?? []).filter((patch) => boxAreaOk(patch.box))),
  ].filter((item) => boxAreaOk(item.box))
  return boxes.map((item) => ({
    name: item.name,
    box: item.box,
    sample: sampleBox(data, width, height, item.box),
  }))
}

function bestInnerBox(data, width, height, seed, target) {
  if (!boxAreaOk(seed)) return null
  let best = { x: seed.x, y: seed.y, w: 4, h: 4 }
  let bestDist = Infinity
  const x0 = Math.floor(seed.x)
  const y0 = Math.floor(seed.y)
  const x1 = Math.max(x0, Math.ceil(seed.x + seed.w) - 4)
  const y1 = Math.max(y0, Math.ceil(seed.y + seed.h) - 4)
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const sample = sampleBox(data, width, height, { x, y, w: 4, h: 4 })
      if (!sample) continue
      const dist = Math.abs(sample.r - target.r) + Math.abs(sample.g - target.g) + Math.abs(sample.b - target.b)
      if (dist < bestDist) {
        bestDist = dist
        best = { x, y, w: 4, h: 4 }
      }
    }
  }
  return { box: best, sample: sampleBox(data, width, height, best), dist: bestDist }
}

async function flyToDesk(page, floorId, deskId) {
  await page.evaluate(
    (floor, desk) => {
      window.__twinFocusDevice?.({ floor, deskId: desk })
    },
    floorId,
    deskId,
  )
  await page
    .waitForFunction((id) => window.__twinLocate?.deskId === id, { timeout: 20_000 }, deskId)
    .catch(() => {})
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 700)))
}

async function pageImage(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    const copy = document.createElement('canvas')
    copy.width = canvas.width
    copy.height = canvas.height
    const ctx = copy.getContext('2d')
    ctx.drawImage(canvas, 0, 0)
    const image = ctx.getImageData(0, 0, copy.width, copy.height)
    return { width: copy.width, height: copy.height, data: Array.from(image.data) }
  })
}

async function lookAt(page, eye, target) {
  return page.evaluate(
    async (from, to) => {
      const rig = window.__twinRig
      if (!rig?.setLookAt) return false
      rig.maxPolarAngle = Math.PI
      await rig.setLookAt(from[0], from[1], from[2], to[0], to[1], to[2], false)
      rig.update?.(0)
      return true
    },
    eye,
    target,
  )
}

function launchBrowser() {
  return puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--window-size=1366,768'],
  })
}

const session = { browser: null, opened: 0 }

async function recycleBrowser() {
  session.opened += 1
  if (!session.browser || session.opened % 3 === 0) {
    if (session.browser) await session.browser.close().catch(() => {})
    session.browser = await launchBrowser()
  }
}

async function open(_browserOrSearch, searchOrViewport, maybeViewport) {
  const search = typeof _browserOrSearch === 'string' ? _browserOrSearch : searchOrViewport
  const viewport = typeof _browserOrSearch === 'string' ? searchOrViewport : maybeViewport
  await recycleBrowser()
  const page = await session.browser.newPage()
  page.setDefaultTimeout(90_000)
  await page.setViewport({ ...(viewport ?? { width: 1366, height: 768 }), deviceScaleFactor: 1 })
  const consoles = []
  const requests = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') consoles.push({ type: msg.type(), text: msg.text() })
  })
  page.on('pageerror', (error) => consoles.push({ type: 'pageerror', text: error.message }))
  page.on('request', (request) => requests.push(request.url()))
  const keep = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  keep.set('keepDrawingBuffer', '1')
  await page.goto(`${baseUrl}/?${keep.toString()}`, { waitUntil: 'load' })
  await waitReady(page)
  return { page, consoles, requests }
}

async function main() {
  await mkdir(outDir, { recursive: true })
  await mkdir(evidenceDir, { recursive: true })
  session.browser = await launchBrowser()
  session.opened = 0
  const report = { views: {}, switches: [], badges: {}, alarms: {}, highlight: {}, stone: {}, network: {} }

  try {
    for (const [name, search] of [
      ['overview-perf', '?q=perf'],
      ['overview-balanced', '?q=balanced'],
      ['east-balanced', '?q=balanced&cam=east'],
      ['p2f000-balanced', '?q=balanced&cam=p2f000'],
      ['p2f002-balanced', '?q=balanced&cam=p2f002'],
      ['p2f003-balanced', '?q=balanced&cam=p2f003'],
      ['f12-perf', '?q=perf&view=floor&floor=F12'],
      ['f12-balanced', '?q=balanced&view=floor&floor=F12'],
    ]) {
      const { page, consoles, requests } = await open(browser, search)
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 800)))
      const measured = await stats(page)
      const shot = await screenshotCanvas(page, name)
      const postfx = requests.filter((url) => /balancedFx|n8ao|postprocessing/i.test(url))
      const external = requests.filter((url) => !url.startsWith(baseUrl) && !url.startsWith('data:') && !url.startsWith('blob:'))
      report.views[name] = { ...measured, shot, consoles, postfx, external }
      if (name === 'east-balanced') {
        const image = await pageImage(page)
        const data = Uint8ClampedArray.from(image.data)
        report.stone = sampleBox(data, image.width, image.height, { x: image.width * 0.38, y: image.height * 0.62, w: image.width * 0.18, h: image.height * 0.1 })
      }
      await page.close()
    }

    await session.browser.close().catch(() => {})
    session.browser = await launchBrowser()
    session.opened = 0

    for (const quality of ['perf', 'balanced']) {
      for (const viewport of [
        { width: 1366, height: 768 },
        { width: 1024, height: 768 },
        { width: 1920, height: 1080 },
      ]) {
        for (const floorId of ['F3', 'F12', 'F18']) {
          const name = `${floorId.toLowerCase()}-${quality}-${viewport.width}x${viewport.height}`
          const { page, consoles, requests } = await open(
            browser,
            `?q=${quality}&view=floor&floor=${floorId}`,
            viewport,
          )
          const fold = await page.$('button[aria-label="折叠楼层栏"]')
          if (fold) await fold.click()
          await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)))
          await page.waitForFunction(
            (id) =>
              window.__twinInterior?.floorId === id &&
              (window.__twinInterior?.renderedDesks ?? 0) >= 80 &&
              window.__twinMonitorBoxes?.floorId === id &&
              window.__twinMonitorBoxes.alarm &&
              window.__twinMonitorBoxes.online,
            { timeout: 90_000 },
            floorId,
          )
          await screenshotCanvas(page, `${name}-slab`)
          const deskIds = await page.evaluate((id) => {
            const devices = window.__twinDevices ?? []
            const alarm =
              window.__twinMonitorBoxes?.alarm?.deskId ??
              devices.find((device) => device.floorId === id && device.status === 'alarm' && device.deskId)?.deskId
            const online =
              window.__twinMonitorBoxes?.online?.deskId ??
              devices.find((device) => device.floorId === id && device.status === 'online' && device.deskId)?.deskId
            return { alarm, online }
          }, floorId)
          await flyToDesk(page, floorId, deskIds.alarm)
          await page
            .waitForFunction((id) => window.__twinMonitorBoxes?.alarm?.deskId === id && window.__twinMonitorBoxes.alarm.box.w >= 8, {
              timeout: 20_000,
            }, deskIds.alarm)
            .catch(() => {})
          await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)))
          const alarmBoxes = await page.evaluate(() => window.__twinMonitorBoxes)
          const alarmImage = await pageImage(page)
          const alarmData = Uint8ClampedArray.from(alarmImage.data)
          const alarmInner = bestInnerBox(alarmData, alarmImage.width, alarmImage.height, alarmBoxes.alarm?.box, {
            r: 255,
            g: 106,
            b: 92,
          })
          const alarmPatches = [
            ...samplePatches(alarmData, alarmImage.width, alarmImage.height, alarmBoxes.alarm),
            ...(alarmInner ? [{ name: 'inner4', box: alarmInner.box, sample: alarmInner.sample }] : []),
          ]
          const shot = await annotateBoxes(page, `${name}-alarm-boxes`, [
            { box: alarmBoxes.alarm?.box, color: '#ff3355', label: `alarm ${alarmBoxes.alarm?.deskId ?? ''}` },
            ...(alarmBoxes.alarm?.patches ?? []).map((patch) => ({ box: patch.box, color: '#ff88aa', label: patch.name })),
            ...(alarmInner ? [{ box: alarmInner.box, color: '#ffcc00', label: 'inner4' }] : []),
          ])
          await flyToDesk(page, floorId, deskIds.online)
          await page
            .waitForFunction((id) => window.__twinMonitorBoxes?.online?.deskId === id && window.__twinMonitorBoxes.online.box.w >= 8, {
              timeout: 20_000,
            }, deskIds.online)
            .catch(() => {})
          await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)))
          const onlineBoxes = await page.evaluate(() => window.__twinMonitorBoxes)
          const onlineImage = await pageImage(page)
          const onlineData = Uint8ClampedArray.from(onlineImage.data)
          const onlineInner = bestInnerBox(onlineData, onlineImage.width, onlineImage.height, onlineBoxes.online?.box, {
            r: 23,
            g: 106,
            b: 64,
          })
          const onlineMean = onlineInner?.sample ?? samplePatches(onlineData, onlineImage.width, onlineImage.height, onlineBoxes.online)[0]?.sample ?? null
          const patchRatios = alarmPatches
            .map((item) => ({
              name: item.name,
              box: item.box,
              sample: item.sample,
              hsv: item.sample ? rgbToHsv(item.sample.r, item.sample.g, item.sample.b) : null,
              ratio: ratioFrom(item.sample, onlineMean),
            }))
            .filter((item) => item.ratio != null)
          const worst = patchRatios.reduce((best, item) => (best == null || item.ratio < best.ratio ? item : best), null)
          const alarm = worst?.sample ?? alarmInner?.sample ?? alarmPatches[0]?.sample ?? null
          const hsv = alarm ? rgbToHsv(alarm.r, alarm.g, alarm.b) : null
          const boxes = { ...alarmBoxes, online: onlineBoxes.online }
          await screenshotCanvas(page, name)
          const external = requests.filter((url) => !url.startsWith(baseUrl) && !url.startsWith('data:') && !url.startsWith('blob:'))
          const entry = {
            floorId,
            quality,
            viewport,
            boxes,
            alarm,
            online: onlineMean,
            patches: patchRatios,
            ratio: worst?.ratio ?? null,
            minRatio: worst?.ratio ?? null,
            hsv,
            hueStillRed: hsv ? isRedHue(hsv.h) : false,
            saturationOk: hsv ? hsv.s >= 0.5 : false,
            notWhite: alarm ? alarm.r - Math.max(alarm.g, alarm.b) > 24 : false,
            shot,
            consoles,
            external,
            ...(await stats(page)),
          }
          report.alarms[name] = entry
          if (viewport.width === 1366) report.alarms[`${floorId.toLowerCase()}-${quality}`] = entry
          await writeFile(resolve(evidenceDir, `${name}-alarm-boxes.json`), JSON.stringify(entry, null, 2))
          await page.close()
        }
      }
    }

    for (const quality of ['perf', 'balanced']) {
      for (const viewport of [
        { width: 1366, height: 768 },
        { width: 1024, height: 768 },
        { width: 1920, height: 1080 },
      ]) {
        const key = `${quality}-${viewport.width}x${viewport.height}`
        const { page } = await open(browser, `?q=${quality}`, viewport)
        await page.waitForFunction(() => (window.__twinBadgeCenters ?? []).length >= 12, { timeout: 30_000 })
        const hit = await page.evaluate(() => {
          const center = (window.__twinBadgeCenters ?? []).find((item) => item.id === 'F12')
          if (!center || !window.__twinProject) return null
          return { id: center.id, ...window.__twinProject(center.x, center.y, center.z) }
        })
        if (hit && !hit.behind) {
          await page.mouse.click(hit.x, hit.y)
        }
        await page.evaluate(() => window.__twinSelectFloor?.('F12'))
        await page.waitForFunction(() => window.__twinSelected === 'F12' && window.__twinView === 'building' && window.__twinFacadeBoxes?.selectedFloor === 'F12', {
          timeout: 20_000,
        })
        await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)))
        const boxes = await page.evaluate(() => window.__twinFacadeBoxes)
        const image = await pageImage(page)
        const data = Uint8ClampedArray.from(image.data)
        const selected = boxes ? sampleBox(data, image.width, image.height, boxes.selected) : null
        const neighbor = boxes ? sampleBox(data, image.width, image.height, boxes.neighbor) : null
        const shot = await annotateBoxes(page, `highlight-${key}`, [
          { box: boxes?.selected, color: '#ffcc33', label: `selected ${boxes?.selectedFloor ?? ''}` },
          { box: boxes?.neighbor, color: '#66aaff', label: `adjacent ${boxes?.neighborFloor ?? ''}` },
        ])
        const entry = {
          viewport,
          boxes,
          selected,
          neighbor,
          ratio: ratioFrom(selected, neighbor),
          overlap:
            boxes?.selected && boxes?.neighbor
              ? boxes.selected.y < boxes.neighbor.y + boxes.neighbor.h &&
                boxes.selected.y + boxes.selected.h > boxes.neighbor.y &&
                boxes.selected.x < boxes.neighbor.x + boxes.neighbor.w &&
                boxes.selected.x + boxes.selected.w > boxes.neighbor.x
              : null,
          shot,
        }
        report.highlight[key] = entry
        await writeFile(resolve(evidenceDir, `highlight-boxes-${key}.json`), JSON.stringify(entry, null, 2))
        if (viewport.width === 1366) report.highlight[quality] = entry
        await page.close()
      }
    }

    report.occlusion = {}
    for (const quality of ['perf', 'balanced']) {
      const { page } = await open(browser, `?q=${quality}&view=floor&floor=F12`)
      await page.waitForFunction(() => window.__twinView === 'floor' && window.__twinSelected === 'F12', { timeout: 90_000 })
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 800)))
      const f12 = 48.16
      const angles = [
        ['f12-slab', [8, f12 + 9.4, 22], [0, f12 + 0.6, 0]],
        ['f12-low-oblique', [16, f12 + 2.1, 20], [0, f12 + 1.1, -2]],
        ['f12-behind-column', [8.4, f12 + 1.7, 12.4], [8.4, f12 + 1.2, 1]],
        ['f12-through-core', [0, f12 + 1.8, -1.2], [0, f12 + 1.1, 10]],
        ['f12-corridor', [18, f12 + 1.6, 6.6], [-10, f12 + 1.2, 6.6]],
      ]
      for (const [name, eye, target] of angles) {
        await lookAt(page, eye, target)
        await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)))
        const shot = await screenshotCanvas(page, `occlusion-${name}-${quality}`)
        report.occlusion[`${name}-${quality}`] = { shot, ...(await stats(page)) }
      }
      await page.close()

      const overview = await open(browser, `?q=${quality}`)
      await overview.page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 600)))
      report.occlusion[`overview-${quality}`] = {
        shot: await screenshotCanvas(overview.page, `occlusion-overview-${quality}`),
        budget: await overview.page.evaluate(() => window.__twinOverlayBudget ?? null),
        ...(await stats(overview.page)),
      }
      await overview.page.close()

      const east = await open(browser, `?q=${quality}&cam=east`)
      await east.page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 600)))
      report.occlusion[`east-${quality}`] = {
        shot: await screenshotCanvas(east.page, `occlusion-east-${quality}`),
        ...(await stats(east.page)),
      }
      await east.page.close()

      const exploded = await open(browser, `?q=${quality}`)
      await exploded.page.evaluate(() => window.__twinSetExploded?.(true))
      await exploded.page.waitForFunction(() => window.__twinExplode?.exploded === true, { timeout: 15_000 })
      await exploded.page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)))
      report.occlusion[`exploded-${quality}`] = {
        shot: await screenshotCanvas(exploded.page, `occlusion-exploded-${quality}`),
        explode: await exploded.page.evaluate(() => window.__twinExplode ?? null),
        ...(await stats(exploded.page)),
      }
      await exploded.page.close()
    }

    const { page, consoles } = await open(browser, '?q=perf')
    const clicks = []
    for (let index = 0; index < 23; index += 1) {
      const hit = await page.evaluate((i) => {
        const centers = window.__twinBadgeCenters ?? []
        const center = centers[i]
        if (!center || !window.__twinProject) return null
        return { id: center.id, ...window.__twinProject(center.x, center.y, center.z) }
      }, index)
      if (!hit || hit.behind) {
        clicks.push({ index, ok: false, reason: 'no-center' })
        continue
      }
      await page.mouse.click(hit.x, hit.y)
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 120)))
      const selected = await page.evaluate(() => window.__twinSelected ?? null)
      clicks.push({ index, id: hit.id, x: hit.x, y: hit.y, selected, ok: selected === hit.id })
    }
    report.badges.clicks = clicks

    await page.goto(`${baseUrl}/?q=perf&keepDrawingBuffer=1`, { waitUntil: 'networkidle0' })
    await waitReady(page)
    const tower = await page.evaluate(() => {
      const project = window.__twinProject
      if (!project) return null
      // 塔楼南立面中部，躲开徽标
      return project(0, 28, 16)
    })
    if (tower && !tower.behind) {
      await page.mouse.click(tower.x, tower.y, { clickCount: 2 })
      await page.waitForFunction(() => window.__twinView === 'floor', { timeout: 15_000 }).catch(() => {})
    }
    report.badges.doubleClick = await page.evaluate(() => ({
      view: window.__twinView ?? null,
      floor: window.__twinSelected ?? null,
      chip: document.querySelector('.view-chip')?.textContent ?? '',
    }))

    await page.goto(`${baseUrl}/?q=perf&keepDrawingBuffer=1`, { waitUntil: 'networkidle0' })
    await waitReady(page)
    report.switches.push({ label: '性能(冷启动)', ...(await stats(page)), consoles: [] })
    const sequence = ['均衡', '性能', '均衡', '性能', '均衡', '性能', '均衡', '性能', '均衡']
    for (const label of sequence) {
      await page.click(`button[aria-label="画质：${label}"]`)
      await page.waitForFunction(
        (want) => {
          const quality = document.querySelector('.scene-root')?.dataset.quality
          const ready = document.querySelector('.scene-root')?.dataset.fxReady
          const calls = window.__twinStats?.calls ?? 0
          const triangles = window.__twinStats?.triangles ?? 0
          if (want === '均衡') return quality === 'balanced' && ready === '1' && window.__twinComposerLive === true && calls >= 100
          return quality === 'perf' && ready === '0' && triangles > 0 && triangles < 25000 && calls <= 74
        },
        { timeout: 45_000 },
        label,
      )
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 600)))
      report.switches.push({ label, ...(await stats(page)) })
    }
    report.switchConsoles = consoles
    await page.close()
  } finally {
    await session.browser.close().catch(() => {})
  }

  await writeFile(resolve(outDir, '../phase2-measure.json'), JSON.stringify(report, null, 2))
  await writeFile(resolve(evidenceDir, 'phase2-measure.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
