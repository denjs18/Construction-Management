import { normalisePlan } from '../lib/metre'

/**
 * Modèles de maison prêts à charger.
 *
 * Partir d'une maison complète évite de tout dessiner : on ouvre le modèle le
 * plus proche du projet, puis on déplace les murs. Les cotes sont en
 * centimètres, mesurées sur l'axe des murs, l'axe des y vers le sud.
 */

let seq = 0
const uid = (p) => `${p}${(seq++).toString(36)}`

/*
 * Maison provençale en L, construction neuve.
 *
 *  - Grande aile (ouest-est) sur deux niveaux, dont un salon cathédrale
 *    ouvert sur toute la hauteur et surmonté d'une mezzanine à garde-corps.
 *  - Petite aile sur un seul niveau : suite parentale.
 *  - Sous-sol sous la jonction des deux ailes, rendu possible par la pente.
 *
 * Coordonnées en centimètres, axes des murs, y vers le sud.
 */

/** Murs d'un contour fermé */
const loop = (points, thickness = 20, kind = 'porteur') =>
  points.map((p, i) => ({
    id: uid('w'), a: p, b: points[(i + 1) % points.length], thickness, kind,
  }))

/** Un mur isolé, entre deux points */
const wall = (ax, ay, bx, by, thickness = 7, kind = 'cloison') =>
  ({ id: uid('w'), a: { x: ax, y: ay }, b: { x: bx, y: by }, thickness, kind })

const room = (x, y, type, name) => ({ id: uid('rm'), point: { x, y }, type, name })
const opening = (wallId, offset, kind, width, height, sill) =>
  ({ id: uid('o'), wallId, offset, width, height, sill, kind })

/* ------------------------------- sous-sol ------------------------------- */

const sousSolWalls = [
  ...loop([
    { x: 10, y: 10 }, { x: 740, y: 10 }, { x: 740, y: 840 }, { x: 10, y: 840 },
  ], 25),
  wall(450, 10, 450, 840, 20, 'porteur'),
  wall(450, 430, 740, 430),
]
const sousSol = {
  id: 'sous-sol', name: 'Sous-sol', kind: 'sous-sol', ceilingHeight: 240,
  walls: sousSolWalls,
  openings: [
    opening(sousSolWalls[0].id, 230, 'porte-garage', 250, 200, 0),
    opening(sousSolWalls[2].id, 150, 'fenetre', 100, 60, 170),
  ],
  roomMeta: [
    room(230, 420, 'garage', 'Garage'),
    room(595, 220, 'cave', 'Cave'),
    room(595, 640, 'technique', 'Local technique'),
  ],
  equipment: [], electrical: [],
}

/* ---------------------------- rez-de-chaussée ---------------------------- */

const rdcPerimeter = loop([
  { x: 10, y: 10 }, { x: 1490, y: 10 }, { x: 1490, y: 840 },
  { x: 740, y: 840 }, { x: 740, y: 1540 }, { x: 10, y: 1540 },
])
const [murNord, murEst, murSudAile, murEstPetite, murSudPetite, murOuest] = rdcPerimeter

const cloisonCuisine = wall(500, 10, 500, 840)
const murSalon = wall(950, 10, 950, 840, 20, 'porteur')
const cloisonEntree = wall(10, 430, 950, 430)
const cloisonWcX = wall(740, 620, 740, 840)
const cloisonWcY = wall(740, 620, 950, 620)
const cloisonSuite = wall(10, 840, 740, 840)
const cloisonChambre = wall(450, 840, 450, 1540)
const cloisonSdeau = wall(450, 1080, 740, 1080)
const cloisonDressing = wall(450, 1350, 740, 1350)

