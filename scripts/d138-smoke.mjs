#!/usr/bin/env node
/**
 * D138 抽查：总览均衡调用、F12 两档告警亮度、遮挡、切档 5 次资源、console/外网。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))
const puppeteer = require('puppeteer-core')
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const outDir = process.env.ARTIFACT_DIR ?? resolve(here, '../docs/T012-evidence')

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
  return { r, g, b, L: relativeLuminance(r, g, b) }
}

async function waitReady(page, quality) {
  await page.waitForFunction(() => window.__twinReady === true && (window.__twinStats?.calls ?? 0) > 0, {
    timeout: 90_000,
  })
  if (quality === 'balanced') {
    await page
      .waitForFunction(
        () => window.__twinComposerLive === true && document.querySelector('.scene-root')?.dataset.fxReady === '1',
        { timeout: 45_000 },
      )
      .catch(() => {})
  }
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 800)))
}

async function stats(page) {
  return page.evaluate(() => ({
    ...(window.__twinStats ?? {}),
    memory: window.__twinMemory ?? null,
    quality: document.querySelector('.scene-root')?.dataset.quality ?? '',
    composerLive: window.__twinComposerLive ?? false,
  }))
}

async function pageImage(page) {
  return page.evaluate(() => {
    const source = document.querySelector('canvas')
    const copy = document.createElement('canvas')
    copy.width = source.width
    copy.height = source.height
    const ctx = copy.getContext('2d')
    ctx.drawImage(source, 0, 0)
    const image = ctx.getImageData(0, 0, copy.width, copy.height)
    return { width: copy.width, height: copy.height, data: Array.from(image.data) }
  })
}

async function screenshotCanvas(page, name) {
  const canvas = await page.$('canvas')
  const file = resolve(outDir, `${name}.png`)
  await canvas.screenshot({ path: file })
  return file
}

function trackPage(page) {
  const consoles = []
  const requests = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') consoles.push({ type: msg.type(), text: msg.text() })
  })
  page.on('pageerror', (error) => consoles.push({ type: 'pageerror', text: error.message }))
  page.on('request', (request) => requests.push(request.url()))
  return { consoles, requests }
}

function summarizeNet(requests, consoles) {
  return {
    balancedFx: requests.filter((url) => /balancedFx/i.test(url)).length,
    external: requests.filter((url) => !url.startsWith(baseUrl) && !url.startsWith('data:') && !url.startsWith('blob:')),
    errors: consoles.filter((item) => item.type === 'error' || item.type === 'pageerror').length,
    warnings: consoles.filter((item) => item.type === 'warning').length,
    consoles,
  }
}

async function open(browser, search) {
  const page = await browser.newPage()
  page.setDefaultTimeout(90_000)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  const tracked = trackPage(page)
  await page.goto(`${baseUrl}/${search}`, { waitUntil: 'load' })
  const quality = /q=perf/.test(search) ? 'perf' : 'balanced'
  await waitReady(page, quality)
  return { page, ...tracked }
}

async function measureAlarm(page, floorId) {
  await page.waitForFunction(
    (id) =>
      window.__twinInterior?.floorId === id &&
      (window.__twinInterior?.renderedDesks ?? 0) >= 80 &&
      window.__twinMonitorBoxes?.alarm &&
      window.__twinMonitorBoxes?.online,
    { timeout: 90_000 },
    floorId,
  )
  const deskIds = await page.evaluate((id) => {
    const devices = window.__twinDevices ?? []
    return {
      alarm:
        window.__twinMonitorBoxes?.alarm?.deskId ??
        devices.find((device) => device.floorId === id && device.status === 'alarm' && device.deskId)?.deskId,
      online:
        window.__twinMonitorBoxes?.online?.deskId ??
        devices.find((device) => device.floorId === id && device.status === 'online' && device.deskId)?.deskId,
    }
  }, floorId)
  await page.evaluate(
    (floor, desk) => {
      window.__twinFocusDevice?.({ floor, deskId: desk })
    },
    floorId,
    deskIds.alarm,
  )
  await page.waitForFunction((id) => window.__twinLocate?.deskId === id, { timeout: 20_000 }, deskIds.alarm).catch(() => {})
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 700)))
  const alarmBoxes = await page.evaluate(() => window.__twinMonitorBoxes)
  const alarmImage = await pageImage(page)
  const alarmData = Uint8ClampedArray.from(alarmImage.data)
  const alarm = alarmBoxes.alarm?.box ? sampleBox(alarmData, alarmImage.width, alarmImage.height, alarmBoxes.alarm.box) : null
  await page.evaluate(
    (floor, desk) => {
      window.__twinFocusDevice?.({ floor, deskId: desk })
    },
    floorId,
    deskIds.online,
  )
  await page.waitForFunction((id) => window.__twinLocate?.deskId === id, { timeout: 20_000 }, deskIds.online).catch(() => {})
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 700)))
  const onlineBoxes = await page.evaluate(() => window.__twinMonitorBoxes)
  const onlineImage = await pageImage(page)
  const onlineData = Uint8ClampedArray.from(onlineImage.data)
  const online = onlineBoxes.online?.box ? sampleBox(onlineData, onlineImage.width, onlineImage.height, onlineBoxes.online.box) : null
  const hsv = alarm ? rgbToHsv(alarm.r, alarm.g, alarm.b) : null
  return {
    deskIds,
    alarm,
    online,
    ratio: alarm && online && online.L > 0 ? alarm.L / online.L : null,
    hsv,
    hueStillRed: hsv ? hsv.h <= 20 || hsv.h >= 340 : false,
  }
}

async function main() {
  await mkdir(outDir, { recursive: true })
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
  const report = { views: {}, alarms: {}, occlusion: {}, switches: [], failures: [] }

  try {
    for (const [name, search] of [
      ['overview-balanced', '?q=balanced'],
      ['overview-perf', '?q=perf'],
    ]) {
      const { page, consoles, requests } = await open(browser, search)
      const measured = await stats(page)
      const shot = await screenshotCanvas(page, `d138-${name}`)
      const net = summarizeNet(requests, consoles)
      report.views[name] = { ...measured, shot, ...net }
      if (name === 'overview-balanced' && measured.calls > 140) {
        report.failures.push(`总览均衡 calls ${measured.calls} > 140`)
      }
      if (name === 'overview-perf' && net.balancedFx > 0) {
        report.failures.push('性能档总览请求了 balancedFx')
      }
      if (net.errors || net.warnings) report.failures.push(`${name} console ${net.errors}/${net.warnings}`)
      if (net.external.length) report.failures.push(`${name} 外网 ${net.external.length}`)
      await page.close()
    }

    for (const quality of ['balanced', 'perf']) {
      const { page, consoles, requests } = await open(browser, `?q=${quality}&view=floor&floor=F12`)
      const measured = await stats(page)
      const shot = await screenshotCanvas(page, `d138-f12-${quality}`)
      const alarm = await measureAlarm(page, 'F12')
      await screenshotCanvas(page, `d138-f12-${quality}-alarm`)
      const net = summarizeNet(requests, consoles)
      report.alarms[`f12-${quality}`] = { ...measured, ...alarm, shot, ...net }
      if (alarm.ratio == null || alarm.ratio < 1.5) report.failures.push(`F12 ${quality} 告警比 ${alarm.ratio}`)
      if (!alarm.hueStillRed) report.failures.push(`F12 ${quality} 告警不是红`)
      if (net.errors || net.warnings) report.failures.push(`F12 ${quality} console ${net.errors}/${net.warnings}`)
      await page.close()
    }

    for (const quality of ['balanced', 'perf']) {
      const { page } = await open(browser, `?q=${quality}&view=floor&floor=F12`)
      await page.waitForFunction(() => window.__twinView === 'floor' && window.__twinSelected === 'F12', { timeout: 90_000 })
      const f12 = 48.16
      for (const [name, eye, target] of [
        ['slab', [8, f12 + 9.4, 22], [0, f12 + 0.6, 0]],
        ['behind-column', [8.4, f12 + 1.7, 12.4], [8.4, f12 + 1.2, 1]],
      ]) {
        await page.evaluate(
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
        await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)))
        report.occlusion[`f12-${name}-${quality}`] = {
          shot: await screenshotCanvas(page, `d138-occlusion-f12-${name}-${quality}`),
          ...(await stats(page)),
        }
      }
      await page.close()
    }

    const { page, consoles, requests } = await open(browser, '?q=perf')
    const sequence = ['均衡', '性能', '均衡', '性能', '均衡']
    report.switches.push({ label: '性能(冷启动)', ...(await stats(page)) })
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
    const firstBalanced = report.switches.find((item) => item.label === '均衡')
    const fifthBalanced = [...report.switches].reverse().find((item) => item.label === '均衡')
    report.switchHold = {
      first: firstBalanced?.memory ?? null,
      fifth: fifthBalanced?.memory ?? null,
      texturesHold: firstBalanced?.memory?.textures === fifthBalanced?.memory?.textures,
      geometriesHold: firstBalanced?.memory?.geometries === fifthBalanced?.memory?.geometries,
    }
    if (!report.switchHold.texturesHold || !report.switchHold.geometriesHold) {
      report.failures.push(
        `切档资源不持平 textures ${firstBalanced?.memory?.textures}→${fifthBalanced?.memory?.textures} geo ${firstBalanced?.memory?.geometries}→${fifthBalanced?.memory?.geometries}`,
      )
    }
    const net = summarizeNet(requests, consoles)
    report.switchNet = net
    if (net.errors || net.warnings) report.failures.push(`切档 console ${net.errors}/${net.warnings}`)
    if (net.external.length) report.failures.push(`切档外网 ${net.external.length}`)
    await page.close()
  } finally {
    await browser.close().catch(() => {})
  }

  report.ok = report.failures.length === 0
  await writeFile(resolve(outDir, 'd138-smoke.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
