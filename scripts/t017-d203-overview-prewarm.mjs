#!/usr/bin/env node
/**
 * D203：总览不进层，等 __twinPrewarmed。
 * - 五层 Fxx.json 与进层同一 URL
 * - WebGL2 live buffer/texture（perf/harness/webgl-live-counts.mjs 注入，应用不带探针）
 * - 置旗后再进 F1：缓存命中 + 无新 SDF
 * 用法：node scripts/t017-d203-overview-prewarm.mjs [baseUrl]
 */
import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { measureOverviewPrewarmCounts } from '../perf/harness/webgl-live-counts.mjs'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const here = dirname(fileURLToPath(import.meta.url))
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const outDir = process.env.ARTIFACT_DIR ?? resolve(here, '../docs/T017-evidence')
const FLOORS = [
  { id: 'F12', file: '/floors/F12.json' },
  { id: 'F22', file: '/floors/F22.json' },
  { id: 'F18', file: '/floors/F18.json' },
  { id: 'F3', file: '/floors/F03.json' },
  { id: 'F1', file: '/floors/F01.json' },
]

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

function gzipCompress9(buffer) {
  const result = spawnSync(
    'python3',
    ['-c', 'import gzip,sys; sys.stdout.buffer.write(gzip.compress(sys.stdin.buffer.read(), 9))'],
    { input: buffer, maxBuffer: 32 * 1024 * 1024 },
  )
  if (result.status !== 0) throw new Error('gzip.compress(9) 失败')
  return result.stdout.length
}

function classify(url) {
  const path = url.replace(baseUrl, '').split('?')[0]
  return {
    path,
    floorJson: /^\/floors\/F\d+\.json$/.test(path),
    model: /\.(glb|gltf|ktx2|ktx)(\?|$)/i.test(path) || /draco|meshopt|basis/i.test(path),
  }
}

async function main() {
  const executablePath = chromePath()
  if (!executablePath) throw new Error('找不到 Chrome')
  const browser = await puppeteer.launch({
    executablePath,
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
  const errors = []
  const sdf = []
  const requests = []
  const bodies = new Map()
  page.on('console', (msg) => {
    const text = msg.text()
    if (msg.type() === 'error') errors.push(text)
    if (/Increasing SDF texture size \d+->\d+/.test(text)) sdf.push(text)
  })
  page.on('request', (request) => {
    const url = request.url()
    if (!url.startsWith(baseUrl)) return
    requests.push({
      url: classify(url).path,
      method: request.method(),
      resourceType: request.resourceType(),
      at: Date.now(),
    })
  })
  page.on('response', async (response) => {
    const url = response.url()
    if (!url.startsWith(baseUrl)) return
    try {
      bodies.set(classify(url).path, {
        status: response.status(),
        fromCache: response.fromCache(),
        buffer: Buffer.from(await response.buffer()),
      })
    } catch {
      bodies.set(classify(url).path, {
        status: response.status(),
        fromCache: response.fromCache(),
        buffer: Buffer.alloc(0),
      })
    }
  })

  await page.evaluateOnNewDocument(() => {
    window.__twinSdfGrowth = []
    const wrap = (method) => {
      const current = console[method].bind(console)
      console[method] = (...args) => {
        const text = args.map((item) => (typeof item === 'string' ? item : String(item))).join(' ')
        if (/Increasing SDF texture size \d+->\d+/.test(text)) window.__twinSdfGrowth.push(text)
        return current(...args)
      }
    }
    wrap('info')
    wrap('log')
    wrap('debug')
  })

  const measured = await measureOverviewPrewarmCounts(page, { baseUrl, quality: 'perf', cache: true })
  const atFlag = await page.evaluate(() => ({
    prewarm: window.__twinPrewarm ?? null,
    sdf: window.__twinSdfGrowth ?? [],
    view: window.__twinView ?? null,
    selected: window.__twinSelected ?? null,
  }))
  const f1RequestsAtFlag = requests.filter((item) => item.url === '/floors/F01.json').length

  const jsonFiles = FLOORS.map((floor) => {
    const hit = bodies.get(floor.file)
    return {
      id: floor.id,
      url: floor.file,
      requested: Boolean(hit),
      status: hit?.status ?? null,
      fromCache: hit?.fromCache ?? null,
      gzip: hit?.buffer?.length ? gzipCompress9(hit.buffer) : 0,
      bytes: hit?.buffer?.length ?? 0,
    }
  })

  const readyToFlag = requests.filter((item) => {
    const info = classify(item.url)
    return info.floorJson || info.model
  })

  await page.evaluate(() => {
    window.__twinSdfGrowth = []
    window.__twinFocusDevice?.({ floor: 'F1', deskId: null, deviceId: 'F1-PR1' })
  })
  await page.waitForFunction(
    () => window.__twinView === 'floor' && window.__twinSelected === 'F1',
    { timeout: 90_000 },
  )
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 2500)))
  const afterF1 = await page.evaluate(() => ({
    sdf: window.__twinSdfGrowth ?? [],
    view: window.__twinView,
    selected: window.__twinSelected,
    mount: window.__twinLabelMount ?? null,
  }))
  const f1After = bodies.get('/floors/F01.json')

  await browser.close()

  const jsonGzip = jsonFiles.reduce((sum, file) => sum + file.gzip, 0)
  const report = {
    createdAt: new Date().toISOString(),
    script: 'scripts/t017-d203-overview-prewarm.mjs',
    harness: 'perf/harness/webgl-live-counts.mjs',
    baseUrl,
    webgl: measured,
    glyphsRequired: atFlag.prewarm?.glyphsRequired ?? null,
    glyphsPrewarmed: atFlag.prewarm?.glyphsPrewarmed ?? null,
    flagDelayMs:
      measured.prewarmed?.now != null && measured.ready?.now != null
        ? measured.prewarmed.now - measured.ready.now
        : null,
    overview: { view: atFlag.view, selected: atFlag.selected },
    jsonFiles,
    jsonGzip,
    extraModelsReadyToFlag: readyToFlag.filter((item) => classify(item.url).model),
    sdfBeforeF1: [...sdf, ...atFlag.sdf],
    sdfAfterF1: afterF1.sdf,
    f1Entry: afterF1,
    f1JsonAfterEntry: {
      status: f1After?.status ?? null,
      fromCache: f1After?.fromCache ?? null,
      requestsAtFlag: f1RequestsAtFlag,
      requestsAfterEntry: requests.filter((item) => item.url === '/floors/F01.json').length,
    },
    errors,
  }
  report.ok =
    measured.stayedOnOverview &&
    measured.batchJump !== true &&
    jsonFiles.every((file) => file.requested && file.gzip > 0) &&
    jsonGzip >= 180_000 &&
    jsonGzip <= 260_000 &&
    report.extraModelsReadyToFlag.length === 0 &&
    report.sdfAfterF1.length === 0 &&
    (report.glyphsPrewarmed ?? 0) >= (report.glyphsRequired ?? 1) &&
    errors.length === 0

  await mkdir(outDir, { recursive: true })
  const jsonPath = resolve(outDir, 't017-d203-overview-prewarm.json')
  await writeFile(jsonPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  console.log(`wrote ${jsonPath}`)
  if (!report.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
