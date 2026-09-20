/**
 * Contrôles de non-régression sur les moteurs de calcul.
 *
 * Ces vérifications portent sur la logique métier — géométrie, métré, réseaux,
 * toiture, niveaux — et non sur l'interface. Elles s'exécutent hors navigateur,
 * en quelques secondes : `npm test`.
 */

import {
  makeWall, detectRooms, outerContour, classifyWalls, rectanglePlan,
  setWallLength, dist, healDanglingEnds,
} from '../src/lib/geometry.js'
import {
  createEmptyPlan, createEmptyLevel, normalisePlan, levelPlan, levelElevation,
  computeSurfaces, computeBuildingSurfaces, computeEstimate,
} from '../src/lib/metre.js'
import { computePlumbing } from '../src/lib/plumbing.js'
import { computeElectrical, minimumEquipment } from '../src/lib/electrical.js'
import { buildScene, roofFaces, decomposeRectangles, roofApexHeight, uncoveredFootprint } from '../src/lib/render3d.js'
import { stairGeometry, checkStair } from '../src/lib/stairs.js'

let failures = 0
let total = 0
const section = (name) => console.log(`\n— ${name} —`)
const check = (name, actual, expected, tol = 0.05) => {
  total += 1
  const ok = typeof expected === 'number'
    ? Math.abs(actual - expected) <= Math.abs(expected * tol) + 0.02
    : actual === expected
  if (!ok) { failures += 1; console.log(`  ✗ ${name} : attendu ${expected}, obtenu ${actual}`) }
  else console.log(`  ✓ ${name}`)
}

/* ------------------------------------------------------------ géométrie */

section('Géométrie du plan')
{
  const walls = rectanglePlan(1000, 800, 20)
  const rooms = detectRooms(walls)
  check('un rectangle forme une pièce', rooms.length, 1)
  check('surface utile déduite des épaisseurs', rooms[0].area, 72.9, 0.03)

  const contour = outerContour(walls)
  check('emprise sur axes', contour.area, 76.44, 0.02)
  check('périmètre', contour.perimeter, 35.2, 0.02)

  // une cloison qui bute au milieu d'un mur doit créer un nœud
  const withPartition = [...walls, makeWall({ x: 500, y: 10 }, { x: 500, y: 790 }, { thickness: 7, kind: 'cloison' })]
  check('raccord en T détecté', detectRooms(withPartition).length, 2)
  const classified = classifyWalls(withPartition, detectRooms(withPartition))
  check('murs extérieurs distingués', classified.filter(w => w.exterior).length, 4)

  const stretched = setWallLength(walls, walls[0].id, 1200)
  check('allonger un mur garde le contour fermé', detectRooms(stretched).length, 1)
  check('nouvelle longueur appliquée', dist(stretched[0].a, stretched[0].b), 1200, 0.001)

  // une extrémité laissée en l'air se raccroche
  const dangling = [...walls, makeWall({ x: 500, y: 40 }, { x: 500, y: 760 }, { thickness: 7, kind: 'cloison' })]
  check('extrémités rattrapées', detectRooms(healDanglingEnds(dangling)).length, 2)

  // Les cloisons posées sur une coordonnée à cheval sur la demi-maille du
  // graphe (x/4 finissant par 0,5) ont longtemps été ignorées : l'arrondi
  // envoyait le point coupé et le point posé sur deux nœuds différents.
  const grid = [
    ...rectanglePlan(1900, 800, 20),
    makeWall({ x: 950, y: 10 }, { x: 950, y: 790 }, { thickness: 7, kind: 'cloison' }),
    makeWall({ x: 10, y: 430 }, { x: 950, y: 430 }, { thickness: 7, kind: 'cloison' }),
  ]
  check('cloisons à cheval sur la maille : 3 pièces', detectRooms(grid).length, 3)
  check('aire totale conservée', detectRooms(grid).reduce((t, r) => t + r.grossArea, 0), 147.25, 0.02)
}

/* ------------------------------------------------------------- toiture */

