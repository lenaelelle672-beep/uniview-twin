#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
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

const browser = await puppeteer.launch({
  executablePath: chromePath(),
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
})

async function open(search) {
  const page = await browser.newPage()
  const warnings = []
  const external = []
  page.on('console', (msg) => {
    const text = msg.text()
    if (text.includes('configureTextBuilder') || text.includes('jsdelivr') || text.includes('unicode-font')) {
      warnings.push({ type: msg.type(), text })
    }
  })
  page.on('request', (req) => {
    const url = req.url()
    if (!url.startsWith(baseUrl) && !url.startsWith('data:') && !url.startsWith('blob:')) external.push(url)
  })
  await page.setCacheEnabled(false)
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  await page.goto(`${baseUrl}/${search}`, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForFunction(() => window.__twinReady === true, { timeout: 90_000 })
  return { page, warnings, external }
}

async function waitLabels(page) {
  await page.waitForFunction(
    () =>
      window.__twinLabelOverlap &&
      window.__twinLabelReadyAt &&
      (window.__twinLabelSyncs ?? 0) >= 1 &&
      window.__twinLabelFading !== true &&
      (window.__twinLabelPhases?.packStep === 'idle' || (window.__twinLabelOverlap?.visible?.length ?? 0) > 0),
    { timeout: 45_000 },
  )
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)))
}

const out = { direct: {}, cells: {}, hover: null, sha: null }

{
  const { page } = await open('?q=balanced')
  out.sha = await page.evaluate(() => document.title)
  await page.close()
}

for (const floor of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']) {
  const { page, warnings, external } = await open(`?q=balanced&view=floor&floor=${floor}`)
  await page.waitForFunction((id) => window.__twinView === 'floor' && window.__twinSelected === id, { timeout: 45_000 }, floor).catch(() => {})
  await waitLabels(page).catch(() => {})
  const row = await page.evaluate(() => ({
    batch: Boolean(window.__twinLabelBatchPresent || window.__twinLabelReadyAt),
    mismatch: window.__twinLabelOverlap?.mismatch ?? null,
    overlap: window.__twinLabelOverlap?.overlapPairs ?? null,
    atlasHeight: window.__twinGlyphPreload?.atlasHeight ?? null,
  }))
  out.direct[floor] = { warnings, external, ...row }
  await page.close()
}

{
  const { page } = await open('?q=balanced')
  for (const width of [1024, 1366, 1920]) {
    await page.setViewport({ width, height: width === 1920 ? 1080 : 768, deviceScaleFactor: 1 })
    out.cells[width] = {}
    for (const floor of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']) {
      await page.evaluate((id) => window.__twinFocusDevice?.({ floor: id, deskId: null }), floor)
      await page.waitForFunction((id) => window.__twinView === 'floor' && window.__twinSelected === id, { timeout: 45_000 }, floor)
      await waitLabels(page)
      out.cells[width][floor] = await page.evaluate(() => ({
        mismatch: window.__twinLabelOverlap?.mismatch ?? null,
        overlap: window.__twinLabelOverlap?.overlapPairs ?? null,
        visible: window.__twinLabelOverlap?.visible?.length ?? 0,
        ids: window.__twinLabelOverlap?.mismatchIds ?? [],
      }))
      await page.evaluate(() => window.__twinSelectFloor?.(null))
      await page.evaluate(() => new Promise((r) => setTimeout(r, 200)))
    }
  }
  await page.close()
}

{
  const { page } = await open('?q=balanced')
  await page.evaluate(() => window.__twinFocusDevice?.({ floor: 'F3', deskId: null }))
  await page.waitForFunction(() => window.__twinView === 'floor' && window.__twinSelected === 'F3', { timeout: 45_000 })
  await waitLabels(page)
  const meetings = await page.evaluate(() => {
    const o = window.__twinLabelOverlap
    const hidden = (o?.hiddenAt ?? []).filter((row) => row.text === '会议室').map((row) => row.id)
    const all = (o?.visible ?? []).concat(o?.hiddenAt ?? [])
    const ids = [...new Set(all.filter((row) => row.text === '会议室').map((row) => row.id))]
    return { hidden, ids, hoverId: o?.hoverId ?? null }
  })
  const targets = []
  const hidden = meetings.hidden.filter((id) => /room-15[079]|room-157|room-159/.test(id))
  const pool = hidden.length >= 3 ? hidden : meetings.ids
  for (const id of pool.slice(0, 3)) {
    const hit = await page.evaluate((roomId) => {
      const item = (window.__twinLabelOverlap?.hiddenAt ?? []).find((row) => row.id === roomId)
      const vis = (window.__twinLabelOverlap?.visible ?? []).find((row) => row.id === roomId)
      const row = item ?? vis
      if (!row) return null
      const canvas = document.querySelector('canvas')
      const rect = canvas.getBoundingClientRect()
      return {
        id: roomId,
        x: rect.left + row.sx,
        y: rect.top + row.sy,
      }
    }, id)
    if (!hit) continue
    await page.mouse.move(hit.x, hit.y)
    await page.evaluate(() => new Promise((r) => setTimeout(r, 200)))
    const after = await page.evaluate((roomId) => {
      const o = window.__twinLabelOverlap
      const vis = (o?.visible ?? []).some((row) => row.id === roomId && (row.w ?? 0) > 1)
      return {
        hoverId: o?.hoverId ?? null,
        revealed: vis,
        overlap: o?.overlapPairs ?? null,
        mismatch: o?.mismatch ?? null,
      }
    }, id)
    targets.push({ id, ...after })
  }
  out.hover = { meetings, targets }
  await page.close()
}

await mkdir('/opt/cursor/artifacts', { recursive: true })
await writeFile('/opt/cursor/artifacts/t014-d268.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
await browser.close()
