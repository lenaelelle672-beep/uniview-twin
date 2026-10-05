#!/usr/bin/env node
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
  if (!n) return null
  r /= n
  g /= n
  b /= n
  return { r, g, b, L: relativeLuminance(r, g, b) }
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
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 700)))
}

async function mem(page) {
  return page.evaluate(() => ({
    calls: window.__twinStats?.calls ?? 0,
    memory: window.__twinMemory ?? null,
    quality: document.querySelector('.scene-root')?.dataset.quality ?? '',
  }))
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
  const report = { alarms: {}, switches: [], failures: [] }

  const overview = await browser.newPage()
  const consoles = []
  overview.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') consoles.push({ type: msg.type(), text: msg.text() })
  })
  await overview.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  await overview.goto(`${baseUrl}/?q=balanced`, { waitUntil: 'load' })
  await waitReady(overview, 'balanced')
  report.overview = await mem(overview)
  report.overviewConsole = {
    errors: consoles.filter((item) => item.type === 'error').length,
    warnings: consoles.filter((item) => item.type === 'warning').length,
    blit: consoles.filter((item) => /glBlitFramebuffer|Depth\/stencil/i.test(item.text)).length,
  }
  await overview.close()

  for (const quality of ['balanced', 'perf']) {
    for (const floorId of ['F12', 'F18', 'F3']) {
      const page = await browser.newPage()
      const logs = []
      page.on('console', (msg) => {
        if (msg.type() === 'error' || msg.type() === 'warning') logs.push({ type: msg.type(), text: msg.text() })
      })
      await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
      await page.goto(`${baseUrl}/?q=${quality}&view=floor&floor=${floorId}`, { waitUntil: 'load' })
      await waitReady(page, quality)
      await page.waitForFunction(
        (id) =>
          window.__twinInterior?.floorId === id &&
          (window.__twinInterior?.renderedDesks ?? 0) >= 80 &&
          window.__twinMonitorBoxes?.alarm &&
          window.__twinMonitorBoxes?.online,
        { timeout: 90_000 },
        floorId,
      )
      const desks = await page.evaluate((id) => {
        const devices = window.__twinDevices ?? []
        return {
          alarm: window.__twinMonitorBoxes?.alarm?.deskId ?? devices.find((d) => d.floorId === id && d.status === 'alarm')?.deskId,
          online: window.__twinMonitorBoxes?.online?.deskId ?? devices.find((d) => d.floorId === id && d.status === 'online')?.deskId,
        }
      }, floorId)
      await page.evaluate((floor, desk) => window.__twinFocusDevice?.({ floor, deskId: desk }), floorId, desks.alarm)
      await page.waitForFunction((id) => window.__twinLocate?.deskId === id, { timeout: 20_000 }, desks.alarm).catch(() => {})
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 700)))
      const alarmBoxes = await page.evaluate(() => window.__twinMonitorBoxes)
      const alarmImage = await page.evaluate(() => {
        const source = document.querySelector('canvas')
        const copy = document.createElement('canvas')
        copy.width = source.width
        copy.height = source.height
        copy.getContext('2d').drawImage(source, 0, 0)
        const image = copy.getContext('2d').getImageData(0, 0, copy.width, copy.height)
        return { width: copy.width, height: copy.height, data: Array.from(image.data) }
      })
      if (floorId === 'F12' && quality === 'balanced') {
        const canvas = await page.$('canvas')
        await canvas.screenshot({ path: resolve(outDir, 'd145-f12-balanced-alarm.png') })
      }
      await page.evaluate((floor, desk) => window.__twinFocusDevice?.({ floor, deskId: desk }), floorId, desks.online)
      await page.waitForFunction((id) => window.__twinLocate?.deskId === id, { timeout: 20_000 }, desks.online).catch(() => {})
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 700)))
      const onlineBoxes = await page.evaluate(() => window.__twinMonitorBoxes)
      const onlineImage = await page.evaluate(() => {
        const source = document.querySelector('canvas')
        const copy = document.createElement('canvas')
        copy.width = source.width
        copy.height = source.height
        copy.getContext('2d').drawImage(source, 0, 0)
        const image = copy.getContext('2d').getImageData(0, 0, copy.width, copy.height)
        return { width: copy.width, height: copy.height, data: Array.from(image.data) }
      })
      const alarm = alarmBoxes.alarm?.box
        ? sampleBox(Uint8ClampedArray.from(alarmImage.data), alarmImage.width, alarmImage.height, alarmBoxes.alarm.box)
        : null
      const online = onlineBoxes.online?.box
        ? sampleBox(Uint8ClampedArray.from(onlineImage.data), onlineImage.width, onlineImage.height, onlineBoxes.online.box)
        : null
      const ratio = alarm && online && online.L > 0 ? alarm.L / online.L : null
      const key = `${floorId.toLowerCase()}-${quality}`
      report.alarms[key] = {
        ratio,
        alarm,
        online,
        console: {
          errors: logs.filter((item) => item.type === 'error').length,
          warnings: logs.filter((item) => item.type === 'warning').length,
          blit: logs.filter((item) => /glBlitFramebuffer|Depth\/stencil/i.test(item.text)).length,
          items: logs.slice(0, 8),
        },
      }
      if (ratio == null || ratio < 1.5) report.failures.push(`${key} 告警比 ${ratio}`)
      if (report.alarms[key].console.blit) report.failures.push(`${key} blit ${report.alarms[key].console.blit}`)
      await page.close()
    }
  }

  const occ = await browser.newPage()
  await occ.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  await occ.goto(`${baseUrl}/?q=balanced&view=floor&floor=F12`, { waitUntil: 'load' })
  await waitReady(occ, 'balanced')
  await occ.waitForFunction(() => window.__twinView === 'floor', { timeout: 90_000 })
  await occ.evaluate(async () => {
    const rig = window.__twinRig
    const f12 = 48.16
    if (rig?.setLookAt) {
      rig.maxPolarAngle = Math.PI
      await rig.setLookAt(8.4, f12 + 1.7, 12.4, 8.4, f12 + 1.2, 1, false)
      rig.update?.(0)
    }
  })
  await occ.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)))
  const canvas = await occ.$('canvas')
  await canvas.screenshot({ path: resolve(outDir, 'd145-f12-occlusion.png') })
  await occ.close()

  const page = await browser.newPage()
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
  if (!report.switchHold.hold) {
    report.failures.push(
      `c5 vs c2 tex ${c2?.memory?.textures}→${c5?.memory?.textures} geo ${c2?.memory?.geometries}→${c5?.memory?.geometries} prog ${c2?.memory?.programs}→${c5?.memory?.programs}`,
    )
  }
  await page.close()
  await browser.close()
  report.ok = report.failures.length === 0
  await writeFile(resolve(outDir, 'd145-verify.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
