#!/usr/bin/env node
/**
 * D152：常速 / Fast 3G 网络时间线：首帧、__twinReady、预取、MonitorSamples chunk。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const evidenceDir = resolve(process.cwd(), 'docs/T012-evidence')

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

async function measure(browser, network) {
  const page = await browser.newPage()
  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  if (network === 'fast3g') {
    const client = await page.createCDPSession()
    await client.send('Network.enable')
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: Math.floor((1.5 * 1024 * 1024) / 8),
      uploadThroughput: Math.floor((750 * 1024) / 8),
      latency: 562.5,
    })
  }
  const nav = Date.now()
  await page.goto(`${baseUrl}/?q=balanced`, { waitUntil: 'load', timeout: 180_000 })
  await page.waitForFunction(() => window.__twinReady === true && window.__twinPrefetchAt != null, {
    timeout: 180_000,
  })
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 2500)))
  const marks = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource').map((entry) => ({
      name: entry.name.replace(location.origin, ''),
      start: entry.startTime,
      duration: entry.duration,
    }))
    return {
      firstFrameAt: window.__twinFirstFrameAt ?? null,
      readyAt: window.__twinReadyAt ?? null,
      prefetchAt: window.__twinPrefetchAt ?? null,
      monitor: resources.filter((entry) => /MonitorSamples/i.test(entry.name)),
      prefetchChunks: resources.filter((entry) => /floorDecor|textRuntime|BlueprintView/i.test(entry.name)),
      resources: resources.filter((entry) => /MonitorSamples|floorDecor|textRuntime|BlueprintView|\.hdr/i.test(entry.name)),
    }
  })
  await page.close()
  const monitorStart = marks.monitor[0]?.start ?? null
  const prefetchStart = marks.prefetchAt
  const first = marks.firstFrameAt
  const between = first != null && prefetchStart != null && monitorStart != null && monitorStart > first && monitorStart < prefetchStart
  return {
    network,
    wallMs: Date.now() - nav,
    firstFrameAt: marks.firstFrameAt,
    readyAt: marks.readyAt,
    prefetchAt: marks.prefetchAt,
    monitorSamples: marks.monitor,
    prefetchChunks: marks.prefetchChunks,
    ok: monitorStart == null || !between,
    betweenFirstAndPrefetch: between,
  }
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--no-sandbox',
    ],
  })
  const report = {
    baseUrl,
    normal: await measure(browser, 'normal'),
    fast3g: await measure(browser, 'fast3g'),
  }
  report.ok = report.normal.ok && report.fast3g.ok
  await browser.close()
  await mkdir(evidenceDir, { recursive: true })
  await writeFile(resolve(evidenceDir, 'd152-monitor-timeline.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exit(2)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
