#!/usr/bin/env node
/**
 * D201：等 __twinPrewarmed 后再进 F1，确认不再长 SDF。
 * 用法：node scripts/t017-d201-prewarm-f1.mjs [baseUrl]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
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
  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  const sdf = []
  const errors = []
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
  page.on('console', (msg) => {
    const text = msg.text()
    if (/Increasing SDF texture size \d+->\d+/.test(text)) sdf.push({ when: 'console', text })
    if (msg.type() === 'error') errors.push(text)
  })
  await page.goto(`${baseUrl}/?q=perf`, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForFunction(() => window.__twinReady === true, { timeout: 60_000 })
  const readyAt = await page.evaluate(() => performance.now())
  await page.waitForFunction(() => window.__twinPrewarmed === true, { timeout: 120_000 })
  const atFlag = await page.evaluate(() => ({
    now: performance.now(),
    prewarmedAt: window.__twinPrewarmedAt ?? null,
    startedAt: window.__twinPrewarmStartedAt ?? null,
    prewarm: window.__twinPrewarm ?? null,
    sdf: window.__twinSdfGrowth ?? [],
  }))
  const sdfBeforeF1 = [...sdf, ...atFlag.sdf]
  await page.evaluate(() => {
    window.__twinSdfGrowth = []
    window.__twinFocusDevice?.({ floor: 'F1', deskId: null, deviceId: 'F1-PR1' })
  })
  await page.waitForFunction(
    () => window.__twinView === 'floor' && window.__twinSelected === 'F1' && window.__twinLabelMount?.done === true,
    { timeout: 90_000 },
  )
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 2000)))
  const after = await page.evaluate(() => ({
    sdf: window.__twinSdfGrowth ?? [],
    pack: window.__twinLabelPackMs ?? null,
    mount: window.__twinLabelMount ?? null,
    prewarm: window.__twinPrewarm ?? null,
  }))
  await browser.close()
  const report = {
    createdAt: new Date().toISOString(),
    baseUrl,
    readyAt,
    flagDelayMs: (atFlag.prewarmedAt ?? atFlag.now) - readyAt,
    glyphsRequired: atFlag.prewarm?.glyphsRequired ?? null,
    glyphsPrewarmed: atFlag.prewarm?.glyphsPrewarmed ?? null,
    sdfBeforeF1: sdfBeforeF1,
    sdfAfterF1: [...sdf.filter((item) => !sdfBeforeF1.includes(item)), ...after.sdf],
    mount: after.mount,
    pack: after.pack,
    errors,
  }
  report.ok =
    report.glyphsPrewarmed != null &&
    report.glyphsRequired != null &&
    report.glyphsPrewarmed >= report.glyphsRequired &&
    report.sdfAfterF1.length === 0 &&
    errors.length === 0
  await mkdir(outDir, { recursive: true })
  const jsonPath = resolve(outDir, 't017-d201-prewarm-f1.json')
  await writeFile(jsonPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  console.log(`wrote ${jsonPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