section('Toiture')
{
  const L = [
    { x: 0, y: 0 }, { x: 830, y: 0 }, { x: 830, y: 560 },
    { x: 390, y: 560 }, { x: 390, y: 720 }, { x: 0, y: 720 },
  ]
  const wallsOf = (pts) => pts.map((p, i) => makeWall(p, pts[(i + 1) % pts.length], { thickness: 20 }))

  check('une emprise en L donne deux corps', decomposeRectangles(L).length, 2)
  const R = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 800 }, { x: 0, y: 800 }]
  check('un rectangle reste un seul corps', decomposeRectangles(R).length, 1)

  const roof = { kind: '2pans', pitch: 35, overhang: 40 }
  const faces = roofFaces(wallsOf(L), roof, 250, L)
  check('des pans sont engendrés sur le L', faces.length > 0, true)
  check('aucun pan sous l\'égout', Math.min(...faces.flatMap(f => f.points.map(p => p[2]))) >= 233, true)
  check('faîtage plausible', roofApexHeight(L, roof) > 150 && roofApexHeight(L, roof) < 260, true)
  // rectangle : portée 8,00 + 2 × 0,40, faîtage = 4,40 × tan(35°)
  check('faîtage exact sur rectangle', roofApexHeight(R, roof), 440 * Math.tan(35 * Math.PI / 180))

  // Une aile de plain-pied doit garder son toit quand l'étage ne couvre que
  // l'autre branche du L. Le corps découpé était à cheval sur les deux, et
  // son centre tombant sous l'étage, l'aile perdait toute couverture.
  const etage = [{ x: 0, y: 0 }, { x: 830, y: 0 }, { x: 830, y: 560 }, { x: 0, y: 560 }]
  const basse = roofFaces(wallsOf(L), roof, 250, L, [etage])
  check('l\'aile de plain-pied garde sa toiture', basse.some(f => f.kind === 'toiture'), true)
  const couverts = basse.filter(f => f.kind === 'toiture').flatMap(f => f.points)
  check('aucun pan au-dessus de la partie déjà couverte',
    couverts.every(p => p[1] >= 560 - 1 || p[0] <= 390 + 41), true)
  check('emprise restant à couvrir', uncoveredFootprint(L, [etage]), 6.24, 0.02)
  check('rien à couvrir quand tout est surmonté', uncoveredFootprint(R, [R]), 0)
}

/* --------------------------------------------------------------- métré */

section('Métré et chiffrage')
{
  const plan = createEmptyPlan()
  plan.levels[0].walls = [
    ...rectanglePlan(1000, 800, 20),
    makeWall({ x: 500, y: 10 }, { x: 500, y: 790 }, { thickness: 7, kind: 'cloison' }),
  ]
  const s = computeSurfaces(levelPlan(plan, 0))
  check('surface habitable plausible', s.floorArea > 65 && s.floorArea < 78, true)
  check('toiture plus grande que l\'emprise', s.roofArea > s.footprint, true)

  const est = computeEstimate(plan)
  check('prix au m² réaliste', est.pricePerM2Pro > 1200 && est.pricePerM2Pro < 3500, true)
  check('aucune quantité négative', est.lines.every(l => l.qty > 0), true)
  check('aucune valeur non finie', est.lines.every(l => Number.isFinite(l.total)), true)
  check('aucune ligne en double', new Set(est.lines.map(l => l.itemId)).size, est.lines.length)

  const diy = computeEstimate({ ...plan, diyDefault: true })
  check('auto-construction moins chère', diy.total < est.totalPro, true)
  check('temps de travail cohérent', diy.totalHours > 200 && diy.totalHours < 4000, true)
}

/* ------------------------------------------------------------ plomberie */

