#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const puppeteer = require('puppeteer-core')
const chrome =
  process.env.CHROME_PATH ??
  ['/usr/bin/google-chrome', '/usr/local/bin/google-chrome'].find((p) => {
    try {
      require('node:fs').accessSync(p)
      return true
    } catch {
      return false
    }
  })

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})

const runs = []
for (let i = 0; i < 3; i += 1) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
  await page.goto(`${baseUrl}/?q=perf`, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForFunction(() => window.__twinReady === true, { timeout: 90_000 })
  await page
    .waitForFunction(
      () =>
        typeof window.__twinGlyphPreload?.spaceCall?.atlasMs === 'number' &&
        typeof window.__twinGlyphPreload?.spaceCall?.parseMs === 'number',
      { timeout: 60_000 },
    )
    .catch(() => {})
  const row = await page.evaluate(() => {
    const s = window.__twinGlyphPreload?.spaceCall ?? null
    return {
      spaceCall: s,
      atlasHeight: window.__twinGlyphPreload?.atlasHeight ?? null,
      firstFrameAt: window.__twinFirstFrameAt ?? null,
      textRuntimeAt: window.__twinTextRuntimeAt ?? null,
    }
  })
  runs.push(row)
  console.log(
    `run${i} total=${row.spaceCall?.ms} atlasMs(a)=${row.spaceCall?.atlasMs} parseMs(b)=${row.spaceCall?.parseMs} fetchMs=${row.spaceCall?.fetchMs} canvasMs=${row.spaceCall?.canvasMs} sdfMs=${row.spaceCall?.sdfMs} compiles=${row.spaceCall?.compileCount} frameMs=${row.spaceCall?.frameMs}`,
  )
  await page.close()
}

const out = { baseUrl, runs }
await mkdir('/opt/cursor/artifacts', { recursive: true })
await writeFile('/opt/cursor/artifacts/t014-space-ab.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
await browser.close()
