#!/usr/bin/env node
/**
 * D087 量法：首屏会加载的所有文件（JS、CSS、PNG、LICENSE），每个 gzip -9 后相加，不算 .hdr。
 * 用法：`node scripts/measure-first-screen.mjs [baseUrl] [label]`
 */
import { gzipSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5190'
const label = process.argv[3] ?? 'current'

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
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  const seen = new Map()
  page.on('response', async (response) => {
    const url = response.url()
    if (!url.startsWith(baseUrl)) return
    if (/\.hdr(\?|$)/i.test(url)) return
    try {
      const buffer = Buffer.from(await response.buffer())
      seen.set(url, buffer)
    } catch {
      // 有的响应体读不到，跳过
    }
  })
  await page.goto(`${baseUrl}/?q=perf`, { waitUntil: 'networkidle0', timeout: 90_000 })
  await page.waitForFunction(() => window.__twinReady === true, { timeout: 60_000 })
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1500)))
  const files = [...seen.entries()].map(([url, buffer]) => {
    const gzip = gzipSync(buffer, { level: 9 })
    return { url: url.replace(baseUrl, ''), bytes: buffer.length, gzip: gzip.length }
  })
  files.sort((a, b) => b.gzip - a.gzip)
  const totalGzip = files.reduce((sum, file) => sum + file.gzip, 0)
  const postfx = files.filter((file) => /balancedFx|postfx|n8ao|postprocessing/i.test(file.url))
  const report = { label, baseUrl, fileCount: files.length, totalGzip, postfxOnPerf: postfx.length, files }
  console.log(JSON.stringify(report, null, 2))
  const outDir = process.env.ARTIFACT_DIR ?? '/opt/cursor/artifacts'
  await mkdir(outDir, { recursive: true })
  await writeFile(resolve(outDir, `first-screen-${label}.json`), JSON.stringify(report, null, 2))
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