section('Plomberie')
{
  const plan = createEmptyPlan()
  plan.levels[0].walls = [
    ...rectanglePlan(1000, 800, 20),
    makeWall({ x: 500, y: 10 }, { x: 500, y: 790 }, { thickness: 7, kind: 'cloison' }),
  ]
  plan.levels[0].equipment = [
    { id: 'e1', type: 'wc', point: { x: 150, y: 150 } },
    { id: 'e2', type: 'douche', point: { x: 150, y: 600 } },
    { id: 'e3', type: 'evier', point: { x: 800, y: 200 } },
  ]
  plan.plumbing = { slope: 2, exit: { x: 500, y: 790 } }

  const view = levelPlan(plan, 0)
  const net = computePlumbing(view, computeSurfaces(view))
  check('un tracé par appareil', net.routes.length, 3)
  check('collecteur en Ø100 quand il y a un WC', net.routes.find(r => r.trunk)?.diameter, 100)
  check('une réservation par appareil, plus la sortie', net.reservations.length, 4)
  check('cotes positives depuis l\'angle', net.reservations.every(r => r.x >= 0 && r.y >= 0), true)
  check('profondeur de sortie réaliste', net.depthAtExit > 25 && net.depthAtExit < 120, true)
  check('tracés strictement orthogonaux', net.routes.every(r => {
    for (let i = 0; i < r.points.length - 1; i++) {
      const a = r.points[i]; const b = r.points[i + 1]
      if (Math.abs(a.x - b.x) > 1 && Math.abs(a.y - b.y) > 1) return false
    }
    return true
  }), true)

  const steep = computePlumbing({ ...view, plumbing: { slope: 5, exit: plan.plumbing.exit } }, computeSurfaces(view))
  check('pente hors limites signalée', steep.warnings.some(w => w.level === 'error'), true)

  const est = computeEstimate(plan)
  check('métré fondé sur le tracé', est.lines.find(l => l.itemId === 'evacuation').detail.includes('Réseau tracé'), true)
}

/* ---------------------------------------------------------- électricité */

