import { chromium } from 'playwright'

const OUT = '/tmp/claude-0/-home-user-Construction-Management/1bdb08e8-4f90-53d7-8903-22066ce040c0/scratchpad'
const URL = 'http://127.0.0.1:4173/Construction-Management/'

// Plan de test : maison 10 × 8 m, une cloison, 4 fenêtres et 2 portes
const W = (id, ax, ay, bx, by, thickness = 20, kind = 'porteur') =>
  ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, thickness, kind })

const walls = [
  W('w1', 10, 10, 990, 10),
  W('w2', 990, 10, 990, 790),
  W('w3', 990, 790, 10, 790),
  W('w4', 10, 790, 10, 10),
  W('w5', 500, 10, 500, 790, 7, 'cloison'),
]

const openings = [
  { id: 'o1', wallId: 'w1', offset: 200, width: 140, height: 115, sill: 95, kind: 'fenetre' },
  { id: 'o2', wallId: 'w1', offset: 700, width: 140, height: 115, sill: 95, kind: 'fenetre' },
  { id: 'o3', wallId: 'w3', offset: 300, width: 240, height: 215, sill: 0, kind: 'baie' },
  { id: 'o4', wallId: 'w3', offset: 750, width: 93, height: 215, sill: 0, kind: 'porte-entree' },
  { id: 'o5', wallId: 'w2', offset: 400, width: 120, height: 115, sill: 95, kind: 'fenetre' },
  { id: 'o6', wallId: 'w5', offset: 400, width: 83, height: 204, sill: 0, kind: 'porte' },
]

const project = {
  id: '1', name: 'Maison test', type: 'custom', address: '', totalBudget: 150000,
  startDate: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z',
  phases: [], budget: { total: 150000, lots: [], expenses: [] }, journal: [],
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
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(`CONSOLE: ${m.text()}`) })

await page.addInitScript(state => {
  localStorage.setItem('monchantier-state', JSON.stringify(state))
}, { projects: [project], activeProjectId: '1' })

const roofs = ['2pans', '4pans', 'monopente', 'plat']
for (const roof of roofs) {
  await page.addInitScript(({ state, roofKind }) => {
    const s = JSON.parse(localStorage.getItem('monchantier-state'))
    if (s) { s.projects[0].plan.roof.kind = roofKind; localStorage.setItem('monchantier-state', JSON.stringify(s)) }
  }, { state: null, roofKind: roof })
  await page.goto(`${URL}plan/3d`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/3d-${roof}.png` })
}

// Plan 2D avec les ouvertures
await page.goto(`${URL}plan`, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/2d-ouvertures.png`, fullPage: true })

// Vue 3D détaillée + orbite
await page.goto(`${URL}plan/3d`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
const canvas = await page.locator('canvas').boundingBox()
await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2)
await page.mouse.down()
await page.mouse.move(canvas.x + canvas.width / 2 + 90, canvas.y + canvas.height / 2 + 30, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/3d-orbite.png`, fullPage: true })

// Sans toiture
await page.getByLabel('Toiture').click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/3d-sans-toit.png` })

console.log(errors.length ? errors.join('\n') : 'Aucune erreur console')
await browser.close()