const rdc = {
  id: 'rdc', name: 'Rez-de-chaussée', ceilingHeight: 270,
  walls: [
    ...rdcPerimeter,
    cloisonCuisine, murSalon, cloisonEntree, cloisonWcX, cloisonWcY,
    cloisonSuite, cloisonChambre, cloisonSdeau, cloisonDressing,
  ],
  openings: [
    // façades
    opening(murNord.id, 720, 'porte-entree', 110, 220, 0),
    opening(murNord.id, 250, 'fenetre', 150, 130, 95),
    opening(murEst.id, 420, 'baie', 300, 230, 0),
    opening(murSudAile.id, 300, 'baie', 300, 230, 0),
    opening(murOuest.id, 905, 'fenetre', 120, 130, 95),
    opening(murOuest.id, 300, 'fenetre', 150, 130, 95),
    opening(murSudPetite.id, 400, 'baie', 260, 230, 0),
    opening(murEstPetite.id, 380, 'fenetre', 100, 110, 110),
    // portes intérieures
    opening(cloisonCuisine.id, 210, 'porte', 90, 210, 0),
    opening(cloisonCuisine.id, 625, 'porte', 83, 210, 0),
    opening(cloisonEntree.id, 710, 'porte', 90, 210, 0),
    opening(murSalon.id, 370, 'porte', 120, 220, 0),
    opening(cloisonWcX.id, 110, 'porte', 73, 210, 0),
    opening(cloisonSuite.id, 610, 'porte', 90, 210, 0),
    opening(cloisonChambre.id, 110, 'porte', 90, 210, 0),
    opening(cloisonSdeau.id, 145, 'porte', 83, 210, 0),
    opening(cloisonChambre.id, 610, 'porte', 83, 210, 0),
  ],
  roomMeta: [
    room(250, 220, 'cuisine', 'Cuisine'),
    room(250, 635, 'cellier', 'Cellier'),
    room(720, 220, 'entree', 'Entrée'),
    room(620, 530, 'couloir', 'Dégagement'),
    room(845, 730, 'wc', 'WC'),
    room(1220, 425, 'sejour', 'Salon cathédrale'),
    room(595, 960, 'couloir', 'Hall de la suite'),
    room(230, 1190, 'chambre', 'Chambre parentale'),
    room(595, 1215, 'sdb', "Salle d'eau"),
    room(595, 1445, 'dressing', 'Dressing'),
  ],
  equipment: [
    { id: uid('eq'), type: 'evier', point: { x: 250, y: 60 } },
    { id: uid('eq'), type: 'lave-vaisselle', point: { x: 380, y: 60 } },
    { id: uid('eq'), type: 'wc', point: { x: 850, y: 780 } },
    { id: uid('eq'), type: 'lave-linge', point: { x: 80, y: 780 } },
    { id: uid('eq'), type: 'chauffe-eau', point: { x: 430, y: 780 } },
    { id: uid('eq'), type: 'douche', point: { x: 680, y: 1140 } },
    { id: uid('eq'), type: 'lavabo', point: { x: 500, y: 1140 } },
  ],
  electrical: [
    { id: uid('el'), type: 'tableau', point: { x: 60, y: 500 } },
    { id: uid('el'), type: 'point-lumineux', point: { x: 250, y: 220 } },
    { id: uid('el'), type: 'point-lumineux', point: { x: 250, y: 635 } },
    { id: uid('el'), type: 'point-lumineux', point: { x: 720, y: 220 } },
    { id: uid('el'), type: 'point-lumineux', point: { x: 620, y: 530 } },
    { id: uid('el'), type: 'point-lumineux', point: { x: 845, y: 730 } },
    { id: uid('el'), type: 'point-lumineux', point: { x: 1120, y: 300 } },
    { id: uid('el'), type: 'point-lumineux', point: { x: 1320, y: 600 } },
    { id: uid('el'), type: 'point-lumineux', point: { x: 595, y: 960 } },
    { id: uid('el'), type: 'point-lumineux', point: { x: 230, y: 1190 } },
    { id: uid('el'), type: 'point-lumineux', point: { x: 595, y: 1215 } },
    { id: uid('el'), type: 'point-lumineux', point: { x: 595, y: 1445 } },
    { id: uid('el'), type: 'interrupteur', point: { x: 690, y: 120 } },
    { id: uid('el'), type: 'interrupteur', point: { x: 540, y: 250 } },
    { id: uid('el'), type: 'interrupteur', point: { x: 990, y: 120 } },
    { id: uid('el'), type: 'four', point: { x: 120, y: 60 } },
    { id: uid('el'), type: 'plaque', point: { x: 190, y: 60 } },
    { id: uid('el'), type: 'lave-linge', point: { x: 80, y: 780 } },
    { id: uid('el'), type: 'lave-vaisselle', point: { x: 380, y: 60 } },
  ],
}

/* --------------------------------- étage --------------------------------- */

const etagePerimeter = loop([
  { x: 10, y: 10 }, { x: 1490, y: 10 }, { x: 1490, y: 840 }, { x: 10, y: 840 },
])
const [etageNord, etageEst, etageSud, etageOuest] = etagePerimeter

