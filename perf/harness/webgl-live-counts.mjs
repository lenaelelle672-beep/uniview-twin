#!/usr/bin/env node
/**
 * D203 / 预热 GPU 对象计数：不改应用，导航前注入 WebGL2 计数器。
 *
 * 注入方式（任选其一，本文件对 Puppeteer / Playwright / 裸 CDP 都包一层）：
 *   - Puppeteer: page.evaluateOnNewDocument → CDP Page.addScriptToEvaluateOnNewDocument
 *   - Playwright: page.addInitScript
 *   - CDP: Page.addScriptToEvaluateOnNewDocument { source }
 *
 * 挂钩：WebGL2RenderingContext.prototype
 *   createBuffer / deleteBuffer / createTexture / deleteTexture
 * 读数：window.__twinWebglLive.snapshot() → { buffers, textures, created*, deleted* }
 *
 * 用法：
 *   import { installWebglLiveCounts, readWebglLiveCounts } from './webgl-live-counts.mjs'
 *   await installWebglLiveCounts(page)  // 必须在 page.goto 之前
 *   node perf/harness/webgl-live-counts.mjs [baseUrl] [quality]
 *
 * 总览、不进层。ready 与 __twinPrewarmed 各拍一次 live buffer / texture。
 * 预热只允许一小段 troika-text 基线；批量跳升说明建了楼层网格。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))

/** 页面上下文：必须无闭包，供 evaluateOnNewDocument / addInitScript / CDP source 复用。 */
export function installWebglLiveCountHooks() {
  if (window.__twinWebglLive) return
  const buffers = new Set()
  const textures = new Set()
  const live = {
    createdBuffers: 0,
    deletedBuffers: 0,
    createdTextures: 0,
    deletedTextures: 0,
    snapshot() {
      return {
        buffers: buffers.size,
        textures: textures.size,
        createdBuffers: live.createdBuffers,
        deletedBuffers: live.deletedBuffers,
        createdTextures: live.createdTextures,
        deletedTextures: live.deletedTextures,
        view: window.__twinView ?? null,
        selected: window.__twinSelected ?? null,
        ready: window.__twinReady === true,
        prewarmed: window.__twinPrewarmed === true,
      }
    },
  }
  window.__twinWebglLive = live

  const proto = typeof WebGL2RenderingContext === 'function' ? WebGL2RenderingContext.prototype : null
  if (!proto) return

  const wrapCreate = (name, bag, createdKey) => {
    const original = proto[name]
    if (typeof original !== 'function') return
    proto[name] = function webglLiveCreate() {
      const object = original.apply(this, arguments)
      if (object) {
        bag.add(object)
        live[createdKey] += 1
      }
      return object
    }
  }
  const wrapDelete = (name, bag, deletedKey) => {
    const original = proto[name]
    if (typeof original !== 'function') return
    proto[name] = function webglLiveDelete(object) {
      if (object && bag.delete(object)) live[deletedKey] += 1
      return original.apply(this, arguments)
    }
  }

  wrapCreate('createBuffer', buffers, 'createdBuffers')
  wrapDelete('deleteBuffer', buffers, 'deletedBuffers')
  wrapCreate('createTexture', textures, 'createdTextures')
  wrapDelete('deleteTexture', textures, 'deletedTextures')
}

export const WEBGL_LIVE_COUNT_SOURCE = `(${installWebglLiveCountHooks.toString()})()`

export async function installWebglLiveCounts(page) {
  if (typeof page?.evaluateOnNewDocument === 'function') {
    await page.evaluateOnNewDocument(installWebglLiveCountHooks)
    return 'evaluateOnNewDocument'
  }
  if (typeof page?.addInitScript === 'function') {
    await page.addInitScript(installWebglLiveCountHooks)
    return 'addInitScript'
  }
  const session =
    typeof page?.createCDPSession === 'function'
      ? await page.createCDPSession()
      : typeof page?.target === 'function'
        ? await page.target().createCDPSession()
        : null
  if (session) {
    await session.send('Page.addScriptToEvaluateOnNewDocument', { source: WEBGL_LIVE_COUNT_SOURCE })
    return 'Page.addScriptToEvaluateOnNewDocument'
  }
  throw new Error('page 不支持 evaluateOnNewDocument / addInitScript / CDP')
}

