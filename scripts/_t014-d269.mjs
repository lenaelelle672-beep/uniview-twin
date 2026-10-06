#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const label = process.argv[3] ?? 'head'
const puppeteer = require('puppeteer-core')

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

function median(values) {
  const xs = values.filter((n) => typeof n === 'number').sort((a, b) => a - b)
  if (xs.length === 0) return null
  return xs[Math.floor(xs.length / 2)]
}

function maxOf(values) {
  const xs = values.filter((n) => typeof n === 'number')
  return xs.length ? Math.max(...xs) : null
}

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

async function open(search = '?q=balanced') {
  const page = await browser.newPage()
  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  await page.evaluateOnNewDocument(() => {
    const stamps = []
    let last = performance.now()
    const tick = () => {
      const now = performance.now()
      stamps.push({ at: now, dt: now - last })
      last = now
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    window.__twinRafStamps = stamps
    const wrap = (proto) => {
      if (!proto || proto.__qaShaderHook) return
      proto.__qaShaderHook = true
      const origC = proto.compileShader
      const origL = proto.linkProgram
      proto.compileShader = function (shader) {
        const at = performance.now()
        const result = origC.call(this, shader)
        ;(window.__qaShaders ??= []).push({
          kind: 'compileShader',
          at,
          ms: performance.now() - at,
          view: window.__twinView,
          floor: window.__twinSelected ?? null,
        })
        return result
      }
      proto.linkProgram = function (program) {
        const at = performance.now()
        const result = origL.call(this, program)
        ;(window.__qaShaders ??= []).push({
          kind: 'linkProgram',
          at,
          ms: performance.now() - at,
          view: window.__twinView,
          floor: window.__twinSelected ?? null,
        })
        return result
      }
    }
    wrap(WebGLRenderingContext.prototype)
    if (typeof WebGL2RenderingContext !== 'undefined') wrap(WebGL2RenderingContext.prototype)
  })
  await page.goto(`${baseUrl}/${search}`, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForFunction(() => window.__twinReady === true, { timeout: 90_000 })
  return page
}

async function waitReady(page, started) {
  return page.evaluate(async (t0) => {
    const find = () => {
      let batch = null
      window.__twinScene?.traverse((obj) => {
        if (obj.name === 'RoomLabelBatchedText') batch = obj
      })
      return batch
    }
    let last = -1
    let stable = 0
    const begin = performance.now()
    while (performance.now() - begin < 25_000) {
      const batch = find()
      const members = batch?._members
      if (members && members.size && window.__twinLabelFading !== true) {
        let vis = 0
        let ready = 0
        for (const text of members.keys()) {
          if (text.scale?.x > 0.05 && (text.fillOpacity ?? 0) >= 0.98) {
            vis += 1
            if (text.textRenderInfo?.blockBounds) ready += 1
          }
        }
        if (vis > 0 && vis === ready) {
          if (vis === last) stable += 1
          else {
            last = vis
            stable = 1
          }
          if (stable >= 3) {
            const o = window.__twinLabelOverlap
            const p = window.__twinLabelPhases ?? {}
            return {
              ms: Math.round(performance.now() - t0),
              vis,
              syncs: window.__twinLabelSyncs ?? 0,
              batch: true,
              overlap: o?.overlapPairs ?? null,
              mismatch: o?.mismatch ?? null,
              hidden: o?.hidden ?? null,
              restReason: window.__twinCameraRestReason ?? p.restReason ?? null,
              clickToRest: p.restAt != null ? Math.round(p.restAt - t0) : null,
              clickToMove:
                window.__twinCameraMoveAt != null ? Math.round(window.__twinCameraMoveAt - t0) : null,
              avoidMs: p.avoidMs ?? null,
              syncMs: p.syncMs ?? null,
              fadeMs:
                p.fadeMs ??
                (p.fadeDoneAt != null && p.fadeStartAt != null ? Math.round(p.fadeDoneAt - p.fadeStartAt) : null),
              fadeStartAt: p.fadeStartAt ?? null,
              fadeDoneAt: p.fadeDoneAt ?? null,
              packStep: p.packStep ?? null,
              atlasHeight: window.__twinGlyphPreload?.atlasHeight ?? null,
            }
          }
        } else {
          last = -1
          stable = 0
        }
      }
      await new Promise((r) => requestAnimationFrame(r))
    }
    return { ms: null, vis: last, syncs: window.__twinLabelSyncs ?? 0, batch: Boolean(find()) }
  }, started)
}

function snapshotTex(page) {
  return page.evaluate(() => {
    const tex = window.__twinTexImage2D
    const atlas = (tex?.calls ?? []).filter((row) => row.atlas)
    return {
      calls: tex?.calls?.length ?? 0,
      uploadMs: tex?.uploadMs ?? 0,
      atlas: atlas.map((row) => ({
        at: row.at,
        ms: Math.round(row.ms),
        w: row.w,
        h: row.h,
        view: row.view,
        floor: row.floor,
      })),
      spaceCall: window.__twinGlyphPreload?.spaceCall ?? null,
      upload: window.__twinGlyphPreload?.upload ?? null,
      compile: window.__twinGlyphPreload?.compile ?? null,
      interiorCompile: window.__twinGlyphPreload?.interiorCompile ?? null,
      uploaded: window.__twinGlyphPreload?.uploaded ?? false,
      atlasHeight: window.__twinGlyphPreload?.atlasHeight ?? null,
      atlasWidth: window.__twinGlyphPreload?.atlasWidth ?? null,
      paused: window.__twinGlyphPreload?.paused ?? null,
      done: window.__twinGlyphPreload?.done ?? null,
    }
  })
}

function snapshotPrograms(page) {
  return page.evaluate(() => ({
    programs: window.__twinMemory?.programs ?? window.__twinRenderer?.info.programs?.length ?? null,
    log: window.__twinProgramLog ?? [],
  }))
}

function shadersSince(page, t0) {
  return page.evaluate((since) => {
    const rows = (window.__qaShaders ?? []).filter((row) => row.at >= since)
    return {
      compileShader: rows.filter((row) => row.kind === 'compileShader').length,
      linkProgram: rows.filter((row) => row.kind === 'linkProgram').length,
      rows: rows.slice(0, 24).map((row) => ({
        kind: row.kind,
        at: Math.round(row.at),
        ms: Math.round(row.ms),
        view: row.view,
        floor: row.floor,
      })),
    }
  }, t0)
}

async function waitGlyph(page) {
  const appeared = await page
    .waitForFunction(() => window.__twinGlyphPreload != null, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false)
  if (!appeared) return false
  await page
    .waitForFunction(
      () =>
        window.__twinGlyphPreload?.done === true &&
        window.__twinGlyphPreload?.uploaded === true &&
        window.__twinGlyphPreload?.compile != null,
      { timeout: 90_000 },
    )
    .catch(() => {})
  return true
}

async function enterFloor(page, floor) {
  const clickAt = await page.evaluate(() => {
    window.__twinCameraMoveAt = undefined
    return performance.now()
  })
  const marker = await page.$(`[data-twin-floor-marker="${floor}"]`)
  if (marker) await marker.click({ clickCount: 2 })
  else await page.evaluate((id) => window.__twinFocusDevice?.({ floor: id, deskId: null }), floor)
  await page.waitForFunction((id) => window.__twinView === 'floor' && window.__twinSelected === id, { timeout: 45_000 }, floor)
  return clickAt
}

const out = {
  label,
  baseUrl,
  idle: null,
  clickToMove: {},
  floors: {},
  consecutive: [],
  f2Trace: null,
}

{
  const page = await open()
  await page.waitForFunction(() => window.__twinFirstFrameAt != null, { timeout: 30_000 })
  const idleStart = await page.evaluate(() => performance.now())
  await waitGlyph(page)
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)))
  out.idle = await page.evaluate((t0) => {
    const g = window.__twinGlyphPreload
    return {
      unique: g?.unique ?? 0,
      done: g?.done ?? false,
      batches: g?.batches ?? [],
      warmup: g?.warmup ?? [],
      atlasGrows: g?.atlasGrows ?? [],
      atlasHeight: g?.atlasHeight ?? null,
      spaceCall: g?.spaceCall ?? null,
      upload: g?.upload ?? null,
      compile: g?.compile ?? null,
      interiorCompile: g?.interiorCompile ?? null,
      waitMs: Math.round(performance.now() - t0),
      programs: window.__twinMemory?.programs ?? null,
    }
  }, idleStart)
  out.idle.tex = await snapshotTex(page)
  await page.close()
}

