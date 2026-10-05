#!/usr/bin/env node
/**
 * 每次新开页面后第一次从性能档切到均衡档，抓切档那几帧，判断有没有空画布。
 * 用法：先预览或开发服，再 `node scripts/first-switch-empty-frames.mjs [baseUrl]`
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5190'
const rounds = Number(process.argv[3] ?? 10)
const outDir = process.env.ARTIFACT_DIR ?? '/opt/cursor/artifacts/first-switch'

async function loadPuppeteer() {
  try {
    return require('puppeteer-core')
  } catch {
    throw new Error('需要 puppeteer-core：npm install -D puppeteer-core')
  }
}

function chromePath() {
  return (
    process.env.CHROME_PATH ??
    ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((path) => {
      try {
        require('node:fs').accessSync(path)
        return true
      } catch {
        return false
      }
    })
  )
}

async function waitReady(page) {
  await page.waitForFunction(() => window.__twinReady === true && window.__twinStats?.calls > 0, {
    timeout: 60_000,
  })
  await page.waitForFunction(() => (window.__twinBadges ?? 0) >= 20, { timeout: 30_000 }).catch(() => {})
}

async function runRound(browser, index) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  const requests = []
  page.on('request', (request) => {
    requests.push(request.url())
  })
  await page.goto(`${baseUrl}/?q=perf`, { waitUntil: 'networkidle0', timeout: 90_000 })
  await waitReady(page)
  await page.evaluate(() => {
    window.__twinFrameWatch = { active: true, frames: [] }
  })
  const clickStarted = await page.evaluate(() => performance.now())
  await page.click('button[aria-label="画质：均衡"]')
  await page.waitForFunction(() => window.__twinWarmup?.totalMs > 0 && document.querySelector('.scene-root')?.dataset.fxReady === '1', {
    timeout: 45_000,
  })
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const result = await page.evaluate((started) => {
    const watch = window.__twinFrameWatch
    if (watch) watch.active = false
    const frames = (watch?.frames ?? []).filter((frame) => frame.at >= started - 8)
    return {
      warmup: window.__twinWarmup ?? null,
      stats: window.__twinStats ?? null,
      emptyFrames: frames.filter((frame) => frame.empty).length,
      badgeOnlyAfterUnfreeze: frames.filter((frame) => frame.badgeOnly && !frame.freezeUp).length,
      frames,
      postfxRequested: performance.getEntriesByType('resource').some((entry) => /balancedFx|postfx|N8AO|postprocessing/i.test(entry.name)),
    }
  }, clickStarted)
  const postfxOnPerf = requests.some((url) => /balancedFx|postfx|n8ao|postprocessing/i.test(url) && !result.postfxRequested)
  await page.close()
  return {
    round: index + 1,
    compileMs: result.warmup?.compileMs ?? null,
    totalMs: result.warmup?.totalMs ?? null,
    calls: result.stats?.calls ?? null,
    emptyFrames: result.emptyFrames,
    badgeOnlyAfterUnfreeze: result.badgeOnlyAfterUnfreeze,
    frames: result.frames,
    postfxRequestedAfterClick: result.postfxRequested,
    postfxOnPerf,
  }
}

async function main() {
  const puppeteer = await loadPuppeteer()
  const executablePath = chromePath()
  if (!executablePath) throw new Error('找不到 Chrome')
  await mkdir(outDir, { recursive: true })
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
  })
  const rows = []
  try {
    for (let index = 0; index < rounds; index += 1) {
      const row = await runRound(browser, index)
      rows.push(row)
      console.log(
        `round ${row.round}: compile=${row.compileMs?.toFixed?.(1) ?? row.compileMs}ms total=${row.totalMs?.toFixed?.(1) ?? row.totalMs}ms empty=${row.emptyFrames} badgeOnlyAfterUnfreeze=${row.badgeOnlyAfterUnfreeze} calls=${row.calls}`,
      )
    }
  } finally {
    await browser.close()
  }
  const emptyTotal = rows.reduce((sum, row) => sum + row.emptyFrames, 0)
  const badgeOnlyAfterUnfreeze = rows.reduce((sum, row) => sum + (row.badgeOnlyAfterUnfreeze ?? 0), 0)
  const report = {
    baseUrl,
    rounds,
    emptyTotal,
    badgeOnlyAfterUnfreeze,
    rows: rows.map(({ frames, ...row }) => ({ ...row, frameCount: frames.length })),
  }
  await writeFile(resolve(outDir, 'report.json'), JSON.stringify({ ...report, rows }, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (badgeOnlyAfterUnfreeze > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