const refendEtage = wall(620, 10, 620, 840, 20, 'porteur')
const gardeCorps = wall(950, 10, 950, 840, 10, 'garde-corps')
const couloirNord = wall(10, 380, 620, 380)
const couloirSud = wall(10, 500, 620, 500)
const cloisonCh1 = wall(320, 10, 320, 380)
const cloisonSdb = wall(260, 500, 260, 840)

const etage = {
  id: 'etage', name: 'Étage', ceilingHeight: 250,
  walls: [
    ...etagePerimeter,
    refendEtage, gardeCorps, couloirNord, couloirSud, cloisonCh1, cloisonSdb,
  ],
  openings: [
    opening(etageNord.id, 150, 'fenetre', 140, 130, 95),
    opening(etageNord.id, 450, 'fenetre', 140, 130, 95),
    opening(etageSud.id, 1030, 'fenetre', 140, 130, 95),
    opening(etageSud.id, 1330, 'fenetre', 120, 130, 95),
    opening(etageOuest.id, 180, 'fenetre', 100, 110, 110),
    opening(etageOuest.id, 560, 'fenetre', 100, 110, 110),
    opening(etageEst.id, 420, 'fenetre', 140, 130, 95),
    // portes
    opening(couloirNord.id, 150, 'porte', 83, 210, 0),
    opening(couloirNord.id, 460, 'porte', 83, 210, 0),
    opening(couloirSud.id, 130, 'porte', 83, 210, 0),
    opening(couloirSud.id, 430, 'porte', 83, 210, 0),
    opening(refendEtage.id, 430, 'porte', 90, 210, 0),
  ],
  roomMeta: [
    room(165, 195, 'chambre', 'Chambre 1'),
    room(470, 195, 'chambre', 'Chambre 2'),
    room(315, 440, 'couloir', 'Couloir'),
    room(135, 670, 'sdb', 'Salle de bain'),
    room(440, 670, 'chambre', 'Chambre 3'),
    room(785, 425, 'palier', 'Mezzanine'),
    room(1220, 425, 'vide', 'Vide sur salon'),
  ],
  equipment: [
    { id: uid('eq'), type: 'baignoire', point: { x: 100, y: 790 } },
    { id: uid('eq'), type: 'lavabo', point: { x: 230, y: 560 } },
    { id: uid('eq'), type: 'wc', point: { x: 100, y: 560 } },
  ],
  electrical: [
    { id: uid('el'), type: 'point-lumineux', point: { x: 165, y: 195 } },
    { id: uid('el'), type: 'point-lumineux', point: { x: 470, y: 195 } },
    { id: uid('el'), type: 'point-lumineux', point: { x: 315, y: 440 } },
    { id: uid('el'), type: 'point-lumineux', point: { x: 135, y: 670 } },
    { id: uid('el'), type: 'point-lumineux', point: { x: 440, y: 670 } },
    { id: uid('el'), type: 'point-lumineux', point: { x: 785, y: 425 } },
    { id: uid('el'), type: 'interrupteur', point: { x: 660, y: 440 } },
  ],
}

/* ---------------------------------- plan ---------------------------------- */

const plan = normalisePlan({
  levels: [sousSol, rdc, etage],
  groundLevel: 1,
  floorThickness: 25,
  structure: 'parpaing',
  roof: { kind: '4pans', pitch: 25, overhang: 50 },
  foundation: { depth: 80, soubassement: 40, footingWidth: 55, footingHeight: 35 },
  slab: { thickness: 16, herisson: 20, insulation: 12 },
  stairs: [{
    id: uid('st'), levelFrom: 1, point: { x: 870, y: 45 },
    rotation: 90, width: 100, kind: 'quart-tournant',
  }],
  options: {
    mode: 'neuf', heating: 'plancher', hotWater: 'thermodynamique', vmc: true,
    externalRender: true, assainissement: false, etudeSol: true, assuranceDO: true,
  },
  plumbing: { slope: 2, exit: { x: 740, y: 1540 } },
  diy: {}, diyDefault: false, priceLevel: 'typ', priceOverrides: {},
})

export const HOUSE_MODELS = [
  {
    id: 'provencale-l',
    label: 'Maison provençale en L',
    icon: '🏡',
    description: "235 m² habitables sur trois niveaux : salon cathédrale, mezzanine, suite de plain-pied et sous-sol.",
    build: () => structuredClone(plan),
  },
]