for (const delay of [500, 1500, 3000]) {
  const runs = []
  for (let i = 0; i < 3; i += 1) {
    const page = await open()
    await page.waitForFunction(() => window.__twinReady === true, { timeout: 90_000 })
    await page.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), delay)
    const clickAt = await page.evaluate(() => {
      window.__twinCameraMoveAt = undefined
      const cam = window.__twinRig?.camera?.position
      window.__twinClickCam = cam ? { x: cam.x, y: cam.y, z: cam.z } : null
      return performance.now()
    })
    const marker = await page.$('[data-twin-floor-marker="F1"]')
    if (marker) await marker.click({ clickCount: 2 })
    else await page.evaluate(() => window.__twinFocusDevice?.({ floor: 'F1', deskId: null }))
    await page.waitForFunction(() => window.__twinView === 'floor' && window.__twinSelected === 'F1', { timeout: 45_000 })
    const moveMs = await page.evaluate((t0) => {
      const started = performance.now()
      const origin = window.__twinClickCam
      return new Promise((resolve) => {
        const poll = () => {
          if (typeof window.__twinCameraMoveAt === 'number') {
            resolve(Math.round(window.__twinCameraMoveAt - t0))
            return
          }
          const cam = window.__twinRig?.camera?.position
          if (origin && cam && (Math.abs(cam.x - origin.x) > 1e-4 || Math.abs(cam.y - origin.y) > 1e-4 || Math.abs(cam.z - origin.z) > 1e-4)) {
            resolve(Math.round(performance.now() - t0))
            return
          }
          if (performance.now() - started > 8000) {
            resolve(null)
            return
          }
          requestAnimationFrame(poll)
        }
        poll()
      })
    }, clickAt)
    runs.push(moveMs)
    await page.close()
  }
  out.clickToMove[`ready+${delay}`] = { runs, median: median(runs), max: maxOf(runs) }
}

