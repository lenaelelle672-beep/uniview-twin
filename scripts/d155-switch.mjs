#!/usr/bin/env node
/** D155：均衡→性能→均衡 5 轮，记录画布/composer 尺寸、零尺寸警告、显存。 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const evidenceDir = resolve(process.cwd(), 'docs/T012-evidence')
const shotDir = process.env.ARTIFACT_DIR ?? '/opt/cursor/artifacts/screenshots'
const ROUNDS = Number(process.env.ROUNDS ?? 5)

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

async function waitReady(page, quality) {
  await page.waitForFunction(() => window.__twinReady === true, { timeout: 90_000 })
  if (quality === 'balanced') {
    await page
      .waitForFunction(
        () => window.__twinComposerLive === true && document.querySelector('.scene-root')?.dataset.fxReady === '1',
        { timeout: 45_000 },
      )
      .catch(() => {})
  }
}

async function measure(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl')
    return {
      canvas: { width: canvas?.width ?? 0, height: canvas?.height ?? 0, css: { w: canvas?.clientWidth, h: canvas?.clientHeight } },
      drawingBuffer: gl ? { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight } : null,
      composer: window.__twinOverlayBudget?.drawingBuffer ?? null,
      memory: window.__twinMemory ?? null,
      quality: document.querySelector('.scene-root')?.dataset.quality ?? null,
    }
  })
}

async function main() {
  await mkdir(shotDir, { recursive: true })
  await mkdir(evidenceDir, { recursive: true })
  const browser = await puppeteer.launch({
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
  const page = await browser.newPage()
  const warnings = []
  page.on('console', (msg) => {
    const text = msg.text()
    if (/Framebuffer|framebuffer|0\s*[x×]\s*0|1\s*[x×]\s*1|GL_INVALID|zero/i.test(text)) {
      warnings.push({ type: msg.type(), text })
    }
  })
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  await page.goto(`${baseUrl}/?q=balanced`, { waitUntil: 'load', timeout: 120_000 })
  await waitReady(page, 'balanced')
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 800)))
  const cold = await measure(page)
  const rounds = []
  for (let i = 1; i <= ROUNDS; i += 1) {
    await page.click('button[aria-label="画质：性能"]')
    await page.waitForFunction(() => document.querySelector('.scene-root')?.dataset.quality === 'perf', { timeout: 45_000 })
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)))
    const perf = await measure(page)
    await page.click('button[aria-label="画质：均衡"]')
    await page.waitForFunction(() => document.querySelector('.scene-root')?.dataset.quality === 'balanced', { timeout: 45_000 })
    await waitReady(page, 'balanced')
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)))
    const balanced = await measure(page)
    rounds.push({ i, perf, balanced })
    console.error(`round ${i} canvas=${balanced.canvas.width}x${balanced.canvas.height} mem=${JSON.stringify(balanced.memory)}`)
  }
  const canvas = await page.$('canvas')
  if (canvas) await canvas.screenshot({ path: resolve(shotDir, 'd155-switch-after-5.png') })
  const last = rounds.at(-1)?.balanced
  const sameSize =
    last &&
    last.canvas.width === cold.canvas.width &&
    last.canvas.height === cold.canvas.height &&
    last.canvas.width > 1 &&
    last.canvas.height > 1
  const c2 = rounds[1]?.balanced?.memory ?? null
  const c5 = rounds[4]?.balanced?.memory ?? null
  const c2c5 =
    c2 &&
    c5 &&
    c2.textures === c5.textures &&
    c2.geometries === c5.geometries &&
    c2.programs === c5.programs
  const zeroWarn = warnings.filter((item) => /1\s*[x×]\s*1|0\s*[x×]\s*0|Framebuffer/i.test(item.text))
  const report = {
    baseUrl,
    cold,
    rounds,
    warnings: warnings.length,
    zeroSizeWarnings: zeroWarn.length,
    sameSize,
    c2,
    c5,
    c2c5,
    ok: Boolean(sameSize && c2c5 && zeroWarn.length === 0),
  }
  await writeFile(resolve(evidenceDir, 'd155-switch.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ok: report.ok, sameSize, c2c5, zeroSizeWarnings: report.zeroSizeWarnings, cold: cold.canvas, last: last?.canvas, c2, c5 }, null, 2))
  await browser.close()
  if (!report.ok) process.exit(2)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
