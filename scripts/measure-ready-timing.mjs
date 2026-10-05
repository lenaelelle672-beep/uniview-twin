#!/usr/bin/env node
/**
 * D138 / D140：9 轮时序。正常 / CPU×8 / Chrome Fast 3G 禁缓存，各 3 轮。
 * 资源完成（HDR、树 lo、树 hi、主楼体 chunk / roof-sign）必须 ≤ ready，
 * 再 ready → 首帧 → 预取。首帧与 8 秒稳态比下半幅 MAD。
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

const FAST_3G = {
  offline: false,
  latency: 562.5,
  downloadThroughput: ((1.6 * 1024 * 1024) / 8) * 0.9,
  uploadThroughput: ((750 * 1024) / 8) * 0.9,
}

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

function classifyUrl(url) {
  const path = url.replace(baseUrl, '').split('?')[0]
  return {
    path,
    treeLo: /street-tree-lo\.glb/i.test(path),
    treeHi: /street-tree-hi\.glb/i.test(path),
    hdr: /\.hdr$/i.test(path),
    roofSign: /roof-sign\.glb/i.test(path),
    mainChunk: /\/assets\/index-[^/]+\.js$/i.test(path),
    prefetch: /floorDecor|textRuntime|BlueprintView/i.test(path),
    interiors: /TowerInterior|B1Interior|floorDecor|MonitorSamples|Workstations/i.test(path),
    balancedFx: /balancedFx/i.test(path),
    external: !url.startsWith(baseUrl) && !url.startsWith('data:') && !url.startsWith('blob:'),
  }
}

function lowerHalfDiff(a, b, width, height) {
  const y0 = Math.floor(height / 2)
  let abs = 0
  let different = 0
  let n = 0
  for (let y = y0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      const dr = Math.abs(a[offset] - b[offset])
      const dg = Math.abs(a[offset + 1] - b[offset + 1])
      const db = Math.abs(a[offset + 2] - b[offset + 2])
      abs += (dr + dg + db) / 3
      if (Math.max(dr, dg, db) > 4) different += 1
      n += 1
    }
  }
  return { mad: abs / n, diffRatio: different / n, pixels: n }
}

function resourceFinish(entries, test) {
  const hits = entries.filter((entry) => test(entry.name.replace(baseUrl, '').split('?')[0]))
  if (!hits.length) return null
  return {
    path: hits[hits.length - 1].name.replace(baseUrl, '').split('?')[0],
    responseEnd: Math.max(...hits.map((entry) => entry.responseEnd)),
  }
}

function analyzeCanvas(data, width, height) {
  let empty = 0
  let dark = 0
  let green = 0
  let building = 0
  let samples = 0
  let lumSum = 0
  const step = 4
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const offset = (y * width + x) * 4
      const r = data[offset]
      const g = data[offset + 1]
      const b = data[offset + 2]
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      samples += 1
      lumSum += 0.2126 * r + 0.7152 * g + 0.0722 * b
      if (max < 8) dark += 1
      if (max < 8 || (Math.abs(r - 197) < 12 && Math.abs(g - 215) < 12 && Math.abs(b - 234) < 12 && max - min < 18)) {
        empty += 1
      } else if (g > r + 8 && g > 55 && g >= b) {
        green += 1
      } else if (b > r + 8 && g > 80 && max - min > 20) {
        building += 1
      }
    }
  }
  return {
    emptyRatio: empty / samples,
    darkRatio: dark / samples,
    greenRatio: green / samples,
    buildingRatio: building / samples,
    meanL: lumSum / samples,
    hasTrees: green / samples > 0.004,
    hasEnvLight: lumSum / samples > 28 && dark / samples < 0.35 && empty / samples < 0.92,
  }
}

async function launchBrowser() {
  return puppeteer.launch({
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
}

async function runRound(browser, label, opts) {
  const page = await browser.newPage()
  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  const client = await page.createCDPSession()
  await client.send('Network.enable')
  await client.send('Network.setCacheDisabled', { cacheDisabled: true })
  if (opts.cpuRate) await client.send('Emulation.setCPUThrottlingRate', { rate: opts.cpuRate })
  if (opts.fast3g) await client.send('Network.emulateNetworkConditions', FAST_3G)

  const consoles = []
  const requests = []
  const cdpRequests = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') consoles.push({ type: msg.type(), text: msg.text() })
  })
  page.on('pageerror', (error) => consoles.push({ type: 'pageerror', text: error.message }))
  page.on('request', (request) => {
    const info = classifyUrl(request.url())
    requests.push({ url: request.url(), ...info, at: Date.now() })
  })
  client.on('Network.requestWillBeSent', (event) => {
    const info = classifyUrl(event.request.url)
    cdpRequests.push({
      url: event.request.url,
      wallMs: event.wallTime * 1000,
      ...info,
    })
  })

  await page.goto(`${baseUrl}/?q=balanced`, { waitUntil: 'load', timeout: 180_000 })
  await page.waitForFunction(() => window.__twinReady === true && window.__twinFirstFrameAt != null, {
    timeout: 180_000,
  })

  const firstShot = await page.evaluate(() => {
    const source = document.querySelector('canvas')
    const copy = document.createElement('canvas')
    copy.width = source.width
    copy.height = source.height
    const ctx = copy.getContext('2d')
    ctx.drawImage(source, 0, 0)
    const image = ctx.getImageData(0, 0, copy.width, copy.height)
    return {
      width: copy.width,
      height: copy.height,
      data: Array.from(image.data),
      png: copy.toDataURL('image/png'),
    }
  })

  await page.waitForFunction(() => window.__twinPrefetchAt != null, { timeout: 20_000 }).catch(() => {})
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 8000)))

  const steadyShot = await page.evaluate(() => {
    const source = document.querySelector('canvas')
    const copy = document.createElement('canvas')
    copy.width = source.width
    copy.height = source.height
    const ctx = copy.getContext('2d')
    ctx.drawImage(source, 0, 0)
    const image = ctx.getImageData(0, 0, copy.width, copy.height)
    return {
      width: copy.width,
      height: copy.height,
      data: Array.from(image.data),
      png: copy.toDataURL('image/png'),
    }
  })

  const marks = await page.evaluate(() => ({
    treeLo: window.__twinTreeLoReadyAt ?? null,
    hdrLoaded: window.__twinHdrLoadedAt ?? null,
    hdrReady: window.__twinHdrReadyAt ?? null,
    ready: window.__twinReadyAt ?? null,
    firstFrame: window.__twinFirstFrameAt ?? null,
    firstFrameUnix: window.__twinFirstFrameUnixMs ?? null,
    prefetch: window.__twinPrefetchAt ?? null,
    readyFlag: window.__twinReady === true,
    calls: window.__twinStats?.calls ?? 0,
    resources: performance.getEntriesByType('resource').map((entry) => ({
      name: entry.name,
      startTime: entry.startTime,
      responseEnd: entry.responseEnd,
    })),
  }))

  const firstFramePixels = {
    width: firstShot.width,
    height: firstShot.height,
    ...analyzeCanvas(Uint8ClampedArray.from(firstShot.data), firstShot.width, firstShot.height),
  }
  const firstData = Uint8ClampedArray.from(firstShot.data)
  const steadyData = Uint8ClampedArray.from(steadyShot.data)
  const lowerHalf = lowerHalfDiff(firstData, steadyData, firstShot.width, firstShot.height)
  if (label === 'fast3g-1' || label === 'normal-1') {
    await writeFile(resolve(outDir, `d140-first-frame-${label}.png`), Buffer.from(firstShot.png.split(',')[1], 'base64'))
    await writeFile(resolve(outDir, `d140-steady-8s-${label}.png`), Buffer.from(steadyShot.png.split(',')[1], 'base64'))
  }

  const finishes = {
    hdr: resourceFinish(marks.resources, (path) => /\.hdr$/i.test(path)),
    treeLo: resourceFinish(marks.resources, (path) => /street-tree-lo\.glb/i.test(path)),
    treeHi: resourceFinish(marks.resources, (path) => /street-tree-hi\.glb/i.test(path)),
    roofSign: resourceFinish(marks.resources, (path) => /roof-sign\.glb/i.test(path)),
    mainChunk: resourceFinish(marks.resources, (path) => /\/assets\/index-[^/]+\.js$/i.test(path)),
  }
  const vsReady = Object.fromEntries(
    Object.entries(finishes).map(([key, item]) => [
      key,
      item && marks.ready != null
        ? { ...item, beforeReady: item.responseEnd <= marks.ready, deltaMs: item.responseEnd - marks.ready }
        : { missing: true, beforeReady: false },
    ]),
  )

  const prefetchHits = cdpRequests.filter((item) => item.prefetch)
  const prefetchDelta =
    marks.firstFrameUnix != null
      ? prefetchHits.map((item) => ({
          path: classifyUrl(item.url).path,
          afterFirstFrameMs: item.wallMs - marks.firstFrameUnix,
        }))
      : []

  const interiorsAfterReady = marks.resources
    .filter((entry) => /TowerInterior|B1Interior|floorDecor|MonitorSamples|Workstations/i.test(entry.name))
    .map((entry) => ({
      path: entry.name.replace(baseUrl, '').split('?')[0],
      startTime: entry.startTime,
      afterReady: marks.ready == null || entry.startTime >= marks.ready,
    }))

  const order = {
    treeLoFinishBeforeReady: vsReady.treeLo.beforeReady,
    treeHiFinishBeforeReady: vsReady.treeHi.beforeReady,
    hdrFinishBeforeReady: vsReady.hdr.beforeReady,
    roofSignBeforeReady: vsReady.roofSign.beforeReady,
    mainChunkBeforeReady: vsReady.mainChunk.beforeReady,
    hdrMarkBeforeReady: marks.hdrLoaded != null && marks.ready != null && marks.hdrLoaded <= marks.ready,
    pmremBeforeReady: marks.hdrReady != null && marks.ready != null && marks.hdrReady <= marks.ready,
    treeLoMarkBeforeReady: marks.treeLo != null && marks.ready != null && marks.treeLo <= marks.ready,
    readyBeforeFirst: marks.ready != null && marks.firstFrame != null && marks.ready <= marks.firstFrame,
    firstBeforePrefetch: marks.firstFrame != null && marks.prefetch != null && marks.firstFrame <= marks.prefetch,
    prefetchRequestsAfterFirst: prefetchDelta.length > 0 && prefetchDelta.every((item) => item.afterFirstFrameMs >= -2),
  }
  const orderOk = Object.values(order).every(Boolean)
  const external = requests.filter((item) => item.external).map((item) => item.url)
  const errors = consoles.filter((item) => item.type === 'error' || item.type === 'pageerror')
  const warnings = consoles.filter((item) => item.type === 'warning')
  const normal = label.startsWith('normal')
  const madOk = !normal || (lowerHalf.mad < 4 && lowerHalf.diffRatio < 0.08)

  await page.close()
  return {
    label,
    treeLo: marks.treeLo,
    hdrLoaded: marks.hdrLoaded,
    hdrReady: marks.hdrReady,
    ready: marks.ready,
    firstFrame: marks.firstFrame,
    firstFrameUnix: marks.firstFrameUnix,
    prefetch: marks.prefetch,
    readyFlag: marks.readyFlag,
    calls: marks.calls,
    resources: vsReady,
    interiorsAfterReady,
    order,
    orderOk,
    firstFramePixels,
    lowerHalf,
    prefetchDelta,
    requestedBalancedFx: requests.some((item) => item.balancedFx),
    console: { errors: errors.length, warnings: warnings.length, items: consoles },
    external,
    ok:
      orderOk &&
      firstFramePixels.hasTrees &&
      firstFramePixels.hasEnvLight &&
      madOk &&
      errors.length === 0 &&
      warnings.length === 0 &&
      external.length === 0,
  }
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const rounds = [
    ['normal-1', {}],
    ['normal-2', {}],
    ['normal-3', {}],
    ['cpu-x8-1', { cpuRate: 8 }],
    ['cpu-x8-2', { cpuRate: 8 }],
    ['cpu-x8-3', { cpuRate: 8 }],
    ['fast3g-1', { fast3g: true }],
    ['fast3g-2', { fast3g: true }],
    ['fast3g-3', { fast3g: true }],
  ]

  const results = []
  for (const [label, opts] of rounds) {
    const browser = await launchBrowser()
    try {
      const result = await runRound(browser, label, opts)
      results.push(result)
      console.error(
        `${label} order=${result.orderOk} trees=${result.firstFramePixels.hasTrees} env=${result.firstFramePixels.hasEnvLight} mad=${result.lowerHalf.mad.toFixed(3)} diff=${result.lowerHalf.diffRatio.toFixed(4)} ready=${Number(result.ready).toFixed(1)} first=${Number(result.firstFrame).toFixed(1)}`,
      )
    } finally {
      await browser.close().catch(() => {})
    }
  }

  const report = {
    baseUrl,
    viewport: { width: 1366, height: 768 },
    rounds: results,
    allOrderOk: results.every((item) => item.orderOk),
    allFirstFrameOk: results.every((item) => item.firstFramePixels.hasTrees && item.firstFramePixels.hasEnvLight),
    allResourcesBeforeReady: results.every((item) => item.orderOk),
    console: {
      errors: results.reduce((sum, item) => sum + item.console.errors, 0),
      warnings: results.reduce((sum, item) => sum + item.console.warnings, 0),
    },
    external: results.flatMap((item) => item.external),
    ok: results.every((item) => item.ok),
  }
  await writeFile(resolve(outDir, 'd138-timing.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
