#!/usr/bin/env node
/**
 * D125 量法：Python gzip.compress(9)，各文件单独压。
 * 均衡档总览 1366×768 实际请求里不含 balancedFx 的部分（不含 .hdr、favicon、
 * 首帧之后才发的预取包）≤ 436,361 B。
 * balancedFx 单独预算 gzip ≤ 105,000 B。性能档总览不得请求 balancedFx。
 * 用法：`node scripts/measure-first-screen.mjs [baseUrl] [label]`
 */
import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const label = process.argv[3] ?? 'current'
const HARD_GATE = 436_361
const FX_BUDGET = 105_000

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

function classifyUrl(url) {
  const path = url.replace(baseUrl, '')
  const hdr = /\.hdr(\?|$)/i.test(path)
  const favicon = /favicon/i.test(path)
  const balancedFx = /balancedFx/i.test(path)
  return { path, hdr, favicon, balancedFx }
}

async function measureTier(browser, quality) {
  const page = await browser.newPage()
  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })

  const bodies = new Map()
  page.on('response', async (response) => {
    const url = response.url()
    if (!url.startsWith(baseUrl)) return
    try {
      bodies.set(url, Buffer.from(await response.buffer()))
    } catch {
      // 有的响应体读不到，跳过
    }
  })

  await page.goto(`${baseUrl}/?q=${quality}`, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForFunction(() => window.__twinReady === true, { timeout: 60_000 })
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1500)))

  const timing = await page.evaluate(() => {
    const first = window.__twinFirstFrameAt
    return {
      firstFrameAt: first,
      resources: performance.getEntriesByType('resource').map((entry) => ({
        url: entry.name,
        startTime: entry.startTime,
        afterFirstFrame: first != null && entry.startTime > first,
      })),
    }
  })
  await page.close()

  const afterByUrl = new Map(timing.resources.map((entry) => [entry.url, entry.afterFirstFrame]))
  const files = [...bodies.entries()].map(([url, buffer]) => {
    const info = classifyUrl(url)
    const gzip = gzipCompress9(buffer)
    const afterFirstFrame = Boolean(afterByUrl.get(url))
    return {
      url: info.path,
      bytes: buffer.length,
      gzip,
      hdr: info.hdr,
      favicon: info.favicon,
      balancedFx: info.balancedFx,
      afterFirstFrame,
    }
  })
  files.sort((a, b) => b.gzip - a.gzip)

  const firstScreen = files.filter((file) => !file.hdr && !file.favicon && !file.afterFirstFrame)
  const hardGateFiles = firstScreen.filter((file) => !file.balancedFx)
  const fxFiles = files.filter((file) => file.balancedFx)
  const hardGate = hardGateFiles.reduce((sum, file) => sum + file.gzip, 0)
  const balancedFxGzip = fxFiles.reduce((sum, file) => sum + file.gzip, 0)
  const fullFirstScreen = hardGate + balancedFxGzip

  return {
    quality,
    firstFrameAt: timing.firstFrameAt,
    fileCount: files.length,
    hardGate,
    balancedFxGzip,
    fullFirstScreen,
    requestedBalancedFx: fxFiles.length > 0,
    files,
    hardGateFiles: hardGateFiles.map((file) => file.url),
    fxFiles: fxFiles.map((file) => file.url),
  }
}

async function main() {
  let puppeteer
  try {
    puppeteer = require('puppeteer-core')
  } catch {
    throw new Error('需要 puppeteer-core：npm install -D puppeteer-core')
  }
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
    ],
  })

  const balanced = await measureTier(browser, 'balanced')
  const perf = await measureTier(browser, 'perf')
  await browser.close()

  const failures = []
  if (balanced.hardGate > HARD_GATE) {
    failures.push(`均衡档硬门禁 ${balanced.hardGate} > ${HARD_GATE}`)
  }
  if (balanced.balancedFxGzip > FX_BUDGET) {
    failures.push(`balancedFx ${balanced.balancedFxGzip} > ${FX_BUDGET}`)
  }
  if (perf.requestedBalancedFx) {
    failures.push('性能档总览请求了 balancedFx')
  }

  const report = {
    label,
    baseUrl,
    method: 'python gzip.compress(9)',
    viewport: { width: 1366, height: 768 },
    hardGateLimit: HARD_GATE,
    balancedFxLimit: FX_BUDGET,
    balanced: {
      hardGate: balanced.hardGate,
      balancedFx: balanced.balancedFxGzip,
      fullFirstScreen: balanced.fullFirstScreen,
      requestedBalancedFx: balanced.requestedBalancedFx,
      files: balanced.files,
    },
    perf: {
      firstScreen: perf.hardGate,
      balancedFx: perf.balancedFxGzip,
      requestedBalancedFx: perf.requestedBalancedFx,
      files: perf.files,
    },
    summary: {
      hardGateNoFx: balanced.hardGate,
      balancedFx: balanced.balancedFxGzip,
      balancedFullFirstScreen: balanced.fullFirstScreen,
      perfFirstScreen: perf.hardGate,
    },
    ok: failures.length === 0,
    failures,
  }

  console.log(JSON.stringify(report, null, 2))
  const outDir = process.env.ARTIFACT_DIR ?? resolve(here, '../docs/T012-evidence')
  await mkdir(outDir, { recursive: true })
  await writeFile(resolve(outDir, `first-screen-${label}.json`), JSON.stringify(report, null, 2))
  if (failures.length) {
    console.error(failures.join('\n'))
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
