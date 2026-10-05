#!/usr/bin/env node
/**
 * D143/D144：用验收 inject.js hook WebGL draw，量 F12 整帧 calls。
 * inject 只从 INJECT_JS 读取，不进仓库。
 */
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const injectPath =
  process.env.INJECT_JS ?? '/home/ubuntu/.cursor/projects/workspace/uploads/inject_3efd.js'

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

function summarizeRows(rows) {
  const byPath = new Map()
  for (const row of rows) {
    const key = `${row.pass}:${row.path}`
    const prev = byPath.get(key) ?? { path: row.path, pass: row.pass, calls: 0, tris: 0 }
    prev.calls += row.calls
    prev.tris += row.tris
    byPath.set(key, prev)
  }
  return [...byPath.values()].sort((a, b) => b.calls - a.calls)
}

function prefixCalls(rows, prefix, pass) {
  return rows.filter((row) => row.pass === pass && row.path.includes(prefix)).reduce((sum, row) => sum + row.calls, 0)
}

async function measure(page, quality, floorId) {
  const consoles = []
  const onConsole = (msg) => consoles.push({ type: msg.type(), text: msg.text() })
  const onError = (error) => consoles.push({ type: 'pageerror', text: error.message })
  page.on('console', onConsole)
  page.on('pageerror', onError)

  await page.goto(`${baseUrl}/?q=${quality}&view=floor&floor=${floorId}`, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForFunction(() => window.__twinReady === true, { timeout: 90_000 })
  if (quality === 'balanced') {
    await page
      .waitForFunction(
        () => window.__twinComposerLive === true && document.querySelector('.scene-root')?.dataset.fxReady === '1',
        { timeout: 45_000 },
      )
      .catch(() => {})
  }
  await page.waitForFunction(
    (id) =>
      window.__twinView === 'floor' &&
      window.__twinSelected === id &&
      (window.__twinInterior?.renderedDesks ?? 0) >= 80,
    { timeout: 90_000 },
    floorId,
  )
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 2500)))

  const sample = await page.evaluate(async () => {
    const P = window.__perf
    P.attrib.requested = true
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const waitStart = performance.now()
    while (!P.attrib.done && performance.now() - waitStart < 2000) {
      await new Promise((resolve) => setTimeout(resolve, 16))
    }
    const frames = P.frames.slice(-12)
    const last = frames.at(-1)
    const median = [...frames].sort((a, b) => a.calls - b.calls)[Math.floor(frames.length / 2)]
    return {
      lastRenderCalls: window.__twinStats?.calls ?? null,
      frameCalls: last?.calls ?? null,
      medianFrameCalls: median?.calls ?? null,
      frameTris: last?.tris ?? null,
      attribCalls: P.attrib.frameCalls ?? null,
      rows: P.attrib.done ?? [],
      glProbe: window.__twinGlProbe ?? null,
    }
  })

  page.off('console', onConsole)
  page.off('pageerror', onError)

  const rows = summarizeRows(sample.rows)
  const shadow = rows.filter((row) => row.pass === 'shadow').reduce((sum, row) => sum + row.calls, 0)
  const main = rows.filter((row) => row.pass === 'main').reduce((sum, row) => sum + row.calls, 0)
  return {
    quality,
    floorId,
    lastRenderCalls: sample.lastRenderCalls,
    frameCalls: sample.frameCalls,
    medianFrameCalls: sample.medianFrameCalls,
    attribCalls: sample.attribCalls,
    shadow,
    main,
    roomLabels: prefixCalls(rows, 'RoomLabels', 'main'),
    corridorPeople: prefixCalls(rows, 'CorridorPeople', 'main'),
    floorInterior: prefixCalls(rows, 'FloorInterior', 'main'),
    top: rows.slice(0, 16),
    glProbe: sample.glProbe,
    console: {
      errors: consoles.filter((item) => item.type === 'error' || item.type === 'pageerror').length,
      warnings: consoles.filter((item) => item.type === 'warning').length,
      blit: consoles.filter((item) => /glBlitFramebuffer|Depth\/stencil/i.test(item.text)).length,
      items: consoles.filter((item) => item.type === 'error' || item.type === 'warning').slice(0, 12),
    },
  }
}

async function main() {
  const inject = await readFile(injectPath, 'utf8')
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
  const page = await browser.newPage()
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  await page.evaluateOnNewDocument(inject)

  const floors = ['F12', 'F18', 'F3']
  const report = { views: {} }
  for (const quality of ['balanced', 'perf']) {
    for (const floorId of floors) {
      const key = `${floorId.toLowerCase()}-${quality}`
      report.views[key] = await measure(page, quality, floorId)
      console.error(
        `${key} frame=${report.views[key].frameCalls} last=${report.views[key].lastRenderCalls} shadow=${report.views[key].shadow} main=${report.views[key].main} labels=${report.views[key].roomLabels} blit=${report.views[key].console.blit}`,
      )
    }
  }

  await browser.close()
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