section('Électricité')
{
  check('séjour de 30 m² : une prise par tranche de 4 m²', minimumEquipment('sejour', 30).sockets, 8)
  check('séjour exigu : plancher à 5 prises', minimumEquipment('sejour', 12).sockets, 5)
  check('cuisine : 6 prises', minimumEquipment('cuisine', 12).sockets, 6)
  check('cuisine : 3 circuits spécialisés', minimumEquipment('cuisine', 12).special.length, 3)

  const plan = createEmptyPlan()
  plan.levels[0].walls = rectanglePlan(1000, 800, 20)
  const view0 = levelPlan(plan, 0)
  const empty = computeElectrical(view0, computeSurfaces(view0))
  check('installation vide : erreur sur les spécialisés', empty.warnings.some(w => w.level === 'error'), true)

  plan.levels[0].electrical = [
    { id: 't1', type: 'tableau', point: { x: 100, y: 700 } },
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`, type: 'prise', point: { x: 150 + (i % 4) * 200, y: 150 + Math.floor(i / 4) * 200 },
    })),
    { id: 'f1', type: 'four', point: { x: 300, y: 120 } },
    { id: 'lv1', type: 'lave-vaisselle', point: { x: 450, y: 120 } },
    { id: 'll1', type: 'lave-linge', point: { x: 600, y: 120 } },
  ]
  const view = levelPlan(plan, 0)
  const inst = computeElectrical(view, computeSurfaces(view))
  check('trois circuits spécialisés', inst.circuits.filter(c => c.kind === 'special').length, 3)
  check('plus d\'erreur bloquante', inst.warnings.some(w => w.level === 'error'), false)
  check('circuits prises scindés au-delà de huit points',
    inst.circuits.filter(c => c.kind === 'sockets').every(c => c.devices.length <= 8), true)
  check('différentiel type A imposé', inst.needsTypeA, true)
  check('gaines sans diagonale', inst.routes.every(r => {
    for (let i = 0; i < r.points.length - 1; i++) {
      const a = r.points[i]; const b = r.points[i + 1]
      if (Math.abs(a.x - b.x) > 1 && Math.abs(a.y - b.y) > 1) return false
    }
    return true
  }), true)
}

/* -------------------------------------------------------------- niveaux */

section('Étages, escaliers et sauvegarde du modèle')
{
  // Un plan d'avant les étages doit être repris sans perte
  const legacy = normalisePlan({
    walls: rectanglePlan(1000, 800, 20),
    roomMeta: [{ id: 'rm0', point: { x: 500, y: 400 }, type: 'sejour', name: 'Séjour' }],
    equipment: [{ id: 'e1', type: 'wc', point: { x: 200, y: 200 } }],
    ceilingHeight: 260,
  })
  check('migration : un niveau créé', legacy.levels.length, 1)
  check('migration : murs conservés', legacy.levels[0].walls.length, 4)
  check('migration : hauteur conservée', legacy.levels[0].ceilingHeight, 260)
  check('migration : équipements conservés', legacy.levels[0].equipment.length, 1)
  check('migration : racine nettoyée', legacy.walls, undefined)

  const plan = normalisePlan({
    ...createEmptyPlan(),
    levels: [
      { ...createEmptyLevel(0), walls: rectanglePlan(1000, 800, 20), ceilingHeight: 250 },
      { ...createEmptyLevel(1), walls: rectanglePlan(1000, 800, 20), ceilingHeight: 240 },
    ],
  })
  check('altitude de l\'étage', levelElevation(plan, 1), 275)

  const building = computeBuildingSurfaces(plan)
  check('surface habitable cumulée', building.floorArea > 140, true)
  check('emprise restée celle du rez-de-chaussée', building.footprint, 76.44)

  const est = computeEstimate(plan)
  check('plancher intermédiaire chiffré', !!est.lines.find(l => l.itemId === 'plancher-intermediaire'), true)
  check('murs des deux niveaux cumulés', est.lines.find(l => l.itemId === 'mur-parpaing').qty > 130, true)

  const scene = buildScene(plan, {})
  check('la maquette empile les niveaux',
    Math.max(...scene.faces.flatMap(f => f.points.map(p => p[2]))) > 500, true)
  const upper = buildScene(plan, { onlyLevel: 1 })
  check('un niveau isolé démarre à son altitude',
    Math.min(...upper.faces.filter(f => f.kind === 'mur').flatMap(f => f.points.map(p => p[2]))), 275)

  // Le plancher de l'étage doit s'ouvrir sur le vide sur séjour et sur la
  // trémie de l'escalier, sinon la volée bute contre la dalle.
  const perce = buildScene(plan, {
    onlyLevel: 1,
    levelRooms: [{}, { open: [[
      { x: 600, y: 10 }, { x: 990, y: 10 }, { x: 990, y: 790 }, { x: 600, y: 790 },
    ]] }],
  })
  const dalles = perce.faces.filter(f => f.kind === 'plancher')
  check('le plancher s\'arrête au vide sur séjour',
    Math.max(...dalles.flatMap(f => f.points.map(p => p[0]))), 600)

  const avecEscalier = buildScene({
    ...plan,
    stairs: [{ id: 's1', levelFrom: 0, point: { x: 200, y: 120 }, rotation: 90, width: 100, kind: 'droit' }],
  }, { onlyLevel: 1 })
  const planchers = avecEscalier.faces.filter(f => f.kind === 'plancher')
  check('la trémie perce le plancher', planchers.length > 6, true)
  check('aucune dalle au droit de la volée',
    planchers.every(f => {
      const xs = f.points.map(p => p[0])
      const ys = f.points.map(p => p[1])
      const horizontal = Math.abs(Math.max(...f.points.map(p => p[2])) - Math.min(...f.points.map(p => p[2]))) < 1
      if (!horizontal) return true
      return !(Math.min(...xs) < 200 && Math.max(...xs) > 200
        && Math.min(...ys) < 300 && Math.max(...ys) > 300)
    }), true)

  const geo = stairGeometry(275, 'droit', 90)
  check('hauteur de marche confortable', geo.riser >= 16 && geo.riser <= 19, true)
  check('somme de Blondel dans la plage', geo.blondel >= 60 && geo.blondel <= 65, true)
  check('la volée monte la bonne hauteur', geo.steps * geo.riser, 275)
  check('trémie plus courte que la volée', geo.wellLength < geo.straightRun, true)
  check('escalier correct sans erreur', checkStair(geo).some(i => i.level === 'error'), false)
  check('emmarchement étroit signalé',
    checkStair(stairGeometry(275, 'droit', 60)).some(i => i.text.includes('Emmarchement')), true)
}

console.log(
  failures === 0
    ? `\n✅ ${total} contrôles passent\n`
    : `\n❌ ${failures} contrôle(s) en échec sur ${total}\n`,
)
process.exit(failures ? 1 : 0)
