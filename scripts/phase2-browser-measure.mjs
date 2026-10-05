#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5190'
const outDir = process.env.ARTIFACT_DIR ?? '/opt/cursor/artifacts/screenshots'

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
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1200)))
}

async function stats(page) {
  return page.evaluate(() => ({
    ...(window.__twinStats ?? {}),
    badges: window.__twinBadges ?? 0,
    fxReady: document.querySelector('.scene-root')?.dataset.fxReady ?? '',
    quality: document.querySelector('.scene-root')?.dataset.quality ?? '',
    warmup: window.__twinWarmup ?? null,
  }))
}

function relativeLuminance(r, g, b) {
  const lin = [r, g, b].map((value) => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
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

async function screenshotCanvas(page, name) {
  const canvas = await page.$('canvas')
  const file = resolve(outDir, `${name}.png`)
  await canvas.screenshot({ path: file })
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
  return file
}

function ratioFrom(alarm, normal) {
  if (!alarm || !normal || !(normal.L > 0)) return null
  return alarm.L / normal.L
}

const DISPLAY_TARGET = {
  alarm: { r: 255, g: 128, b: 120 },
  online: { r: 23, g: 106, b: 64 },
}

function refineStatusBox(data, width, height, seed, kind) {
  if (!seed) return null
  const target = DISPLAY_TARGET[kind]
  const cx = seed.x + seed.w / 2
  const cy = seed.y + seed.h / 2
  let best = null
  let bestDist = Infinity
  for (const search of [12, 22, 40]) {
    for (let y = Math.floor(cy - search); y < cy + search; y += 1) {
      for (let x = Math.floor(cx - search); x < cx + search; x += 1) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue
        const offset = (y * width + x) * 4
        const r = data[offset]
        const g = data[offset + 1]
        const b = data[offset + 2]
        const dist = Math.abs(r - target.r) + Math.abs(g - target.g) + Math.abs(b - target.b)
        const hueOk =
          kind === 'alarm' ? r > 160 && r > g + 36 && r > b + 36 : g > 70 && g > r + 16 && g > b
        if (!hueOk) continue
        if (dist < bestDist) {
          bestDist = dist
          best = { x, y, r, g, b, dist }
        }
      }
    }
    if (best && best.dist < 90) break
  }
  if (!best) return { ...seed }
  return { x: best.x, y: best.y, w: 1, h: 1, seed, peak: best }
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

async function open(browser, search) {
  const page = await browser.newPage()
  page.setDefaultTimeout(90_000)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  const consoles = []
  const requests = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') consoles.push({ type: msg.type(), text: msg.text() })
  })
  page.on('pageerror', (error) => consoles.push({ type: 'pageerror', text: error.message }))
  page.on('request', (request) => requests.push(request.url()))
  await page.goto(`${baseUrl}/${search}`, { waitUntil: 'networkidle0' })
  await waitReady(page)
  return { page, consoles, requests }
}

async function main() {
  await mkdir(outDir, { recursive: true })
  let browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--window-size=1366,768'],
  })
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

    await browser.close()
    browser = await puppeteer.launch({
      executablePath: chromePath(),
      headless: true,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--window-size=1366,768'],
    })

    for (const quality of ['perf', 'balanced']) {
      for (const floorId of ['F3', 'F12', 'F18']) {
        const name = `${floorId.toLowerCase()}-${quality}`
        const { page, consoles, requests } = await open(browser, `?q=${quality}&view=floor&floor=${floorId}`)
        await page.waitForFunction(
          (id) => window.__twinMonitorBoxes?.floorId === id && window.__twinMonitorBoxes.alarm && window.__twinMonitorBoxes.online,
          { timeout: 90_000 },
          floorId,
        )
        await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 600)))
        const boxes = await page.evaluate(() => window.__twinMonitorBoxes)
        const image = await pageImage(page)
        const data = Uint8ClampedArray.from(image.data)
        const alarmBox = refineStatusBox(data, image.width, image.height, boxes.alarm?.box, 'alarm')
        const onlineBox = refineStatusBox(data, image.width, image.height, boxes.online?.box, 'online')
        const alarm = alarmBox ? sampleBox(data, image.width, image.height, alarmBox) : null
        const online = onlineBox ? sampleBox(data, image.width, image.height, onlineBox) : null
        boxes.alarm = boxes.alarm ? { ...boxes.alarm, box: alarmBox } : null
        boxes.online = boxes.online ? { ...boxes.online, box: onlineBox } : null
        const shot = await annotateBoxes(page, `${name}-alarm-boxes`, [
          { ...boxes.alarm, color: '#ff3355', label: `alarm ${boxes.alarm?.deskId ?? ''}` },
          { ...boxes.online, color: '#22cc66', label: `online ${boxes.online?.deskId ?? ''}` },
        ])
        await screenshotCanvas(page, name)
        const external = requests.filter((url) => !url.startsWith(baseUrl) && !url.startsWith('data:') && !url.startsWith('blob:'))
        report.alarms[name] = {
          floorId,
          quality,
          boxes,
          alarm,
          online,
          ratio: ratioFrom(alarm, online),
          hueStillRed: alarm ? alarm.r > alarm.g && alarm.r > alarm.b : false,
          shot,
          consoles,
          external,
          ...(await stats(page)),
        }
        await page.close()
      }
    }

    for (const quality of ['perf', 'balanced']) {
      const { page } = await open(browser, `?q=${quality}`)
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
      const shot = await annotateBoxes(page, `highlight-${quality}`, [
        { box: boxes?.selected, color: '#ffcc33', label: `selected ${boxes?.selectedFloor ?? ''}` },
        { box: boxes?.neighbor, color: '#66aaff', label: `adjacent ${boxes?.neighborFloor ?? ''}` },
      ])
      report.highlight[quality] = {
        boxes,
        selected,
        neighbor,
        ratio: ratioFrom(selected, neighbor),
        shot,
      }
      await page.close()
    }

    const { page } = await open(browser, '?q=perf')
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

    await page.goto(`${baseUrl}/?q=perf`, { waitUntil: 'networkidle0' })
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

    await page.goto(`${baseUrl}/?q=perf`, { waitUntil: 'networkidle0' })
    await waitReady(page)
    const sequence = ['均衡', '性能', '均衡', '性能', '均衡']
    for (const label of sequence) {
      await page.click(`button[aria-label="画质：${label}"]`)
      await page.waitForFunction(
        (want) => {
          const quality = document.querySelector('.scene-root')?.dataset.quality
          const ready = document.querySelector('.scene-root')?.dataset.fxReady
          const calls = window.__twinStats?.calls ?? 0
          const triangles = window.__twinStats?.triangles ?? 0
          if (want === '均衡') return quality === 'balanced' && ready === '1' && calls >= 120
          return quality === 'perf' && ready === '0' && triangles > 0 && triangles < 25000 && calls <= 74
        },
        { timeout: 45_000 },
        label,
      )
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 600)))
      report.switches.push({ label, ...(await stats(page)) })
    }
    await page.close()
  } finally {
    await browser.close()
  }

  await writeFile(resolve(outDir, '../phase2-measure.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