for (const floor of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']) {
  const runs = []
  for (let i = 0; i < 3; i += 1) {
    const page = await open()
    await page.waitForFunction(() => window.__twinReady === true, { timeout: 90_000 })
    await waitGlyph(page)
    const resetAt = await page.evaluate(() => {
      const now = performance.now()
      if (Array.isArray(window.__twinRafStamps)) window.__twinRafStamps.length = 0
      window.__twinCameraMoveAt = undefined
      return now
    })
    const before = await snapshotPrograms(page)
    const clickAt = await enterFloor(page, floor)
    const rest = await page.evaluate((t0) => {
      return new Promise((resolve) => {
        const begin = performance.now()
        const poll = () => {
          if (window.__twinCameraRested === true && window.__twinView === 'floor') {
            resolve({ clickToRest: Math.round(performance.now() - t0), restAt: performance.now() })
            return
          }
          if (performance.now() - begin > 20_000) {
            resolve({ clickToRest: null, restAt: null })
            return
          }
          requestAnimationFrame(poll)
        }
        poll()
      })
    }, clickAt)
    const row = await waitReady(page, clickAt)
    const after = await snapshotPrograms(page)
    row.maxFrameClickToRest =
      rest.restAt == null
        ? null
        : await page.evaluate(
            (t0, t1) => {
              const stamps = window.__twinRafStamps ?? []
              const slice = stamps.filter((item) => item.at >= t0 && item.at <= t1)
              if (!slice.length) return null
              return Math.round(Math.max(...slice.map((item) => item.dt)))
            },
            resetAt,
            rest.restAt,
          )
    row.clickToRest = rest.clickToRest
    row.programsBefore = before.programs
    row.programsAfter = after.programs
    row.programsDelta = before.programs == null || after.programs == null ? null : after.programs - before.programs
    row.shaders = await shadersSince(page, resetAt)
    row.tex = await snapshotTex(page)
    row.spaceDuringEntry = await page.evaluate((t0) => {
      const space = window.__twinGlyphPreload?.spaceCall
      if (!space) return null
      return space.at >= t0 ? space : null
    }, resetAt)
    row.entryLong = await page.evaluate((t0) =>
      (window.__twinEntryFrames ?? []).filter((item) => item.at >= t0 && item.dt >= 48).slice(-16),
    resetAt)
    runs.push(row)
    await page.close()
  }
  const complete = runs.map((row) => row.ms)
  const restFrames = runs.map((row) => row.maxFrameClickToRest)
  const fades = runs.map((row) => row.fadeMs)
  out.floors[floor] = {
    runs,
    medianMs: median(complete),
    maxMs: maxOf(complete),
    medianMaxFrameClickToRest: median(restFrames),
    maxMaxFrameClickToRest: maxOf(restFrames),
    medianFadeMs: median(fades),
    medianProgramsDelta: median(runs.map((row) => row.programsDelta)),
  }
}

