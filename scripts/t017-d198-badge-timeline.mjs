#!/usr/bin/env node
/**
 * D198：三档各 3 轮 badge / prefetch / IdlePrewarm / labels 时序。
 * 用法：node scripts/t017-d198-badge-timeline.mjs [baseUrl]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const here = dirname(fileURLToPath(import.meta.url))
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const outDir = process.env.ARTIFACT_DIR ?? resolve(here, '../docs/T017-evidence')

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

function loadavg() {
  const [a, b, c] = os.loadavg()
  return { load1: a, load5: b, load15: c, cpus: os.cpus().length }
}

function pick(resources, test) {
  return resources.filter((entry) => test(entry.url)).sort((a, b) => a.startTime - b.startTime)[0] ?? null
}

async function runOne(browser, quality, round) {
  const page = await browser.newPage()
  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))
  const path = quality === 'auto' ? '/' : `/?q=${quality}`
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForFunction(() => window.__twinReady === true && window.__twinFirstFrameAt != null, {
    timeout: 60_000,
  })
  const atReady = await page.evaluate(() => ({
    badges: window.__twinBadges ?? null,
    badgeCenters: window.__twinBadgeCenters?.length ?? 0,
    alarmDevices: (window.__twinDevices ?? []).filter((device) => device.status === 'alarm').length,
    firstFrameAt: window.__twinFirstFrameAt ?? null,
    quality: window.__twinGpu?.tier ?? window.__twinQuality ?? null,
  }))
  await page.waitForFunction(() => window.__twinFirstPrefetchDone === true, { timeout: 60_000 }).catch(() => {})
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 2500)))
  const probe = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource').map((entry) => ({
      url: entry.name,
      startTime: entry.startTime,
      responseEnd: entry.responseEnd,
    }))
    return {
      firstFrameAt: window.__twinFirstFrameAt ?? null,
      prefetchAt: window.__twinPrefetchAt ?? null,
      firstPrefetchDoneAt: window.__twinFirstPrefetchDoneAt ?? null,
      badges: window.__twinBadges ?? null,
      prewarmed: window.__twinPrewarmed === true,
      resources,
    }
  })
  await page.close()
  const badge = pick(probe.resources, (url) => /badge-digits-bold/i.test(url))
  const textRuntime = pick(probe.resources, (url) => /textRuntime/i.test(url))
  const firstPrefetch = [textRuntime, pick(probe.resources, (url) => /floorDecor/i.test(url)), pick(probe.resources, (url) => /BlueprintView/i.test(url))]
    .filter(Boolean)
    .sort((a, b) => a.startTime - b.startTime)[0] ?? null
  const idle = pick(probe.resources, (url) => /IdlePrewarm/i.test(url))
  const labels = pick(probe.resources, (url) => /\/labels-/i.test(url) || /ProgressiveRoomLabels/i.test(url))
  const badgeAfterFrame = badge && probe.firstFrameAt != null ? badge.responseEnd - probe.firstFrameAt : null
  return {
    quality,
    round,
    load: loadavg(),
    firstFrameAt: probe.firstFrameAt,
    badgeStart: badge?.startTime ?? null,
    badgeEnd: badge?.responseEnd ?? null,
    badgeAfterFrame,
    badgeBeforeOrWithin500:
      badge != null &&
      probe.firstFrameAt != null &&
      (badge.responseEnd <= probe.firstFrameAt || badge.responseEnd - probe.firstFrameAt <= 500),
    firstPrefetchStart: firstPrefetch?.startTime ?? null,
    firstPrefetchEnd: firstPrefetch?.responseEnd ?? null,
    textRuntimeStart: textRuntime?.startTime ?? null,
    textRuntimeEnd: textRuntime?.responseEnd ?? null,
    idlePrewarm: idle?.startTime ?? null,
    labels: labels?.startTime ?? null,
    idleAfterPrefetch:
      idle != null && textRuntime != null ? idle.startTime - textRuntime.responseEnd : null,
    labelsAfterPrefetch:
      labels != null && textRuntime != null ? labels.startTime - textRuntime.responseEnd : null,
    badgesAtReady: atReady.badges,
    badgeCentersAtReady: atReady.badgeCenters,
    alarmDevicesAtReady: atReady.alarmDevices,
    badgesLater: probe.badges,
    gpuTier: atReady.quality,
    errors,
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
  const report = { createdAt: new Date().toISOString(), baseUrl, load: loadavg(), runs: [] }
  try {
    for (const quality of ['balanced', 'perf', 'auto']) {
      for (let round = 1; round <= 3; round += 1) {
        report.runs.push(await runOne(browser, quality, round))
      }
    }
  } finally {
    await browser.close()
  }
  report.ok =
    report.runs.every(
      (run) =>
        run.badgeBeforeOrWithin500 &&
        (run.badgesAtReady ?? 0) > 0 &&
        (run.alarmDevicesAtReady ?? 0) > 0 &&
        run.errors.length === 0,
    ) &&
    report.runs.every((run) => (run.idleAfterPrefetch ?? 0) >= 0 && (run.labelsAfterPrefetch ?? 0) >= 0)
  await mkdir(outDir, { recursive: true })
  const jsonPath = resolve(outDir, 't017-d198-badge-timeline.json')
  await writeFile(jsonPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  console.log(`wrote ${jsonPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
