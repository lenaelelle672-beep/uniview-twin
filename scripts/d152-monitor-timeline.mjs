#!/usr/bin/env node
/**
 * D152：均衡档常速 / Fast 3G 各 3 轮。每轮报首帧 / 预取 / MonitorSamples，
 * MonitorSamples 必须晚于预取资源（floorDecor|textRuntime|BlueprintView）。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const evidenceDir = resolve(process.cwd(), 'docs/T012-evidence')
const ROUNDS = Number(process.env.ROUNDS ?? 3)

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

function firstStart(entries) {
  if (!entries.length) return null
  return Math.min(...entries.map((entry) => entry.start))
}

async function measure(browser, network, round) {
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
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 3500)))
  const marks = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource').map((entry) => ({
      name: entry.name.replace(location.origin, ''),
      start: entry.startTime,
      duration: entry.duration,
    }))
    return {
      firstFrameAt: window.__twinFirstFrameAt ?? null,
      readyAt: window.__twinReadyAt ?? null,
      prefetchMark: window.__twinPrefetchAt ?? null,
      monitor: resources.filter((entry) => /MonitorSamples/i.test(entry.name)),
      prefetchChunks: resources.filter((entry) => /floorDecor|textRuntime|BlueprintView/i.test(entry.name)),
    }
  })
  await page.close()
  const firstFrameAt = marks.firstFrameAt
  const prefetchAt = firstStart(marks.prefetchChunks) ?? marks.prefetchMark
  const monitorSamplesAt = firstStart(marks.monitor)
  const afterPrefetch = monitorSamplesAt != null && prefetchAt != null && monitorSamplesAt > prefetchAt
  const between = firstFrameAt != null && prefetchAt != null && monitorSamplesAt != null && monitorSamplesAt > firstFrameAt && monitorSamplesAt < prefetchAt
  return {
    network,
    round,
    wallMs: Date.now() - nav,
    firstFrameAt,
    prefetchAt,
    monitorSamplesAt,
    prefetchMark: marks.prefetchMark,
    readyAt: marks.readyAt,
    monitorSamples: marks.monitor,
    prefetchChunks: marks.prefetchChunks,
    afterPrefetch,
    betweenFirstAndPrefetch: between,
    ok: afterPrefetch && !between,
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
  const report = { baseUrl, quality: 'balanced', rounds: ROUNDS, networks: {}, failures: [] }
  for (const network of ['normal', 'fast3g']) {
    const rows = []
    for (let round = 1; round <= ROUNDS; round += 1) {
      const row = await measure(browser, network, round)
      rows.push(row)
      console.error(
        `${network}#${round} first=${row.firstFrameAt?.toFixed?.(1)} prefetch=${row.prefetchAt?.toFixed?.(1)} monitor=${row.monitorSamplesAt?.toFixed?.(1)} afterPrefetch=${row.afterPrefetch}`,
      )
      if (!row.ok) {
        report.failures.push(
          `${network}#${round} monitor ${row.monitorSamplesAt} vs prefetch ${row.prefetchAt} first ${row.firstFrameAt}`,
        )
      }
    }
    report.networks[network] = rows
  }
  report.ok = report.failures.length === 0
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
