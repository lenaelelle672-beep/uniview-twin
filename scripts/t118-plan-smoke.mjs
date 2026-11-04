/**
 * T118：平面图俯视冒烟。生产预览，swiftshader。
 * 用法：node scripts/t118-plan-smoke.mjs http://127.0.0.1:5190
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const puppeteer = require('puppeteer-core')
const base = (process.argv[2] ?? 'http://127.0.0.1:5190').replace(/\/$/, '')
const chrome =
  process.env.CHROME_PATH ??
  ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((path) => {
    try {
      require('node:fs').accessSync(path)
      return true
    } catch {
      return false
    }
  })

const errors = []

function track(page) {
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
}

async function read(page) {
  return page.evaluate(() => {
    const root = window.__twinScene?.__r3f?.root?.getState?.()
    const cam = root?.camera
    const rig = window.__twinRig
    return {
      plan: window.__twinFloorPlan ?? null,
      ortho: cam?.isOrthographicCamera === true,
      perspective: cam?.isPerspectiveCamera === true,
      rigPerspective: rig?.camera?.isPerspectiveCamera === true,
      sameCamera: rig?.camera === cam,
      y: cam?.position?.y ?? null,
      upZ: cam?.up?.z ?? null,
      zoom: cam?.zoom ?? null,
      enabled: rig?.enabled ?? null,
      paused: rig?.__twinPlanPaused === true,
      shadowAuto: root?.gl?.shadowMap?.autoUpdate === true,
      composer: window.__twinComposerLive === true,
      view: window.__twinView ?? null,
    }
  })
}

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
})

const page = await browser.newPage()
await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
track(page)

const report = {}

await page.goto(`${base}/?q=balanced`, { waitUntil: 'load', timeout: 90_000 })
await page.waitForFunction(() => window.__twinReady === true, { timeout: 60_000 })
await page.waitForFunction(() => window.__twinFloorPlan != null, { timeout: 20_000 })
report.overview = await read(page)

await page.goto(`${base}/?q=balanced&view=floor&floor=F12&floorPlan=1`, { waitUntil: 'load', timeout: 90_000 })
await page.waitForFunction(() => window.__twinReady === true, { timeout: 60_000 })
await page.waitForFunction(
  () => window.__twinFloorPlan?.mounted === true && window.__twinFloorPlan?.mode === 'ortho',
  { timeout: 40_000 },
)
await page.waitForFunction(() => {
  const cam = window.__twinScene?.__r3f?.root?.getState?.()?.camera
  return cam?.isOrthographicCamera === true && cam.position.y > 5
}, { timeout: 20_000 })
report.floorOn = await read(page)

await page.evaluate(() => window.__twinSetFloorPlan?.(false))
await page.waitForFunction(() => {
  const plan = window.__twinFloorPlan
  const cam = window.__twinScene?.__r3f?.root?.getState?.()?.camera
  return plan?.on === false && plan?.mounted === false && cam?.isPerspectiveCamera === true
}, { timeout: 20_000 })
report.floorOff = await read(page)

await page.evaluate(() => window.__twinSetFloorPlan?.(true))
await page.waitForFunction(
  () => window.__twinFloorPlan?.mounted === true && window.__twinScene?.__r3f?.root?.getState?.()?.camera?.isOrthographicCamera === true,
  { timeout: 20_000 },
)
report.floorAgain = await read(page)

await page.goto(`${base}/?q=balanced&view=building`, { waitUntil: 'load', timeout: 90_000 })
await page.waitForFunction(() => window.__twinReady === true && window.__twinFloorPlan != null, { timeout: 60_000 })
await page.evaluate(() => window.__twinSetFloorPlan?.(true))
await new Promise((resolve) => setTimeout(resolve, 800))
report.overviewToggle = await read(page)

report.errors = errors.filter((item) => !/WebGL|GL_INVALID|THREE\.WebGLRenderer/i.test(item))
report.ok =
  report.overview.perspective === true &&
  report.overview.ortho === false &&
  report.overview.plan?.on === false &&
  report.floorOn.ortho === true &&
  report.floorOn.rigPerspective === true &&
  report.floorOn.sameCamera === false &&
  report.floorOn.upZ === -1 &&
  report.floorOn.plan?.owner === 'camera-controls' &&
  report.floorOn.plan?.framing === 'floor-stage' &&
  report.floorOn.plan?.impl === 'drei-OrthographicCamera' &&
  report.floorOn.paused === true &&
  report.floorOn.shadowAuto === false &&
  report.floorOff.perspective === true &&
  report.floorOff.ortho === false &&
  report.floorOff.plan?.mounted === false &&
  report.floorOff.paused === false &&
  report.floorAgain.ortho === true &&
  report.overviewToggle.ortho === false &&
  report.overviewToggle.plan?.reason === 'off-view' &&
  report.errors.length === 0

console.log(JSON.stringify(report, null, 2))
await browser.close()
if (!report.ok) process.exit(1)
