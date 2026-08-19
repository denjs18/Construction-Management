import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

const OUT = '/tmp/claude-0/-home-user-Construction-Management/1bdb08e8-4f90-53d7-8903-22066ce040c0/scratchpad'
const DIST = '/home/user/Construction-Management/dist'
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

const server = createServer(async (req, res) => {
  const p = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]
  try {
    const body = await readFile(join(DIST, p))
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(await readFile(join(DIST, 'index.html')))
  }
})
await new Promise(r => server.listen(4183, '127.0.0.1', r))
const URL = 'http://127.0.0.1:4183/'

const W = (id, ax, ay, bx, by, t = 20, kind = 'porteur') =>
  ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, thickness: t, kind })

// Maison type : 10 × 8 m, 3 cloisons, 10 ouvertures
const walls = [
  W('w1', 10, 10, 990, 10), W('w2', 990, 10, 990, 790),
  W('w3', 990, 790, 10, 790), W('w4', 10, 790, 10, 10),
  W('c1', 260, 10, 260, 790, 7, 'cloison'),
  W('c2', 520, 10, 520, 790, 7, 'cloison'),
  W('c3', 760, 10, 760, 790, 7, 'cloison'),
]
const openings = [
  { id: 'o1', wallId: 'w1', offset: 150, width: 140, height: 115, sill: 95, kind: 'fenetre' },
  { id: 'o2', wallId: 'w1', offset: 400, width: 140, height: 115, sill: 95, kind: 'fenetre' },
  { id: 'o3', wallId: 'w1', offset: 650, width: 140, height: 115, sill: 95, kind: 'fenetre' },
  { id: 'o4', wallId: 'w1', offset: 870, width: 140, height: 115, sill: 95, kind: 'fenetre' },
  { id: 'o5', wallId: 'w2', offset: 200, width: 140, height: 115, sill: 95, kind: 'fenetre' },
  { id: 'o6', wallId: 'w2', offset: 550, width: 240, height: 215, sill: 0, kind: 'baie' },
  { id: 'o7', wallId: 'w3', offset: 250, width: 93, height: 215, sill: 0, kind: 'porte-entree' },
  { id: 'o8', wallId: 'w3', offset: 600, width: 140, height: 115, sill: 95, kind: 'fenetre' },
  { id: 'o9', wallId: 'w4', offset: 250, width: 140, height: 115, sill: 95, kind: 'fenetre' },
  { id: 'o10', wallId: 'w4', offset: 550, width: 140, height: 115, sill: 95, kind: 'fenetre' },
]

const project = {
  id: '1', name: 'Bench', type: 'custom', address: '', totalBudget: 200000,
  startDate: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z',
  phases: [], budget: { total: 200000, lots: [], expenses: [] }, journal: [],
  plan: {
    walls, openings, roomMeta: [], ceilingHeight: 250, structure: 'parpaing',
    roof: { kind: '2pans', pitch: 35, overhang: 40 },
    foundation: { depth: 80, soubassement: 50, footingWidth: 50, footingHeight: 30 },
    slab: { thickness: 15, herisson: 20, insulation: 12 },
    options: { mode: 'neuf', heating: 'plancher', hotWater: 'thermodynamique', vmc: true, externalRender: true, assainissement: false, etudeSol: true, assuranceDO: true },
    equipment: [], electrical: [], diy: {}, diyDefault: false, priceLevel: 'typ', priceOverrides: {},
  },
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', e => errors.push(`PAGEERROR: ${e.message}`))

await page.addInitScript(s => localStorage.setItem('monchantier-state', JSON.stringify(s)),
  { projects: [project], activeProjectId: '1' })

await page.goto(`${URL}plan/3d`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/b1-structure.png` })

const canvas = await page.locator('canvas').boundingBox()
const cx = canvas.x + canvas.width / 2
const cy = canvas.y + canvas.height / 2

/* ---- Coût d'une image pendant une manipulation ---- */
const MOVES = 60
await page.mouse.move(cx, cy)
await page.mouse.down()
const tDrag = Date.now()
for (let i = 0; i < MOVES; i++) {
  await page.mouse.move(cx + Math.sin(i / 6) * 110, cy + Math.cos(i / 9) * 45)
}
const dragMs = (Date.now() - tDrag) / MOVES
await page.mouse.up()
await page.waitForTimeout(400)

/* ---- Coût d'une image au repos, détail complet ---- */
const ZOOMS = 30
const tZoom = Date.now()
for (let i = 0; i < ZOOMS; i++) {
  await page.mouse.wheel(0, i % 2 === 0 ? 40 : -40)
}
const zoomMs = (Date.now() - tZoom) / ZOOMS

console.log('\n— Coût réel par image, écran 390 × 420 ——————————————')
console.log(`  pendant une rotation .... ${dragMs.toFixed(1)} ms/image  (~${Math.round(1000 / dragMs)} images/s)`)
console.log(`  au repos, détail complet  ${zoomMs.toFixed(1)} ms/image  (~${Math.round(1000 / zoomMs)} images/s)`)
console.log('  (inclut le pilotage Playwright et React, donc majoré par rapport à un doigt réel)')

/* ---- Rendu sans toiture, pour voir la charpente ---- */
await page.getByLabel('Toiture').click()
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/b2-charpente.png` })
await page.getByLabel('Toiture').click()
await page.waitForTimeout(300)

/* ---- Vue rapprochée sur un angle ---- */
await page.mouse.wheel(0, -420)
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/b3-detail-angle.png` })

console.log(errors.length ? '\nErreurs :\n' + errors.join('\n') : '\nAucune erreur JavaScript')
await browser.close()
server.close()