{
  const page = await open()
  await waitGlyph(page)
  const client = await page.createCDPSession()
  await client.send('Tracing.start', {
    categories: '-*,devtools.timeline,disabled-by-default-devtools.timeline',
    transferMode: 'ReportEvents',
  })
  const events = []
  client.on('Tracing.dataCollected', (msg) => {
    for (const event of msg.value ?? []) {
      const name = event.name ?? ''
      if (/shader|compile|Program|GPUTask|Compile/i.test(name)) events.push({ name, ts: event.ts, dur: event.dur, ph: event.ph })
    }
  })
  const resetAt = await page.evaluate(() => {
    if (Array.isArray(window.__twinRafStamps)) window.__twinRafStamps.length = 0
    return performance.now()
  })
  const before = await snapshotPrograms(page)
  const clickAt = await enterFloor(page, 'F2')
  const rest = await page.evaluate((t0) => {
    return new Promise((resolve) => {
      const begin = performance.now()
      const poll = () => {
        if (window.__twinCameraRested === true && window.__twinView === 'floor') {
          resolve({ clickToRest: Math.round(performance.now() - t0), restAt: performance.now() })
          return
        }
        if (performance.now() - begin > 20_000) {
          resolve({ clickToRest: null, restAt: null })
          return
        }
        requestAnimationFrame(poll)
      }
      poll()
    })
  }, clickAt)
  const row = await waitReady(page, clickAt)
  await client.send('Tracing.end')
  await new Promise((resolve) => client.once('Tracing.tracingComplete', resolve))
  const after = await snapshotPrograms(page)
  out.f2Trace = {
    clickToRest: rest.clickToRest,
    maxFrameClickToRest:
      rest.restAt == null
        ? null
        : await page.evaluate(
            (t0, t1) => {
              const stamps = window.__twinRafStamps ?? []
              const slice = stamps.filter((item) => item.at >= t0 && item.at <= t1)
              if (!slice.length) return null
              return Math.round(Math.max(...slice.map((item) => item.dt)))
            },
            resetAt,
            rest.restAt,
          ),
    completeMs: row.ms,
    fadeMs: row.fadeMs,
    programsBefore: before.programs,
    programsAfter: after.programs,
    programsDelta: before.programs == null || after.programs == null ? null : after.programs - before.programs,
    shaders: await shadersSince(page, resetAt),
    tex: await snapshotTex(page),
    spaceDuringEntry: await page.evaluate((t0) => {
      const space = window.__twinGlyphPreload?.spaceCall
      if (!space) return null
      return space.at >= t0 ? space : null
    }, resetAt),
    timelineHits: events.slice(0, 40),
    timelineCompileLike: events.filter((event) => /compileShader|linkProgram|CompileShader|WebGL/i.test(event.name)).length,
  }
  await page.close()
}

{
  const page = await open()
  await waitGlyph(page)
  for (const floor of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']) {
    const resetAt = await page.evaluate(() => {
      const now = performance.now()
      if (Array.isArray(window.__twinRafStamps)) window.__twinRafStamps.length = 0
      window.__twinCameraMoveAt = undefined
      return now
    })
    const before = await snapshotPrograms(page)
    const clickAt = await enterFloor(page, floor)
    const row = await waitReady(page, clickAt)
    const after = await snapshotPrograms(page)
    row.floor = floor
    row.maxFrame = await page.evaluate((t0) => {
      const stamps = window.__twinRafStamps ?? []
      const slice = stamps.filter((item) => item.at >= t0)
      if (!slice.length) return null
      return Math.round(Math.max(...slice.map((item) => item.dt)))
    }, resetAt)
    row.programsBefore = before.programs
    row.programsAfter = after.programs
    row.programsDelta = before.programs == null || after.programs == null ? null : after.programs - before.programs
    row.shaders = await shadersSince(page, resetAt)
    row.spaceDuringEntry = await page.evaluate((t0) => {
      const space = window.__twinGlyphPreload?.spaceCall
      if (!space) return null
      return space.at >= t0 ? space : null
    }, resetAt)
    out.consecutive.push(row)
  }
  await page.close()
}

await mkdir('/opt/cursor/artifacts', { recursive: true })
await writeFile(`/opt/cursor/artifacts/t014-d269-${label}.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
await browser.close()
