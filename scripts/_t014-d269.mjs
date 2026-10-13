#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const label = process.argv[3] ?? 'head'
const fast = process.argv.includes('fast')
const puppeteer = require('puppeteer-core')

function log(...args) {
  console.log(...args)
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

async function open(search = '?q=perf&keepDrawingBuffer=1') {
  const page = await browser.newPage()
  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  await page.evaluateOnNewDocument(() => {
    const stamps = []
    let last = performance.now()
    const tick = () => {
      const now = performance.now()
      if (window.__twinRafSkipOnce) {
        window.__twinRafSkipOnce = false
        last = now
        requestAnimationFrame(tick)
        return
      }
      stamps.push({ at: now, dt: now - last })
      last = now
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    window.__twinRafStamps = stamps
    const wrap = (proto) => {
      if (!proto || proto.__qaShaderHook) return
      proto.__qaShaderHook = true
      const sources = new WeakMap()
      const attached = new WeakMap()
      const classify = (source) => {
        if (typeof source !== 'string') return { label: false, batched: false }
        const label = source.includes('uTroikaSDFTexture')
        return { label, batched: label && source.includes('uTroikaMatricesTexture') }
      }
      const origS = proto.shaderSource
      const origA = proto.attachShader
      const origC = proto.compileShader
      const origL = proto.linkProgram
      proto.shaderSource = function (shader, source) {
        sources.set(shader, source)
        return origS.call(this, shader, source)
      }
      proto.attachShader = function (program, shader) {
        const list = attached.get(program) ?? []
        list.push(shader)
        attached.set(program, list)
        return origA.call(this, program, shader)
      }
      proto.compileShader = function (shader) {
        const at = performance.now()
        const result = origC.call(this, shader)
        const kind = classify(sources.get(shader))
        ;(window.__qaShaders ??= []).push({
          kind: 'compileShader',
          at,
          ms: performance.now() - at,
          view: window.__twinView,
          floor: window.__twinSelected ?? null,
          label: kind.label,
          batched: kind.batched,
        })
        return result
      }
      proto.linkProgram = function (program) {
        const at = performance.now()
        const result = origL.call(this, program)
        const shaders = attached.get(program) ?? []
        let label = false
        let batched = false
        for (const shader of shaders) {
          const kind = classify(sources.get(shader))
          if (kind.label) label = true
          if (kind.batched) batched = true
        }
        ;(window.__qaShaders ??= []).push({
          kind: 'linkProgram',
          at,
          ms: performance.now() - at,
          view: window.__twinView,
          floor: window.__twinSelected ?? null,
          label,
          batched,
        })
        return result
      }
    }
    wrap(WebGLRenderingContext.prototype)
    if (typeof WebGL2RenderingContext !== 'undefined') wrap(WebGL2RenderingContext.prototype)
    const wrapBuffer = (proto) => {
      if (!proto || proto.__qaBufferHook) return
      proto.__qaBufferHook = true
      const orig = proto.bufferData
      proto.bufferData = function (target, data, usage) {
        const bytes = data && data.byteLength != null ? data.byteLength : 0
        ;(window.__qaBufferData ??= []).push({ at: performance.now(), bytes })
        return orig.call(this, target, data, usage)
      }
    }
    wrapBuffer(WebGLRenderingContext.prototype)
    if (typeof WebGL2RenderingContext !== 'undefined') wrapBuffer(WebGL2RenderingContext.prototype)
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
      if (window.__twinGlyphPreload == null && !find() && performance.now() - begin > 2_500) {
        return { ms: Math.round(performance.now() - t0), vis: 0, syncs: window.__twinLabelSyncs ?? 0, batch: false }
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

function programSnap(page) {
  return page.evaluate(() => {
    const programs = window.__twinRenderer?.info.programs ?? []
    return programs.map((program) => ({
      name: program.name ?? '',
      cacheKey: String(program.cacheKey ?? ''),
    }))
  })
}

function diffCache(before, after) {
  const prev = new Set(before.map((row) => row.cacheKey))
  return after
    .filter((row) => !prev.has(row.cacheKey))
    .map((row) => {
      const near = before.find((item) => item.name === row.name)
      if (!near) return { ...row, changed: ['new-name'] }
      const a = near.cacheKey.split(',')
      const b = row.cacheKey.split(',')
      const changed = []
      const n = Math.max(a.length, b.length)
      for (let i = 0; i < n; i += 1) {
        if (a[i] !== b[i]) changed.push(`${i}:${a[i] ?? ''}→${b[i] ?? ''}`)
      }
      return { name: row.name, cacheKey: row.cacheKey, changed }
    })
}

function setSizeSince(page, t0, t1) {
  return page.evaluate(
    (since, until) => {
      const rows = (window.__twinSetSize ?? []).filter((row) => row.at >= since && (until == null || row.at <= until))
      return {
        count: rows.length,
        rows: rows.map((row) => ({ at: Math.round(row.at), w: row.w, h: row.h, view: row.view, floor: row.floor })),
      }
    },
    t0,
    t1 ?? null,
  )
}

function setPixelRatioSince(page, t0, t1) {
  return page.evaluate(
    (since, until) => {
      const rows = (window.__twinSetPixelRatio ?? []).filter((row) => row.at >= since && (until == null || row.at <= until))
      return {
        count: rows.length,
        rows: rows.map((row) => ({ at: Math.round(row.at), value: row.value, view: row.view, floor: row.floor })),
      }
    },
    t0,
    t1 ?? null,
  )
}

function shadersSince(page, t0, t1) {
  return page.evaluate(
    (since, until) => {
      const rows = (window.__qaShaders ?? []).filter((row) => row.at >= since && (until == null || row.at <= until))
      const compile = rows.filter((row) => row.kind === 'compileShader')
      const link = rows.filter((row) => row.kind === 'linkProgram')
      const labelCompile = compile.filter((row) => row.label)
      const labelLink = link.filter((row) => row.label)
      return {
        compileShader: compile.length,
        linkProgram: link.length,
        labelCompile: labelCompile.length,
        labelLink: labelLink.length,
        batchedCompile: compile.filter((row) => row.batched).length,
        batchedLink: link.filter((row) => row.label && row.batched).length,
        rows: rows.slice(0, 32).map((row) => ({
          kind: row.kind,
          at: Math.round(row.at),
          ms: Math.round(row.ms),
          view: row.view,
          floor: row.floor,
          label: row.label,
          batched: row.batched,
        })),
      }
    },
    t0,
    t1 ?? null,
  )
}

async function waitGlyph(page) {
  const appeared = await page
    .waitForFunction(() => window.__twinGlyphPreload != null, { timeout: 8_000 })
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

async function waitRest(page, clickAt) {
  return page.evaluate((t0) => {
    return new Promise((resolve) => {
      const begin = performance.now()
      const poll = () => {
        const viewFloor = window.__twinView === 'floor'
        const hasProbe = typeof window.__twinCameraRested === 'boolean'
        const elapsed = performance.now() - begin
        const rested = hasProbe ? window.__twinCameraRested === true : elapsed >= 6_000
        if (viewFloor && rested) {
          resolve({
            clickToRest: Math.round(performance.now() - t0),
            restAt: performance.now(),
            synthetic: !hasProbe,
          })
          return
        }
        if (elapsed > 12_000) {
          resolve({
            clickToRest: viewFloor ? Math.round(performance.now() - t0) : null,
            restAt: viewFloor ? performance.now() : null,
            synthetic: !hasProbe,
          })
          return
        }
        requestAnimationFrame(poll)
      }
      poll()
    })
  }, clickAt)
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
      fontPrefetch: g?.fontPrefetch ?? null,
      woffs: performance.getEntriesByType('resource')
        .filter((entry) => /\.woff2?(\?|$)/i.test(entry.name))
        .map((entry) => ({
          name: entry.name.replace(location.origin, ''),
          startTime: Math.round(entry.startTime),
          duration: Math.round(entry.duration),
          transferSize: entry.transferSize,
          encodedBodySize: entry.encodedBodySize,
          decodedBodySize: entry.decodedBodySize,
          initiatorType: entry.initiatorType,
        })),
      upload: g?.upload ?? null,
      compile: g?.compile ?? null,
      interiorCompile: g?.interiorCompile ?? null,
      waitMs: Math.round(performance.now() - t0),
      programs: window.__twinMemory?.programs ?? null,
    }
  }, idleStart)
  out.idle.tex = await snapshotTex(page)
  out.idle.pauseCounts = await page.evaluate(() => {
    const g = window.__twinGlyphPreload
    return { paused: g?.paused ?? false, reason: g?.pauseReason ?? null, counts: g?.pauseCounts ?? null }
  })
  out.idle.d263 = await page.evaluate(() => {
    const first = window.__twinFirstFrameAt
    const stamps = window.__twinRafStamps ?? []
    const space = window.__twinGlyphPreload?.spaceCall
    const upload = window.__twinGlyphPreload?.upload
    const exempt = (row) => {
      if (space && Math.abs(row.at - space.at) <= (space.frameMs || 60) + 16) return true
      if (upload && Math.abs(row.at - upload.at) <= (upload.frameMs || 100) + 16) return true
      return false
    }
    const after = first == null ? [] : stamps.filter((row) => row.at >= first + 2000 && row.at !== first)
    const counted = after.filter((row) => !exempt(row))
    const list = counted.map((row) => Math.round(row.dt))
    return {
      firstFrameAt: first ?? null,
      count: list.length,
      max: list.length ? Math.max(...list) : null,
      ceilingMs: 33,
      spaceCall: space ?? null,
      upload: window.__twinGlyphPreload?.upload ?? null,
    }
  })
  await page.close()
}

if (!fast) for (const delay of [500, 1500, 3000]) {
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
    await page.waitForFunction(() => window.__twinInteriorPrewarm?.done === true, { timeout: 40_000 }).catch(() => {})
    const resetAt = await page.evaluate(() => {
      const now = performance.now()
      if (Array.isArray(window.__twinRafStamps)) window.__twinRafStamps.length = 0
      window.__twinRafSkipOnce = true
      window.__twinCameraMoveAt = undefined
      return now
    })
    const beforePrograms = await programSnap(page)
    await page.evaluate(() => {
      if (Array.isArray(window.__twinSetSize)) window.__twinSetSize.length = 0
    })
    const clickAt = await enterFloor(page, floor)
    const rest = await waitRest(page, clickAt)
    if (rest.restAt != null) await page.evaluate(() => new Promise((r) => setTimeout(r, 2000)))
    const row = fast
      ? { ms: rest.clickToRest, vis: null, syncs: 0, batch: false, fadeMs: null }
      : await waitReady(page, clickAt)
    const until = rest.restAt == null ? null : rest.restAt + 2000
    row.maxFrameClickToRest =
      rest.restAt == null
        ? null
        : await page.evaluate(
            (t0, t1) => {
              const stamps = window.__twinRafStamps ?? []
              const slice = stamps.filter((item) => item.at >= t0 && item.at <= t1 && item.dt < 1000)
              if (!slice.length) return null
              return Math.round(Math.max(...slice.map((item) => item.dt)))
            },
            resetAt,
            rest.restAt,
          )
    row.clickToRest = rest.clickToRest
    row.shaders = await shadersSince(page, clickAt, until)
    row.newPrograms = row.shaders.linkProgram
    row.setSize = await setSizeSince(page, clickAt, until)
    row.setPixelRatio = await setPixelRatioSince(page, clickAt, until)
    const afterPrograms = await programSnap(page)
    row.programDiff = diffCache(beforePrograms, afterPrograms)
    row.tex = await snapshotTex(page)
    row.spaceDuringEntry = await page.evaluate((t0) => {
      const space = window.__twinGlyphPreload?.spaceCall
      if (!space) return null
      return space.at >= t0 ? space : null
    }, resetAt)
    row.entryLong = await page.evaluate((t0) =>
      (window.__twinEntryFrames ?? []).filter((item) => item.at >= t0 && item.dt >= 48).slice(-16),
    resetAt)
    row.font = await page.evaluate(() => ({
      moveAt: window.__twinCameraMoveAt ?? null,
      startedAt: window.__twinFloorFontStartedAt ?? null,
      readyAt: window.__twinFloorFontReadyAt ?? null,
      chunks: window.__twinFloorFontChunks ?? null,
      unique: window.__twinGlyphPreload?.unique ?? null,
      done: window.__twinGlyphPreload?.done ?? null,
    }))
    row.framePhase = await page.evaluate((t0, t1) => {
      const stamps = (window.__twinRafStamps ?? []).filter((item) => item.at >= t0 && item.at <= t1 && item.dt < 1000)
      const longest = stamps.reduce((best, item) => (!best || item.dt > best.dt ? item : best), null)
      const readyAt = window.__twinFloorFontReadyAt ?? null
      const syncStartedAt = window.__twinLabelBatchSyncStartedAt ?? null
      const syncAt = window.__twinLabelBatchSyncAt ?? window.__twinLabelPhases?.syncStartAt ?? null
      const paintAt = window.__twinLabelPaintAt ?? window.__twinLabelReadyAt ?? null
      let phase = 'unknown'
      if (longest) {
        if (syncStartedAt != null && syncAt != null && longest.at >= syncStartedAt && longest.at < syncAt) phase = 'during-sync'
        else if (paintAt != null && longest.at >= paintAt) phase = 'after-paint'
        else if (syncStartedAt != null && longest.at < syncStartedAt) phase = readyAt == null ? 'before-sync-no-ReadyAt' : 'before-sync'
        else if (readyAt != null && longest.at < readyAt) phase = 'before-ReadyAt'
        else if (readyAt != null && longest.at >= readyAt) phase = 'after-ReadyAt-before-sync'
        else phase = 'before-sync-no-ReadyAt'
      }
      const buffers = (window.__qaBufferData ?? []).filter((item) => item.at >= t0 && item.at <= t1)
      const bufferBytes = buffers.reduce((sum, item) => sum + item.bytes, 0)
      return {
        longestAt: longest ? Math.round(longest.at) : null,
        longestDt: longest ? Math.round(longest.dt) : null,
        readyAt,
        syncAt,
        paintAt,
        syncStartedAt,
        phase,
        interior: window.__twinInteriorPrewarm?.mount ?? null,
        prewarmDone: window.__twinInteriorPrewarm?.done ?? false,
        restAt: t1,
        shadowAt: window.__twinShadowBake?.at ?? null,
        shadowReason: window.__twinShadowBake?.reason ?? null,
        shadowDeferred: window.__twinShadowBake?.deferred ?? null,
        shadowVsLongest:
          window.__twinShadowBake?.at != null && longest ? Math.round(window.__twinShadowBake.at - longest.at) : null,
        shellPlanes: window.__twinInteriorPrewarm?.shell?.planes ?? null,
        bufferCalls: buffers.length,
        bufferBytes,
        bufferMax: buffers.length ? Math.max(...buffers.map((item) => item.bytes)) : 0,
      }
    }, resetAt, rest.restAt ?? resetAt + 12_000)
    log(`${label} ${floor}#${i} link=${row.shaders?.linkProgram} label=${row.shaders?.labelCompile}/${row.shaders?.labelLink} setSize=${row.setSize?.count} dpr=${row.setPixelRatio?.count} maxFrame=${row.maxFrameClickToRest}`)
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
    medianLabelCompile: median(runs.map((row) => row.shaders?.labelCompile)),
    medianLabelLink: median(runs.map((row) => row.shaders?.labelLink)),
    medianCompile: median(runs.map((row) => row.shaders?.compileShader)),
    medianLink: median(runs.map((row) => row.shaders?.linkProgram)),
    maxCompile: maxOf(runs.map((row) => row.shaders?.compileShader)),
    maxLink: maxOf(runs.map((row) => row.shaders?.linkProgram)),
    medianSetSize: median(runs.map((row) => row.setSize?.count)),
    medianSetPixelRatio: median(runs.map((row) => row.setPixelRatio?.count)),
    programDiff: runs[0]?.programDiff ?? [],
  }
}

{
  const page = await open()
  await waitGlyph(page)
  const layoutOf = () =>
    page.evaluate(() => {
      const stage = document.querySelector('.stage')?.getBoundingClientRect()
      const canvas = document.querySelector('canvas')?.getBoundingClientRect()
      const panel = document.querySelector('.floor-panel')
      const detail = document.querySelector('.detail-panel')?.getBoundingClientRect()
      return {
        view: window.__twinView,
        panel: panel?.className ?? '',
        panelWidth: panel ? Math.round(panel.getBoundingClientRect().width) : null,
        stage: stage ? { w: Math.round(stage.width), h: Math.round(stage.height) } : null,
        canvas: canvas ? { w: Math.round(canvas.width), h: Math.round(canvas.height) } : null,
        detail: detail ? { w: Math.round(detail.width), h: Math.round(detail.height) } : null,
      }
    })
  const before = await layoutOf()
  await page.evaluate(() => {
    if (Array.isArray(window.__twinSetSize)) window.__twinSetSize.length = 0
    if (Array.isArray(window.__twinSetPixelRatio)) window.__twinSetPixelRatio.length = 0
  })
  const clickAt = await enterFloor(page, 'F2')
  await page.waitForFunction(() => window.__twinView === 'floor', { timeout: 20_000 })
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)))
  const afterEntry = {
    setSize: await setSizeSince(page, clickAt),
    setPixelRatio: await setPixelRatioSince(page, clickAt),
    layout: await layoutOf(),
  }
  const escAt = await page.evaluate(() => performance.now())
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => window.__twinView === 'building', { timeout: 15_000 })
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)))
  out.esc = {
    before,
    afterEntry,
    setSize: await setSizeSince(page, escAt),
    setPixelRatio: await setPixelRatioSince(page, escAt),
    panel: await page.evaluate(() => document.querySelector('.floor-panel')?.className ?? ''),
    afterEsc: await layoutOf(),
  }
  log(
    `${label} esc entry setSize=${afterEntry.setSize.count} dpr=${afterEntry.setPixelRatio.count} stage ${before.stage?.w}x${before.stage?.h} -> ${afterEntry.layout.stage?.w}x${afterEntry.layout.stage?.h}; esc setSize=${out.esc.setSize.count} dpr=${out.esc.setPixelRatio.count}`,
  )
  await page.close()
}