export async function readWebglLiveCounts(page) {
  return page.evaluate(() => {
    const snap = window.__twinWebglLive?.snapshot?.()
    if (!snap) return null
    return {
      ...snap,
      readyAt: window.__twinReadyAt ?? null,
      firstFrameAt: window.__twinFirstFrameAt ?? null,
      prewarmedAt: window.__twinPrewarmedAt ?? null,
      prewarmStartedAt: window.__twinPrewarmStartedAt ?? null,
      now: performance.now(),
    }
  })
}

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

function chromeArgs() {
  return [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
    '--window-size=1366,768',
  ]
}

function delta(ready, prewarmed) {
  if (!ready || !prewarmed) return null
  return {
    buffers: prewarmed.buffers - ready.buffers,
    textures: prewarmed.textures - ready.textures,
    createdBuffers: prewarmed.createdBuffers - ready.createdBuffers,
    deletedBuffers: prewarmed.deletedBuffers - ready.deletedBuffers,
    createdTextures: prewarmed.createdTextures - ready.createdTextures,
    deletedTextures: prewarmed.deletedTextures - ready.deletedTextures,
  }
}

/** 楼层网格会一次建出大量 buffer；troika SDF 通常只涨几个 texture / 少量 buffer。 */
const BATCH_JUMP_BUFFERS = 40
const BATCH_JUMP_TEXTURES = 16

export async function measureOverviewPrewarmCounts(page, { baseUrl, quality = 'perf' } = {}) {
  const injected = await installWebglLiveCounts(page)
  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  await page.goto(`${baseUrl}/?q=${quality}`, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForFunction(() => window.__twinReady === true, { timeout: 60_000 })
  const ready = await readWebglLiveCounts(page)
  await page.waitForFunction(() => window.__twinPrewarmed === true, { timeout: 180_000 })
  const prewarmed = await readWebglLiveCounts(page)
  const change = delta(ready, prewarmed)
  const stayedOnOverview = ready?.view !== 'floor' && prewarmed?.view !== 'floor' && !ready?.selected && !prewarmed?.selected
  return {
    injected,
    quality,
    stayedOnOverview,
    ready,
    prewarmed,
    delta: change,
    batchJump:
      Boolean(change) &&
      (change.createdBuffers >= BATCH_JUMP_BUFFERS || change.createdTextures >= BATCH_JUMP_TEXTURES),
  }
}

async function main() {
  const puppeteer = require('puppeteer-core')
  const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
  const quality = process.argv[3] ?? 'perf'
  const outDir = process.env.ARTIFACT_DIR ?? resolve(here, '../../docs/T017-evidence')
  const executablePath = chromePath()
  if (!executablePath) throw new Error('找不到 Chrome')
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: chromeArgs(),
  })
  const page = await browser.newPage()
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  try {
    const measured = await measureOverviewPrewarmCounts(page, { baseUrl, quality })
    const report = {
      createdAt: new Date().toISOString(),
      script: 'perf/harness/webgl-live-counts.mjs',
      baseUrl,
      ...measured,
      errors,
      ok:
        measured.stayedOnOverview &&
        measured.ready != null &&
        measured.prewarmed != null &&
        measured.batchJump !== true &&
        errors.length === 0,
    }
    await mkdir(outDir, { recursive: true })
    const jsonPath = resolve(outDir, 't017-d203-webgl-live-counts.json')
    await writeFile(jsonPath, JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
    console.log(`wrote ${jsonPath}`)
    if (!report.ok) process.exitCode = 1
  } finally {
    await browser.close()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
