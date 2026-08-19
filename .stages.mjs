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
await new Promise(r => server.listen(4184, '127.0.0.1', r))
const URL = 'http://127.0.0.1:4184/'

const W = (id, ax, ay, bx, by, t = 20, kind = 'porteur') =>
  ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, thickness: t, kind })

const walls = [
  W('w1', 10, 10, 990, 10), W('w2', 990, 10, 990, 790),
  W('w3', 990, 790, 10, 790), W('w4', 10, 790, 10, 10),
  W('c1', 400, 10, 400, 790, 7, 'cloison'),
  W('c2', 700, 10, 700, 790, 7, 'cloison'),
]
const openings = [
  { id: 'o1', wallId: 'w1', offset: 200, width: 140, height: 115, sill: 95, kind: 'fenetre' },
  { id: 'o2', wallId: 'w1', offset: 550, width: 140, height: 115, sill: 95, kind: 'fenetre' },
  { id: 'o3', wallId: 'w1', offset: 850, width: 140, height: 115, sill: 95, kind: 'fenetre' },
  { id: 'o4', wallId: 'w3', offset: 300, width: 240, height: 215, sill: 0, kind: 'baie' },
  { id: 'o5', wallId: 'w3', offset: 700, width: 93, height: 215, sill: 0, kind: 'porte-entree' },
  { id: 'o6', wallId: 'w2', offset: 400, width: 140, height: 115, sill: 95, kind: 'fenetre' },
]

const project = {
  id: '1', name: 'Chantier', type: 'custom', address: '', totalBudget: 200000,
  startDate: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z',
  phases: [], budget: { total: 200000, lots: [], expenses: [] }, journal: [],
  plan: {
    walls, openings, roomMeta: [], ceilingHeight: 250, structure: 'parpaing',
    roof: { kind: '2pans', pitch: 35, overhang: 40 },
    foundation: { depth: 80, soubassement: 50, footingWidth: 50, footingHeight: 30 },
    slab: { thickness: 15, herisson: 20, insulation: 12 },
    options: { mode: 'neuf', heating: 'plancher', hotWater: 'thermodynamique', vmc: true, externalRender: true, assainissement: false, etudeSol: true, assuranceDO: true },
    equipment: [], electrical: [], diy: {}, diyDefault: true, priceLevel: 'typ', priceOverrides: {},
  },
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', e => errors.push(`PAGEERROR: ${e.message}`))

await page.addInitScript(s => localStorage.setItem('monchantier-state', JSON.stringify(s)),
  { projects: [project], activeProjectId: '1' })

await page.goto(`${URL}plan/3d`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)

await page.getByRole('button', { name: 'Rejouer' }).click()
await page.waitForTimeout(500)

const slider = page.locator('input[type="range"]')
const canvas = page.locator('canvas')

console.log('\n— Déroulé du chantier —')
const labels = []
for (let i = 0; i < 11; i++) {
  await slider.fill(String(i))
  await page.waitForTimeout(320)
  const banner = await page.locator('.absolute.top-2.left-2').textContent()
  const cost = await page.getByText("Coût de l'étape").isVisible().catch(() => false)
  const money = cost ? await page.locator('text=/Coût de l.étape/').locator('..').textContent() : '—'
  labels.push(banner.replace(/\s+/g, ' ').trim())
  console.log(`  ${String(i + 1).padStart(2)}. ${banner.replace(/Étape \d+ sur \d+/, '').replace(/\s+/g, ' ').trim().padEnd(26)} ${money.replace("Coût de l'étape", '').trim()}`)
  if ([0, 1, 3, 4, 6, 7, 10].includes(i)) {
    await canvas.screenshot({ path: `${OUT}/s${String(i).padStart(2, '0')}.png` })
  }
}

// La page complète sur une étape parlante
await slider.fill('6')
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/s-page.png`, fullPage: true })

console.log(errors.length ? '\nErreurs :\n' + errors.join('\n') : '\nAucune erreur JavaScript')
await browser.close()
server.close()