if (!fast) {
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
    window.__twinRafSkipOnce = true
    return performance.now()
  })
  const clickAt = await enterFloor(page, 'F2')
  const rest = await waitRest(page, clickAt)
  const row = fast
    ? { ms: rest.clickToRest, vis: null, syncs: 0, batch: false, fadeMs: null }
    : await waitReady(page, clickAt)
  await client.send('Tracing.end')
  await new Promise((resolve) => client.once('Tracing.tracingComplete', resolve))
  out.f2Trace = {
    clickToRest: rest.clickToRest,
    maxFrameClickToRest:
      rest.restAt == null
        ? null
        : await page.evaluate(
            (t0, t1) => {
              const stamps = window.__twinRafStamps ?? []
              const slice = stamps.filter((item) => item.at >= t0 && item.at <= t1 && item.dt < 1000)
              if (!slice.length) return null
              return Math.round(Math.max(...slice.map((item) => item.dt)))
            },
            resetAt,
            rest.restAt,
          ),
    completeMs: row.ms,
    fadeMs: row.fadeMs,
    shaders: await shadersSince(page, clickAt, rest.restAt),
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
      window.__twinRafSkipOnce = true
      window.__twinCameraMoveAt = undefined
      return now
    })
    const clickAt = await enterFloor(page, floor)
    const rest = await waitRest(page, clickAt)
    if (rest.restAt != null) await page.evaluate(() => new Promise((r) => setTimeout(r, 2000)))
    const row = fast
      ? { ms: rest.clickToRest, vis: null, syncs: 0, batch: false, fadeMs: null }
      : await waitReady(page, clickAt)
    row.floor = floor
    row.clickToRest = rest.clickToRest
    row.maxFrame = await page.evaluate((t0) => {
      const stamps = window.__twinRafStamps ?? []
      const slice = stamps.filter((item) => item.at >= t0 && item.dt < 1000)
      if (!slice.length) return null
      return Math.round(Math.max(...slice.map((item) => item.dt)))
    }, resetAt)
    row.shaders = await shadersSince(page, clickAt, rest.restAt == null ? null : rest.restAt + 2000)
    row.spaceDuringEntry = await page.evaluate((t0) => {
      const space = window.__twinGlyphPreload?.spaceCall
      if (!space) return null
      return space.at >= t0 ? space : null
    }, resetAt)
    log(`${label} consec ${floor} link=${row.shaders?.linkProgram} label=${row.shaders?.labelCompile}/${row.shaders?.labelLink}`)
    out.consecutive.push(row)
  }
  await page.close()
}

await mkdir('/opt/cursor/artifacts', { recursive: true })
await writeFile(`/opt/cursor/artifacts/t014-d269-${label}.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
await browser.close()
