#!/usr/bin/env node
/**
 * D195：请求顺序自证 + ReadPixels/SDF 计数 + F1 标签打包回归。
 * 用法：node scripts/t017-d195-prefetch-order.mjs [baseUrl]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import os from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const here = dirname(fileURLToPath(import.meta.url))
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const outDir = process.env.ARTIFACT_DIR ?? resolve(here, '../docs/T017-evidence')
const D165 = 435_664
const PREV_HARD = 435_629

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
  if (result.status !== 0) {
    throw new Error(`gzip.compress(9) 失败：${result.stderr?.toString() || result.status}`)
  }
  return result.stdout.length
}

function loadavg() {
  const [a, b, c] = os.loadavg()
  return { load1: a, load5: b, load15: c, cpus: os.cpus().length }
}

function installConsoleHooks() {
  return `
    (function () {
      window.__twinSdfGrowth = []
      window.__twinReadPixels = []
      const wrap = (method) => {
        let current = console[method].bind(console)
        function hooked(...args) {
          const text = args.map((item) => (typeof item === 'string' ? item : String(item))).join(' ')
          if (/Increasing SDF texture size \\d+->\\d+/.test(text)) window.__twinSdfGrowth.push(text)
          if (/ReadPixels/i.test(text)) window.__twinReadPixels.push({ method, text })
          return current.apply(console, args)
        }
        Object.defineProperty(console, method, {
          configurable: true,
          get() { return hooked },
          set(fn) { current = typeof fn === 'function' ? fn.bind(console) : current },
        })
      }
      wrap('info')
    })()
  `
}

function pickResource(resources, test) {
  const hits = resources.filter((entry) => test(entry.url))
  hits.sort((a, b) => a.startTime - b.startTime)
  return hits[0] ?? null
}

function classify(url) {
  return {
    idlePrewarm: /IdlePrewarm/i.test(url),
    labels: /\/labels-/i.test(url) || /\/labels\./i.test(url) || /ProgressiveRoomLabels/i.test(url),
    textRuntime: /textRuntime/i.test(url),
    floorDecor: /floorDecor/i.test(url),
    blueprint: /BlueprintView/i.test(url),
    troika: /troika-three-text/i.test(url),
    woff: /NotoSansSC-Regular-subset\.woff/i.test(url),
    hdr: /\.hdr(\?|$)/i.test(url),
    favicon: /favicon/i.test(url),
  }
}

async function launch() {
  const executablePath = chromePath()
  if (!executablePath) throw new Error('找不到 Chrome')
  return puppeteer.launch({
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
}

async function attachLog(page, sink) {
  const session = await page.createCDPSession()
  await session.send('Log.enable')
  session.on('Log.entryAdded', ({ entry }) => {
    const text = entry?.text ?? ''
    if (/ReadPixels/i.test(text)) sink.readPixelsCdp.push({ level: entry.level, text })
    if (/Increasing SDF texture size/i.test(text)) sink.sdfCdp.push(text)
  })
  return session
}

async function openPage(browser, quality) {
  const page = await browser.newPage()
  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  await page.evaluateOnNewDocument(installConsoleHooks())
  const consoleSink = { errors: [], warnings: [], readPixels: [], sdf: [], readPixelsCdp: [], sdfCdp: [] }
  page.on('console', (msg) => {
    const text = msg.text()
    const type = msg.type()
    if (type === 'error') consoleSink.errors.push(text)
    if (type === 'warning' || type === 'warn') consoleSink.warnings.push(text)
    if (/ReadPixels/i.test(text)) consoleSink.readPixels.push({ type, text })
    if (/Increasing SDF texture size/i.test(text)) consoleSink.sdf.push(text)
  })
  page.on('pageerror', (error) => consoleSink.errors.push(String(error)))
  const session = await attachLog(page, consoleSink)
  const bodies = new Map()
  page.on('response', async (response) => {
    const url = response.url()
    if (!url.startsWith(baseUrl)) return
    try {
      bodies.set(url, Buffer.from(await response.buffer()))
    } catch {
      // ignore
    }
  })
  await page.goto(`${baseUrl}/?q=${quality}`, { waitUntil: 'load', timeout: 90_000 })
  return { page, consoleSink, bodies, session }
}

function summarizeResources(resources, firstFrameAt, bodies) {
  const mapped = resources.map((entry) => {
    const buffer = bodies.get(entry.url)
    return {
      url: entry.url.replace(baseUrl, ''),
      startTime: entry.startTime,
      responseEnd: entry.responseEnd,
      gzip: buffer ? gzipCompress9(buffer) : null,
      afterFirstFrame: firstFrameAt != null && entry.startTime > firstFrameAt,
      ...classify(entry.url),
    }
  })
  const prefetchCandidates = mapped.filter((item) => item.textRuntime || item.floorDecor || item.blueprint)
  prefetchCandidates.sort((a, b) => a.startTime - b.startTime)
  const firstPrefetch = prefetchCandidates[0] ?? null
  const textRuntime = pickResource(mapped, (url) => classify(url).textRuntime)
  const idlePrewarm = pickResource(mapped, (url) => classify(url).idlePrewarm)
  const labels = pickResource(mapped, (url) => classify(url).labels)
  const woff = pickResource(mapped, (url) => classify(url).woff)
  const troika = pickResource(mapped, (url) => classify(url).troika)
  const prefetchEnd = firstPrefetch?.responseEnd ?? null
  const bytesAtFirstPrefetchEnd = mapped
    .filter((item) => !item.hdr && !item.favicon && prefetchEnd != null && item.startTime <= prefetchEnd)
    .reduce((sum, item) => sum + (item.gzip ?? 0), 0)
  return {
    firstPrefetch,
    textRuntime,
    idlePrewarm,
    labels,
    woff,
    troika,
    bytesAtFirstPrefetchEnd,
    orderOk:
      idlePrewarm != null &&
      labels != null &&
      textRuntime != null &&
      idlePrewarm.startTime >= textRuntime.responseEnd &&
      labels.startTime >= textRuntime.responseEnd,
  }
}

async function runTimeline(browser, quality, round) {
  const { page, consoleSink, bodies, session } = await openPage(browser, quality)
  await page.waitForFunction(() => window.__twinReady === true && window.__twinFirstFrameAt != null, {
    timeout: 60_000,
  })
  await page.waitForFunction(() => window.__twinFirstPrefetchDone === true, { timeout: 60_000 }).catch(() => {})
  await page.waitForFunction(
    () =>
      performance.getEntriesByType('resource').some((entry) => /IdlePrewarm/i.test(entry.name)) &&
      performance.getEntriesByType('resource').some((entry) => /\/labels-/i.test(entry.name) || /ProgressiveRoomLabels/i.test(entry.name)),
    { timeout: 60_000 },
  ).catch(() => {})
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 2500)))
  const probe = await page.evaluate(() => ({
    firstFrameAt: window.__twinFirstFrameAt ?? null,
    prefetchAt: window.__twinPrefetchAt ?? null,
    firstPrefetchDone: window.__twinFirstPrefetchDone === true,
    firstPrefetchDoneAt: window.__twinFirstPrefetchDoneAt ?? null,
    prewarmed: window.__twinPrewarmed === true,
    sdfGrowth: window.__twinSdfGrowth ?? [],
    readPixelsPage: window.__twinReadPixels ?? [],
    resources: performance.getEntriesByType('resource').map((entry) => ({
      url: entry.name,
      startTime: entry.startTime,
      responseEnd: entry.responseEnd,
    })),
  }))
  const summary = summarizeResources(probe.resources, probe.firstFrameAt, bodies)
  await session.detach().catch(() => {})
  await page.close()
  return {
    quality,
    round,
    load: loadavg(),
    firstFrameAt: probe.firstFrameAt,
    prefetchAt: probe.prefetchAt,
    firstPrefetchDoneAt: probe.firstPrefetchDoneAt,
    firstPrefetchStart: summary.firstPrefetch?.startTime ?? null,
    firstPrefetchEnd: summary.firstPrefetch?.responseEnd ?? null,
    firstPrefetchUrl: summary.firstPrefetch?.url ?? null,
    textRuntimeStart: summary.textRuntime?.startTime ?? null,
    textRuntimeEnd: summary.textRuntime?.responseEnd ?? null,
    idlePrewarm: summary.idlePrewarm?.startTime ?? null,
    labels: summary.labels?.startTime ?? null,
    woff: summary.woff?.startTime ?? null,
    troika: summary.troika?.startTime ?? null,
    idleAfterPrefetchEnd:
      summary.idlePrewarm != null && summary.textRuntime != null
        ? summary.idlePrewarm.startTime - summary.textRuntime.responseEnd
        : null,
    labelsAfterPrefetchEnd:
      summary.labels != null && summary.textRuntime != null
        ? summary.labels.startTime - summary.textRuntime.responseEnd
        : null,
    bytesAtFirstPrefetchEnd: summary.bytesAtFirstPrefetchEnd,
    orderOk: summary.orderOk,
    readPixelsConsole: consoleSink.readPixels.length,
    readPixelsCdp: consoleSink.readPixelsCdp.length,
    readPixelsPageHook: probe.readPixelsPage.length,
    sdfConsole: consoleSink.sdf.length,
    sdfHook: probe.sdfGrowth.length,
    sdfCdp: consoleSink.sdfCdp.length,
    sdfSamples: probe.sdfGrowth,
    errors: consoleSink.errors,
    warnings: consoleSink.warnings,
    prewarmed: probe.prewarmed,
  }
}

async function findPrinter(page) {
  return page.evaluate(() => {
    const devices = window.__twinDevices ?? []
    return (
      devices.find((device) => device.floorId === 'F1' && device.type === 'printer' && device.status === 'alarm') ??
      devices.find((device) => device.floorId === 'F1' && device.type === 'printer') ??
      null
    )
  })
}

async function runPack(browser, quality, pathKind) {
  const { page, consoleSink, session } = await openPage(browser, quality)
  await page.waitForFunction(() => window.__twinReady === true && window.__twinFirstFrameAt != null, {
    timeout: 60_000,
  })
  await page.waitForFunction(() => window.__twinFirstPrefetchDone === true, { timeout: 60_000 })
  const printer = await findPrinter(page)
  if (pathKind === 'alarm') {
    await page.evaluate((target) => {
      window.__twinFocusDevice?.({
        floor: 'F1',
        deskId: target?.deskId ?? null,
        deviceId: target?.id ?? 'F1-PR1',
      })
    }, printer)
  } else {
    await page.evaluate(() => {
      document.querySelector('[data-floor-id="F1"]')?.click()
      window.__twinFocusDevice?.({ floor: 'F1', deskId: null, deviceId: null })
    })
  }
  try {
    await page.waitForFunction(
      () => window.__twinView === 'floor' && window.__twinSelected === 'F1' && window.__twinInterior?.floorId === 'F1',
      { timeout: 90_000 },
    )
    await page.waitForFunction(() => {
      const pack = window.__twinLabelPackMs
      return Boolean(pack && typeof pack === 'object' && pack.total > 0)
    }, { timeout: 60_000 })
  } catch (error) {
    const dump = await page.evaluate(() => ({
      view: window.__twinView ?? null,
      floor: window.__twinSelected ?? null,
      interior: window.__twinInterior ?? null,
      pack: window.__twinLabelPackMs ?? null,
      mount: window.__twinLabelMount ?? null,
      prefetchDone: window.__twinFirstPrefetchDone === true,
    }))
    throw new Error(`F1 ${quality}/${pathKind} 进层失败：${error.message} ${JSON.stringify(dump)}`)
  }
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1500)))
  const probe = await page.evaluate(() => ({
    pack: window.__twinLabelPackMs ?? null,
    mount: window.__twinLabelMount ?? null,
    sdfGrowth: window.__twinSdfGrowth ?? [],
    readPixelsPage: window.__twinReadPixels ?? [],
    view: window.__twinView ?? null,
    floor: window.__twinSelected ?? null,
  }))
  const priorityOnFirst =
    probe.mount?.priorityIds?.length && probe.mount?.firstBatchIds
      ? probe.mount.priorityIds.every((id) => probe.mount.firstBatchIds.includes(id))
      : null
  await session.detach().catch(() => {})
  await page.close()
  return {
    quality,
    path: pathKind,
    pack: probe.pack,
    priorityOnFirst,
    mount: probe.mount
      ? {
          floorId: probe.mount.floorId,
          mounted: probe.mount.mounted,
          total: probe.mount.total,
          priorityIds: probe.mount.priorityIds,
          firstBatchIds: probe.mount.firstBatchIds,
          done: probe.mount.done,
        }
      : null,
    sdfHook: probe.sdfGrowth.length,
    sdfSamples: probe.sdfGrowth,
    readPixelsConsole: consoleSink.readPixels.length,
    readPixelsCdp: consoleSink.readPixelsCdp.length,
    readPixelsPageHook: probe.readPixelsPage.length,
    errors: consoleSink.errors,
    warnings: consoleSink.warnings,
  }
}

async function main() {
  const browser = await launch()
  const report = {
    createdAt: new Date().toISOString(),
    baseUrl,
    d165: D165,
    prevHardGate: PREV_HARD,
    load: loadavg(),
    timeline: [],
    pack: [],
  }
  try {
    if (process.env.PACK_ONLY !== '1') {
      for (const quality of ['balanced', 'perf']) {
        for (let round = 1; round <= 3; round += 1) {
          report.timeline.push(await runTimeline(browser, quality, round))
        }
      }
    }
    if (process.env.TIMELINE_ONLY !== '1') {
      for (const quality of ['balanced', 'perf']) {
        for (const pathKind of ['alarm', 'list']) {
          report.pack.push(await runPack(browser, quality, pathKind))
        }
      }
    }
  } finally {
    await browser.close()
  }

  report.orderAllOk = report.timeline.every((run) => run.orderOk)
  report.packAllOk = report.pack.every(
    (run) => run.pack && typeof run.pack.total === 'number' && run.pack.total > 0 && run.pack.total <= 50 && run.errors.length === 0,
  )
  report.readPixelsVsSdf = report.timeline.map((run) => ({
    quality: run.quality,
    round: run.round,
    readPixels: Math.max(run.readPixelsConsole, run.readPixelsCdp, run.readPixelsPageHook),
    sdf: run.sdfHook,
    match: Math.max(run.readPixelsConsole, run.readPixelsCdp, run.readPixelsPageHook) === run.sdfHook,
  }))

  await mkdir(outDir, { recursive: true })
  const jsonPath = resolve(outDir, 't017-d195-prefetch-order.json')
  await writeFile(jsonPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  console.log(`wrote ${jsonPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
