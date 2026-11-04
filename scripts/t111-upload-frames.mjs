#!/usr/bin/env node
/**
 * T111：SimReady 贴图按帧上传抽查。
 * 拦 WebGL2 的 texImage2D / texSubImage2D，按 rAF 帧记数；用贴图源对象把上传认到 SimReady 名下。
 * 通过条件：道具首个可见帧里 SimReady 贴图上传为 0，任一帧最多 1 张，console.error / pageerror 为 0。
 * 用法：`node scripts/t111-upload-frames.mjs [baseUrl] [balanced|perf] [宽] [高] [day|night]`
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const quality = process.argv[3] ?? 'balanced'
const width = Number(process.argv[4] ?? 1366)
const height = Number(process.argv[5] ?? 768)
const dayNight = process.argv[6] ?? 'day'

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

function installProbe() {
  const probe = { frame: 0, sources: [], events: [], firstSimFrame: null, simImages: new Set() }
  window.__t111Probe = probe
  probe.collectSim = (root) => {
    root?.traverse((child) => {
      const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : []
      for (const material of materials) {
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
          const image = material[key]?.image
          if (image) probe.simImages.add(image)
        }
      }
    })
  }
  const tick = () => {
    probe.frame += 1
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  const proto = WebGL2RenderingContext.prototype
  for (const name of ['texImage2D', 'texSubImage2D']) {
    const original = proto[name]
    proto[name] = function (...args) {
      const source = args.find((arg) => arg && typeof arg === 'object' && 'width' in arg && !ArrayBuffer.isView(arg))
      if (source && args[1] === 0) {
        probe.sources.push(source)
        probe.events.push({ frame: probe.frame, source: probe.sources.length - 1, w: source.width, h: source.height })
      }
      return original.apply(this, args)
    }
  }
  const hook = () => {
    const renderer = window.__twinRenderer
    if (!renderer) {
      setTimeout(hook, 50)
      return
    }
    const render = renderer.render
    renderer.render = function (scene, camera) {
      const taste = probe.firstSimFrame == null ? scene?.getObjectByName?.('SimReadyTaste') : null
      if (taste) {
        probe.firstSimFrame = probe.frame
        // 汇总那一刻道具组不一定还在场景里，贴图源在首次绘制时就记下。
        probe.collectSim(taste)
      }
      return render.call(this, scene, camera)
    }
  }
  hook()
}

function summarize() {
  const probe = window.__t111Probe
  probe.collectSim(window.__twinScene?.getObjectByName('SimReadyTaste'))
  const images = probe.simImages
  const sim = probe.events.filter((event) => images.has(probe.sources[event.source]))
  const perFrame = {}
  for (const event of sim) perFrame[event.frame] = (perFrame[event.frame] ?? 0) + 1
  return {
    simready: window.__twinSimReady ?? null,
    simImages: images.size,
    simUploads: sim.length,
    simUploadsInFirstVisibleFrame: sim.filter((event) => event.frame === probe.firstSimFrame).length,
    maxSimUploadsPerFrame: Math.max(0, ...Object.values(perFrame)),
    simUploadFrames: Object.keys(perFrame).length,
    firstSimFrame: probe.firstSimFrame,
    perFrame,
  }
}

async function main() {
  const executablePath = chromePath()
  if (!executablePath) throw new Error('找不到 Chrome')
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: 1 })
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  await page.evaluateOnNewDocument(installProbe)
  await page.goto(`${baseUrl}/?q=${quality}`, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForFunction(() => window.__twinReady === true, { timeout: 60_000 })
  if (dayNight === 'night') await page.evaluate(() => window.__twinSetDayNight?.('night'))
  await page.waitForFunction(
    () => window.__twinSimReady?.mounted === 4 && window.__t111Probe.firstSimFrame != null,
    { timeout: 120_000 },
  )
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1500)))
  const summary = await page.evaluate(summarize)
  await browser.close()

  const failures = []
  if (summary.simUploads === 0) failures.push('没有记到 SimReady 贴图上传')
  if (summary.simUploadsInFirstVisibleFrame > 0) failures.push(`首个可见帧仍上传 ${summary.simUploadsInFirstVisibleFrame} 张`)
  if (summary.maxSimUploadsPerFrame > 1) failures.push(`单帧最多上传 ${summary.maxSimUploadsPerFrame} 张`)
  if (errors.length > 0) failures.push(`console / pageerror ${errors.length} 条`)
  console.log(JSON.stringify({ baseUrl, quality, width, height, dayNight, ...summary, errors, ok: failures.length === 0, failures }, null, 2))
  if (failures.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
