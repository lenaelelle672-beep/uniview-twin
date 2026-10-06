#!/usr/bin/env node
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')

function chromePath() {
  return (
    process.env.CHROME_PATH ??
    ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((path) => {
      try {
        require('node:fs').accessSync(path)
        return true
      } catch {
        return null
      }
    })
  )
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  })
  const report = { floors: {}, failures: [] }
  for (const floorId of ['F4', 'F12', 'F22']) {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`${baseUrl}/?q=balanced&view=floor&floor=${floorId}`, { waitUntil: 'load', timeout: 90_000 })
    await page.waitForFunction(() => window.__twinReady === true, { timeout: 90_000 })
    await page.waitForFunction(
      (id) => window.__twinView === 'floor' && window.__twinSelected === id,
      { timeout: 45_000 },
      floorId,
    )
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1200)))
    const state = await page.evaluate(() => ({
      view: window.__twinView,
      selected: window.__twinSelected,
      desks: window.__twinInterior?.renderedDesks ?? 0,
      ready: window.__twinReady === true,
    }))
    report.floors[floorId] = { ...state, pageErrors: errors.slice(0, 6) }
    if (errors.length) report.failures.push(`${floorId} pageerror ${errors[0]}`)
    if (state.view !== 'floor' || state.selected !== floorId) report.failures.push(`${floorId} view ${state.view}/${state.selected}`)
    await page.close()
    console.error(`${floorId} desks=${state.desks} errors=${errors.length}`)
  }
  await browser.close()
  report.ok = report.failures.length === 0
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
