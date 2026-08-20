/**
 * Moteur de rendu 3D minimal, écrit sur mesure pour la maquette de maison.
 *
 * La maquette reste volontairement au niveau de l'ouvrage : poteaux, chaînages,
 * fermes, dormants. Pas de briques ni de textures — le gain visuel ne
 * justifierait pas les centaines de milliers de facettes que cela coûterait sur
 * un téléphone.
 *
 * À cette échelle, un projecteur perspectif avec masquage des faces arrière et
 * tri par profondeur suffit largement, pour un coût nul en taille de bundle.
 *
 * Repère : x et y repris du plan (en cm), z vers le haut.
 */

import {
  dist, direction, normal as normal2d, outerContour, wallsBoundingBox, uniqueNodes,
} from './geometry'
import { BUILD_STAGES, STAGE_INDEX } from '../data/buildStages'
import { ITEM_BY_ID } from './electrical'

export { BUILD_STAGES, STAGE_INDEX }

/* ------------------------------------------------------------ matériaux */

export const MATERIALS = {
  mur: '#D8D2C6',
  murInterieur: '#E8E4DC',
  cloison: '#EDEBE5',
  pignon: '#D8D2C6',
  beton: '#B4B2AD',
  betonClair: '#C6C4BE',
  dalle: '#B9B4AC',
  terrain: '#C7D9B8',
  fouille: '#9B8468',
  toiture: '#9C4A32',
  toiturePlate: '#5B6169',
  bois: '#C8A268',
  boisClair: '#D9BC8E',
  vitrage: '#7FB3D5',
  dormant: '#F2F1EC',
  porte: '#8B5E3C',
  gaine: '#E0A422',
  evacuation: '#3F7FA6',
}

/* --------------------------------------------------- primitives de facettes */

/**
 * Une facette. `ref` est un point situé à l'intérieur du solide auquel elle
 * appartient : il permet d'orienter la normale vers l'extérieur sans dépendre
 * du sens d'enroulement, et donc de masquer les faces arrière de façon fiable.
 * `lod` vaut 1 pour les éléments fins, écartés pendant les manipulations.
 */
const face = (points, color, kind, stage, ref = null, lod = 0, outward = null) =>
  ({ points, color, kind, stage, ref, lod, outward })

/* ------------------------------------------------------- algèbre vectorielle */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

/**
 * Volume obtenu en extrudant un polygone de base entre deux altitudes.
 *
 * Les normales sortantes sont calculées exactement à partir du sens de parcours
 * du polygone, et non déduites d'un point supposé intérieur. C'est indispensable
 * dès que l'emprise n'est pas convexe : sur une maison en L, la moyenne des
 * sommets tombe dans le creux du L, donc à l'extérieur du volume, et le
 * masquage des faces arrière s'inversait — la dalle disparaissait.
 */
function box(basePolygon, z0, z1, color, kind, stage, lod = 0) {
  const n = basePolygon.length
  const bottom = basePolygon.map(p => [p.x, p.y, z0])
  const top = basePolygon.map(p => [p.x, p.y, z1])

  let shoelace = 0
  for (let i = 0; i < n; i++) {
    const p = basePolygon[i]
    const q = basePolygon[(i + 1) % n]
    shoelace += p.x * q.y - q.x * p.y
  }
  const counterClockwise = shoelace > 0

  const faces = [
    face(top, color, kind, stage, null, lod, [0, 0, 1]),
    face(bottom, color, kind, stage, null, lod, [0, 0, -1]),
  ]
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const ex = basePolygon[j].x - basePolygon[i].x
    const ey = basePolygon[j].y - basePolygon[i].y
    const outward = counterClockwise ? [ey, -ex, 0] : [-ey, ex, 0]
    faces.push(face(
      [bottom[i], bottom[j], top[j], top[i]],
      color, kind, stage, null, lod, outward,
    ))
  }
  return faces
}

/**
 * Barre prismatique entre deux points de l'espace.
 * `axis` porte la demi-dimension `half1`; la seconde demi-dimension `half2` est
 * portée par la perpendiculaire commune. Sert aux poteaux, chaînages, linteaux,
 * membrures de ferme, dormants et canalisations.
 */
function prism(p1, p2, half1, half2, axis, color, kind, stage, lod = 0) {
  const d = norm(sub(p2, p1))
  let a = norm(axis)
  if (Math.abs(dot(d, a)) > 0.99) a = norm([a[2], a[0], a[1]]) // axe dégénéré
  const n = norm(cross(d, a))
  const b = norm(cross(n, d))
  const corners = (p) => [
    add(add(p, mul(b, half1)), mul(n, half2)),
    add(sub(p, mul(b, half1)), mul(n, half2)),
    add(sub(p, mul(b, half1)), mul(n, -half2)),
    add(add(p, mul(b, half1)), mul(n, -half2)),
  ]
  const A = corners(p1)
  const B = corners(p2)
  const centre = mul(add(p1, p2), 0.5)
  const faces = [
    face(A, color, kind, stage, centre, lod),
    face(B, color, kind, stage, centre, lod),
  ]
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    faces.push(face([A[i], A[j], B[j], B[i]], color, kind, stage, centre, lod))
  }
  return faces
}

/** Bande rectangulaire suivant l'axe d'un mur, entre deux altitudes */
function wallBand(wall, z0, z1, halfWidth, color, kind, stage, lod = 0) {
  const n = normal2d(wall.a, wall.b)
  const quad = [
    { x: wall.a.x + n.x * halfWidth, y: wall.a.y + n.y * halfWidth },
    { x: wall.b.x + n.x * halfWidth, y: wall.b.y + n.y * halfWidth },
    { x: wall.b.x - n.x * halfWidth, y: wall.b.y - n.y * halfWidth },
    { x: wall.a.x - n.x * halfWidth, y: wall.a.y - n.y * halfWidth },
  ]
  return box(quad, z0, z1, color, kind, stage, lod)
}

/* ------------------------------------------------------------------ murs */

/**
 * Découpe un mur en tronçons pleins autour de ses ouvertures.
 * On obtient les trumeaux, les allèges sous les fenêtres et les linteaux
 * au-dessus des baies, sans avoir besoin de géométrie booléenne.
 */
export function wallSpans(wall, openings, height) {
  const len = dist(wall.a, wall.b)
  const own = openings
    .filter(o => o.wallId === wall.id)
    .map(o => ({
      start: Math.max(0, o.offset - o.width / 2),
      end: Math.min(len, o.offset + o.width / 2),
      sill: o.sill || 0,
      top: Math.min(height, (o.sill || 0) + o.height),
    }))
    .sort((a, b) => a.start - b.start)

  const spans = []
  let cursor = 0
  for (const o of own) {
    if (o.start > cursor) spans.push({ start: cursor, end: o.start, z0: 0, z1: height })
    if (o.sill > 0.5) spans.push({ start: o.start, end: o.end, z0: 0, z1: o.sill })
    if (o.top < height - 0.5) spans.push({ start: o.start, end: o.end, z0: o.top, z1: height })
    cursor = Math.max(cursor, o.end)
  }
  if (cursor < len) spans.push({ start: cursor, end: len, z0: 0, z1: height })
  return spans.filter(s => s.end - s.start > 0.5 && s.z1 - s.z0 > 0.5)
}

function wallFaces(wall, openings, height, exterior, stage) {
  const len = dist(wall.a, wall.b)
  if (len < 1) return []
  const d = direction(wall.a, wall.b)
  const n = normal2d(wall.a, wall.b)
  const half = wall.thickness / 2
  const color = exterior ? MATERIALS.mur : wall.kind === 'porteur' ? MATERIALS.murInterieur : MATERIALS.cloison

  const faces = []
  for (const span of wallSpans(wall, openings, height)) {
    const p0 = { x: wall.a.x + d.x * span.start, y: wall.a.y + d.y * span.start }
    const p1 = { x: wall.a.x + d.x * span.end, y: wall.a.y + d.y * span.end }
    const quad = [
      { x: p0.x + n.x * half, y: p0.y + n.y * half },
      { x: p1.x + n.x * half, y: p1.y + n.y * half },
      { x: p1.x - n.x * half, y: p1.y - n.y * half },
      { x: p0.x - n.x * half, y: p0.y - n.y * half },
    ]
    faces.push(...box(quad, span.z0, span.z1, color, 'mur', stage))
  }
  return faces
}

/* ------------------------------------------------------------- ouvertures */

/** Vitrage ou vantail, posé au nu intérieur du mur */
function glazingFaces(opening, wall) {
  const len = dist(wall.a, wall.b)
  if (len < 1) return []
  const d = direction(wall.a, wall.b)
  const start = Math.max(0, opening.offset - opening.width / 2)
  const end = Math.min(len, opening.offset + opening.width / 2)
  const z0 = opening.sill || 0
  const z1 = z0 + opening.height
  const isDoor = opening.kind === 'porte' || opening.kind === 'porte-entree' || opening.kind === 'porte-garage'
  const color = isDoor ? MATERIALS.porte : MATERIALS.vitrage
  const p0 = { x: wall.a.x + d.x * start, y: wall.a.y + d.y * start }
  const p1 = { x: wall.a.x + d.x * end, y: wall.a.y + d.y * end }
  return [face(
    [[p0.x, p0.y, z0], [p1.x, p1.y, z0], [p1.x, p1.y, z1], [p0.x, p0.y, z1]],
    color, 'ouverture', 'menuiseries', null, 0,
  )]
}

/** Dormant : le cadre qui ceinture l'ouverture dans l'épaisseur du mur */
function frameFaces(opening, wall) {
  const len = dist(wall.a, wall.b)
  if (len < 1) return []
  const d = direction(wall.a, wall.b)
  const start = Math.max(0, opening.offset - opening.width / 2)
  const end = Math.min(len, opening.offset + opening.width / 2)
  const z0 = opening.sill || 0
  const z1 = z0 + opening.height
  const at = (t, z) => [wall.a.x + d.x * t, wall.a.y + d.y * t, z]
  const section = 5
  const halfDepth = Math.max(4, wall.thickness / 2 - 1)
  const up = [0, 0, 1]
  const along = [d.x, d.y, 0]

  return [
    // montants
    ...prism(at(start, z0), at(start, z1), section, halfDepth, along, MATERIALS.dormant, 'dormant', 'menuiseries', 1),
    ...prism(at(end, z0), at(end, z1), section, halfDepth, along, MATERIALS.dormant, 'dormant', 'menuiseries', 1),
    // traverses haute et basse
    ...prism(at(start, z1), at(end, z1), section, halfDepth, up, MATERIALS.dormant, 'dormant', 'menuiseries', 1),
    ...prism(at(start, z0), at(end, z0), section, halfDepth, up, MATERIALS.dormant, 'dormant', 'menuiseries', 1),
  ]
}

/* ----------------------------------------------------- poteaux et chaînages */

/** Un poteau ne doit pas tomber au milieu d'une baie */
function clearOfOpenings(point, walls, openings) {
  for (const opening of openings) {
    const wall = walls.find(w => w.id === opening.wallId)
    if (!wall) continue
    const len = dist(wall.a, wall.b)
    if (len < 1) continue
    const d = direction(wall.a, wall.b)
    const t = (point.x - wall.a.x) * d.x + (point.y - wall.a.y) * d.y
    const lateral = Math.hypot(point.x - (wall.a.x + d.x * t), point.y - (wall.a.y + d.y * t))
    if (lateral > wall.thickness) continue
    if (Math.abs(t - opening.offset) < opening.width / 2 + 15) return false
  }
  return true
}

/**
 * Poteaux raidisseurs : à chaque angle du bâtiment, puis répartis sur les
 * longs murs. En maçonnerie ce sont les chaînages verticaux, en ossature bois
 * les montants d'angle.
 */
function columnFaces(walls, exteriorIds, openings, height, structure) {
  const exterior = walls.filter(w => exteriorIds.has(w.id))
  if (!exterior.length) return []

  const spacing = structure === 'ossature-bois' ? 300 : 400
  const positions = uniqueNodes(exterior).map(n => ({ x: n.x, y: n.y, corner: true }))

  for (const wall of exterior) {
    const len = dist(wall.a, wall.b)
    const count = Math.floor(len / spacing)
    const d = direction(wall.a, wall.b)
    for (let i = 1; i <= count; i++) {
      const t = (len * i) / (count + 1)
      const p = { x: wall.a.x + d.x * t, y: wall.a.y + d.y * t, corner: false }
      if (clearOfOpenings(p, walls, openings)) positions.push(p)
    }
  }

  const thickness = exterior[0].thickness
  const side = structure === 'ossature-bois' ? 12 : Math.max(18, thickness)
  const color = structure === 'ossature-bois' ? MATERIALS.bois : MATERIALS.beton

  const faces = []
  for (const p of positions) {
    faces.push(...prism(
      [p.x, p.y, 0], [p.x, p.y, height],
      side / 2, side / 2, [1, 0, 0],
      color, 'poteau', 'elevation', 1,
    ))
  }
  return faces
}

/** Ceinture en tête de mur, légèrement débordante pour rester lisible */
function ringBeamFaces(walls, structure, height) {
  const beamHeight = structure === 'ossature-bois' ? 12 : 20
  const color = structure === 'ossature-bois' ? MATERIALS.bois : MATERIALS.beton
  const faces = []
  for (const wall of walls) {
    if (dist(wall.a, wall.b) < 10) continue
    faces.push(...wallBand(
      wall, height - beamHeight, height, wall.thickness / 2 + 1.5,
      color, 'chainage', 'chainage', 1,
    ))
  }
  return faces
}

/** Linteau au-dessus d'une baie, avec ses appuis de part et d'autre */
function lintelFaces(openings, walls, structure, height) {
  const beamHeight = structure === 'ossature-bois' ? 12 : 20
  const color = structure === 'ossature-bois' ? MATERIALS.bois : MATERIALS.beton
  const faces = []

  for (const opening of openings) {
    const wall = walls.find(w => w.id === opening.wallId)
    if (!wall) continue
    const top = (opening.sill || 0) + opening.height
    // Sous le chaînage, le linteau se confond avec lui : inutile de le doubler
    if (top + beamHeight > height - beamHeight - 2) continue

    const len = dist(wall.a, wall.b)
    const d = direction(wall.a, wall.b)
    const bearing = 20
    const start = Math.max(0, opening.offset - opening.width / 2 - bearing)
    const end = Math.min(len, opening.offset + opening.width / 2 + bearing)
    faces.push(...prism(
      [wall.a.x + d.x * start, wall.a.y + d.y * start, top + beamHeight / 2],
      [wall.a.x + d.x * end, wall.a.y + d.y * end, top + beamHeight / 2],
      beamHeight / 2, wall.thickness / 2 + 1, [0, 0, 1],
      color, 'linteau', 'chainage', 1,
    ))
  }
  return faces
}

/* ------------------------------------------------------------- fondations */

function foundationFaces(walls, bearingIds, plan) {
  const fnd = plan.foundation || {}
  const slabThickness = plan.slab?.thickness || 15
  const soubassement = fnd.soubassement || 50
  const footingHeight = fnd.footingHeight || 30
  const footingWidth = fnd.footingWidth || 50

  const slabBottom = -slabThickness
  const footingTop = slabBottom - soubassement
  const footingBottom = footingTop - footingHeight

  const faces = []
  for (const wall of walls) {
    if (!bearingIds.has(wall.id)) continue
    if (dist(wall.a, wall.b) < 10) continue

    // semelle filante
    faces.push(...wallBand(
      wall, footingBottom, footingTop, footingWidth / 2,
      MATERIALS.beton, 'semelle', 'fouilles',
    ))
    // soubassement entre semelle et dalle
    faces.push(...wallBand(
      wall, footingTop, slabBottom, wall.thickness / 2,
      MATERIALS.betonClair, 'soubassement', 'soubassement',
    ))
  }
  return faces
}

/* -------------------------------------------------------------- charpente */

/**
 * Fermes industrielles simplifiées : entrait, arbalétriers, poinçon et fiches.
 * On garde six membrures par ferme, assez pour lire la structure sans faire
 * exploser le nombre de facettes.
 */
/**
 * Étendue du bâtiment en travers, à une position donnée le long du faîtage.
 * Renvoie null si la ligne ne traverse pas l'emprise.
 */
function crossExtent(points, run, alongX) {
  if (!points || points.length < 3) return null
  const hits = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const a1 = alongX ? a.x : a.y
    const b1 = alongX ? b.x : b.y
    if (Math.abs(b1 - a1) < 1e-6) continue
    if ((a1 - run) * (b1 - run) > 0) continue
    const t = (run - a1) / (b1 - a1)
    hits.push(alongX ? a.y + (b.y - a.y) * t : a.x + (b.x - a.x) * t)
  }
  if (hits.length < 2) return null
  return { min: Math.min(...hits), max: Math.max(...hits) }
}

/**
 * Fermes industrielles simplifiées : entrait, rampants, poinçon et fiches.
 *
 * Chaque ferme est découpée sur l'emprise réelle du bâtiment à sa position :
 * sur une maison en L, celles qui surplombent le creux sont raccourcies ou
 * supprimées au lieu de flotter dans le vide. Le faîtage reste horizontal,
 * comme sur un vrai toit.
 */
function trussFaces(walls, roof, height, contourPoints) {
  const bb = wallsBoundingBox(walls)
  if (!Number.isFinite(bb.minX)) return []
  if (roof?.kind === 'plat') return []

  const alongX = bb.width >= bb.height
  const span = alongX ? bb.height : bb.width
  const runFrom = alongX ? bb.minX : bb.minY
  const runTo = alongX ? bb.maxX : bb.maxY
  const runLength = runTo - runFrom
  const crossCentre = alongX ? (bb.minY + bb.maxY) / 2 : (bb.minX + bb.maxX) / 2

  const pitch = ((roof?.pitch ?? 35) * Math.PI) / 180
  const slope = Math.tan(pitch)
  const rise = (span / 2) * slope
  const ridgeZ = height + rise
  const zRoof = (u) => ridgeZ - Math.abs(u) * slope

  const MAX_TRUSSES = 34
  let count = Math.max(2, Math.round(runLength / 60) + 1)
  if (count > MAX_TRUSSES) count = MAX_TRUSSES
  const step = runLength / (count - 1)

  const sectionW = 4
  const sectionH = 10
  const faces = []
  let ridgeMin = null
  let ridgeMax = null

  for (let i = 0; i < count; i++) {
    const run = runFrom + step * i
    // On sonde légèrement en retrait aux extrémités, sinon la ligne rase le mur
    const probe = Math.min(Math.max(run, runFrom + 1), runTo - 1)
    const extent = crossExtent(contourPoints, probe, alongX)
    if (!extent) continue

    let left = extent.min - crossCentre
    let right = extent.max - crossCentre
    if (right - left < 100) continue // moins d'un mètre : rien à porter

    left = Math.max(left, -span / 2)
    right = Math.min(right, span / 2)

    const at = (u, z) => (alongX ? [run, crossCentre + u, z] : [crossCentre + u, run, z])
    const runAxis = alongX ? [1, 0, 0] : [0, 1, 0]
    const member = (u1, z1, u2, z2) => prism(
      at(u1, z1), at(u2, z2), sectionW / 2, sectionH / 2, runAxis,
      MATERIALS.bois, 'ferme', 'charpente', 1,
    )

    faces.push(...member(left, height, right, height))

    if (left < 0) faces.push(...member(left, zRoof(left), Math.min(right, 0), zRoof(Math.min(right, 0))))
    if (right > 0) faces.push(...member(Math.max(left, 0), zRoof(Math.max(left, 0)), right, zRoof(right)))

    const spansRidge = left < -1 && right > 1
    if (spansRidge) {
      faces.push(...member(0, height, 0, ridgeZ))
      faces.push(...member(left / 2, height, left / 2, zRoof(left / 2)))
      faces.push(...member(right / 2, height, right / 2, zRoof(right / 2)))
      if (ridgeMin === null || run < ridgeMin) ridgeMin = run
      if (ridgeMax === null || run > ridgeMax) ridgeMax = run
    }
  }

  // panne faîtière, limitée à la portion réellement surmontée d'un faîtage
  if (ridgeMin !== null && ridgeMax !== null && ridgeMax - ridgeMin > 10) {
    const a = alongX ? [ridgeMin, crossCentre, ridgeZ] : [crossCentre, ridgeMin, ridgeZ]
    const b = alongX ? [ridgeMax, crossCentre, ridgeZ] : [crossCentre, ridgeMax, ridgeZ]
    faces.push(...prism(a, b, 5, 7, [0, 0, 1], MATERIALS.boisClair, 'panne', 'charpente', 1))
  }

  return faces
}

/* ------------------------------------------------------------ toiture */

/**
 * Toiture construite sur le rectangle englobant, élargi du débord.
 *
 * Pour une emprise rectangulaire — le cas de très loin le plus fréquent — la
 * géométrie est exacte. Pour une maison en L, la toiture est une simplification
 * volontaire : elle donne le volume et la hauteur au faîtage sans prétendre
 * représenter les noues.
 */
export function roofFaces(walls, roof, eaveZ) {
  const bb = wallsBoundingBox(walls)
  if (!Number.isFinite(bb.minX)) return []
  const over = roof?.overhang || 0
  const x0 = bb.minX - over
  const x1 = bb.maxX + over
  const y0 = bb.minY - over
  const y1 = bb.maxY + over
  const w = x1 - x0
  const h = y1 - y0
  const pitch = ((roof?.pitch ?? 35) * Math.PI) / 180
  const alongX = w >= h
  const span = alongX ? h : w
  const ridgeZ = eaveZ + (span / 2) * Math.tan(pitch)
  const thickness = 18
  const stage = 'couverture'

  const kind = roof?.kind || '2pans'
  const color = kind === 'plat' ? MATERIALS.toiturePlate : MATERIALS.toiture

  if (kind === 'plat') {
    const quad = [
      { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 },
    ]
    return box(quad, eaveZ, eaveZ + 25, color, 'toiture', stage)
  }

  if (kind === 'monopente') {
    const zHigh = eaveZ + span * Math.tan(pitch)
    const pts = alongX
      ? [[x0, y0, eaveZ], [x1, y0, eaveZ], [x1, y1, zHigh], [x0, y1, zHigh]]
      : [[x0, y0, eaveZ], [x0, y1, eaveZ], [x1, y1, zHigh], [x1, y0, zHigh]]
    const faces = [face(pts, color, 'toiture', stage)]
    faces.push(face(pts.map(p => [p[0], p[1], p[2] - thickness]), shade(color, -0.2), 'toiture', stage))
    if (alongX) {
      faces.push(face([[x0, y0, eaveZ], [x0, y1, zHigh], [x0, y1, eaveZ]], MATERIALS.pignon, 'pignon', 'elevation'))
      faces.push(face([[x1, y0, eaveZ], [x1, y1, eaveZ], [x1, y1, zHigh]], MATERIALS.pignon, 'pignon', 'elevation'))
    }
    return faces
  }

  if (kind === '4pans') {
    const inset = span / 2
    const faces = []
    if (alongX) {
      const ym = (y0 + y1) / 2
      const rA = [x0 + inset, ym, ridgeZ]
      const rB = [x1 - inset, ym, ridgeZ]
      faces.push(face([[x0, y0, eaveZ], [x1, y0, eaveZ], rB, rA], color, 'toiture', stage))
      faces.push(face([[x1, y1, eaveZ], [x0, y1, eaveZ], rA, rB], color, 'toiture', stage))
      faces.push(face([[x0, y1, eaveZ], [x0, y0, eaveZ], rA], shade(color, -0.08), 'toiture', stage))
      faces.push(face([[x1, y0, eaveZ], [x1, y1, eaveZ], rB], shade(color, -0.08), 'toiture', stage))
    } else {
      const xm = (x0 + x1) / 2
      const rA = [xm, y0 + inset, ridgeZ]
      const rB = [xm, y1 - inset, ridgeZ]
      faces.push(face([[x0, y1, eaveZ], [x0, y0, eaveZ], rA, rB], color, 'toiture', stage))
      faces.push(face([[x1, y0, eaveZ], [x1, y1, eaveZ], rB, rA], color, 'toiture', stage))
      faces.push(face([[x0, y0, eaveZ], [x1, y0, eaveZ], rA], shade(color, -0.08), 'toiture', stage))
      faces.push(face([[x1, y1, eaveZ], [x0, y1, eaveZ], rB], shade(color, -0.08), 'toiture', stage))
    }
    return faces
  }

  // 2 pans
  const faces = []
  if (alongX) {
    const ym = (y0 + y1) / 2
    faces.push(face([[x0, y0, eaveZ], [x1, y0, eaveZ], [x1, ym, ridgeZ], [x0, ym, ridgeZ]], color, 'toiture', stage))
    faces.push(face([[x1, y1, eaveZ], [x0, y1, eaveZ], [x0, ym, ridgeZ], [x1, ym, ridgeZ]], shade(color, -0.12), 'toiture', stage))
    faces.push(face([[x0, y0, eaveZ], [x0, ym, ridgeZ], [x0, y1, eaveZ]], MATERIALS.pignon, 'pignon', 'elevation'))
    faces.push(face([[x1, y1, eaveZ], [x1, ym, ridgeZ], [x1, y0, eaveZ]], MATERIALS.pignon, 'pignon', 'elevation'))
  } else {
    const xm = (x0 + x1) / 2
    faces.push(face([[x0, y1, eaveZ], [x0, y0, eaveZ], [xm, y0, ridgeZ], [xm, y1, ridgeZ]], color, 'toiture', stage))
    faces.push(face([[x1, y0, eaveZ], [x1, y1, eaveZ], [xm, y1, ridgeZ], [xm, y0, ridgeZ]], shade(color, -0.12), 'toiture', stage))
    faces.push(face([[x0, y0, eaveZ], [xm, y0, ridgeZ], [x1, y0, eaveZ]], MATERIALS.pignon, 'pignon', 'elevation'))
    faces.push(face([[x1, y1, eaveZ], [xm, y1, ridgeZ], [x0, y1, eaveZ]], MATERIALS.pignon, 'pignon', 'elevation'))
  }
  return faces
}

/* -------------------------------------------------------------- réseaux */

/**
 * Gaines électriques et évacuations, telles qu'on les voit sur un chantier
 * avant fermeture : les gaines posées sur la dalle puis remontant dans les
 * murs, les évacuations enterrées sous le futur dallage.
 *
 * Les diamètres réels sont respectés dès qu'ils restent lisibles ; une gaine
 * ICTA Ø20 mesurée à l'échelle d'une maison serait invisible, elle est donc
 * tracée à un diamètre plancher.
 */
function networkFaces(networks, plan) {
  const faces = []
  const height = plan.ceilingHeight || 250
  const MIN_RADIUS = 3

  const elec = networks?.electrical
  if (elec) {
    for (const route of elec.routes) {
      const circuit = elec.circuits.find(c => c.id === route.circuitId)
      const overhead = circuit?.kind === 'lights'
      const level = overhead ? height - 8 : 3
      const radius = MIN_RADIUS

      for (let i = 0; i < route.points.length - 1; i++) {
        const a = route.points[i]
        const b = route.points[i + 1]
        if (dist(a, b) < 1) continue
        faces.push(...prism(
          [a.x, a.y, level], [b.x, b.y, level],
          radius, radius, [0, 0, 1],
          MATERIALS.gaine, 'gaine', 'reseaux', 1,
        ))
      }

      for (const device of circuit?.devices || []) {
        const spec = ITEM_BY_ID[device.type]
        if (!spec) continue
        const target = spec.layer === 'plafond' ? Math.min(height - 4, spec.height) : spec.height
        if (Math.abs(target - level) < 4) continue
        faces.push(...prism(
          [device.point.x, device.point.y, level],
          [device.point.x, device.point.y, target],
          radius, radius, [1, 0, 0],
          MATERIALS.gaine, 'gaine', 'reseaux', 1,
        ))
      }
    }
  }

  const plumbing = networks?.plumbing
  if (plumbing) {
    for (const route of plumbing.routes) {
      const item = plumbing.equipment.find(e => e.id === route.equipmentId)
      const startDepth = item?.spec?.startDepth || 25
      const endDepth = route.trunk ? plumbing.depthAtExit : startDepth
      const radius = Math.max(MIN_RADIUS, route.diameter / 20)
      const total = route.length || 1
      let travelled = 0

      for (let i = 0; i < route.points.length - 1; i++) {
        const a = route.points[i]
        const b = route.points[i + 1]
        const segment = dist(a, b)
        if (segment < 1) continue
        const z1 = -(startDepth + (endDepth - startDepth) * (travelled / total))
        travelled += segment
        const z2 = -(startDepth + (endDepth - startDepth) * (travelled / total))
        faces.push(...prism(
          [a.x, a.y, z1], [b.x, b.y, z2],
          radius, radius, [0, 0, 1],
          MATERIALS.evacuation, 'evacuation', 'reseaux', 1,
        ))
      }

      // remontée vers l'appareil sanitaire
      if (item) {
        faces.push(...prism(
          [item.point.x, item.point.y, -startDepth],
          [item.point.x, item.point.y, 6],
          radius, radius, [1, 0, 0],
          MATERIALS.evacuation, 'evacuation', 'reseaux', 1,
        ))
      }
    }
  }

  return faces
}

/* --------------------------------------------------------- construction */

/**
 * Assemble toutes les facettes de la maquette.
 *
 * @param {object} plan
 * @param {object} options
 *   exteriorWallIds : identifiants des murs extérieurs
 *   stage           : identifiant de phase, pour n'afficher que le déjà construit
 *   showRoof        : masquer la couverture pour voir l'intérieur
 *   exploded        : soulever la toiture
 *   structure       : true pour afficher poteaux, chaînages et fermes
 */
export function buildScene(plan, options = {}) {
  const walls = plan.walls || []
  const openings = plan.openings || []
  const height = plan.ceilingHeight || 250
  const structure = plan.structure || 'parpaing'
  const showStructure = options.structure !== false
  const faces = []

  if (!walls.length) return { faces, bbox: null, contour: null }

  const contour = outerContour(walls)
  const bb = wallsBoundingBox(walls)
  const exteriorIds = new Set(options.exteriorWallIds || walls.map(w => w.id))
  const bearingIds = new Set(walls.filter(w => exteriorIds.has(w.id) || w.kind === 'porteur').map(w => w.id))

  // Terrain
  const pad = 350
  faces.push(face([
    [bb.minX - pad, bb.minY - pad, -2], [bb.maxX + pad, bb.minY - pad, -2],
    [bb.maxX + pad, bb.maxY + pad, -2], [bb.minX - pad, bb.maxY + pad, -2],
  ], MATERIALS.terrain, 'terrain', 'terrain'))

  // Fondations et soubassement : visibles seulement tant qu'elles ne sont pas
  // enterrées. Au-delà du dallage, elles sont sous le terrain et les afficher
  // donnerait un socle fantôme, le tri par profondeur ne pouvant pas les
  // masquer derrière une facette de terrain aussi vaste.
  const stageLimit = options.stage ? STAGE_INDEX[options.stage] : null
  const foundationsVisible = stageLimit !== null && stageLimit !== undefined
    && stageLimit <= STAGE_INDEX.soubassement
  if (showStructure && foundationsVisible) {
    faces.push(...foundationFaces(walls, bearingIds, plan))
  }

  const showNetworks = !!options.showNetworks && !!options.networks

  // Dalle. En mode réseaux elle est retirée : les évacuations passent dessous
  // et le tri par profondeur les placerait derrière elle.
  if (contour.points.length >= 3 && !showNetworks) {
    const slabThickness = plan.slab?.thickness || 15
    faces.push(...box(
      contour.points.map(p => ({ x: p.x, y: p.y })),
      -slabThickness, 0, MATERIALS.dalle, 'dalle', 'dalle',
    ))
  }

  // Murs : les cloisons arrivent en fin de chantier, et restent absentes en
  // mode réseaux puisque les gaines les traversent avant leur fermeture.
  for (const wall of walls) {
    const exterior = exteriorIds.has(wall.id)
    const partition = !exterior && wall.kind !== 'porteur'
    if (partition && showNetworks) continue
    faces.push(...wallFaces(wall, openings, height, exterior, partition ? 'cloisons' : 'elevation'))
  }

  if (showNetworks) faces.push(...networkFaces(options.networks, plan))

  // Poteaux, chaînage et linteaux
  if (showStructure) {
    faces.push(...columnFaces(walls, exteriorIds, openings, height, structure))
    faces.push(...ringBeamFaces(walls.filter(w => bearingIds.has(w.id)), structure, height))
    faces.push(...lintelFaces(openings, walls, structure, height))
  }

  // Charpente : on la montre quand la couverture est retirée ou soulevée,
  // c'est-à-dire exactement quand on cherche à la voir.
  const lift = options.exploded ? 150 : 0
  const roofHidden = options.showRoof === false
  const stageActive = stageLimit !== null && stageLimit !== undefined
  const duringFraming = stageActive
    && stageLimit >= STAGE_INDEX.charpente
    && stageLimit < STAGE_INDEX.couverture
  if (showStructure && !showNetworks && (roofHidden || options.exploded || duringFraming)) {
    faces.push(...trussFaces(walls, plan.roof, height, contour.points))
  }

  // Couverture
  if (options.showRoof !== false) {
    faces.push(...roofFaces(walls, plan.roof, height + lift))
  }

  // Menuiseries
  for (const opening of openings) {
    const wall = walls.find(w => w.id === opening.wallId)
    if (!wall) continue
    faces.push(...glazingFaces(opening, wall))
    if (showStructure) faces.push(...frameFaces(opening, wall))
  }

  const visible = stageLimit === null || stageLimit === undefined
    ? faces
    : faces.filter(f => (STAGE_INDEX[f.stage] ?? 0) <= stageLimit)

  return { faces: visible, allFaces: faces, bbox: bb, contour }
}

/* ------------------------------------------------------------ caméra */

export function defaultCamera(bbox) {
  if (!bbox || !Number.isFinite(bbox.minX)) {
    return { azimuth: -0.9, elevation: 0.42, distance: 2000, target: [0, 0, 130] }
  }
  const cx = (bbox.minX + bbox.maxX) / 2
  const cy = (bbox.minY + bbox.maxY) / 2
  const size = Math.max(bbox.width, bbox.height, 400)
  return {
    azimuth: -0.9,
    elevation: 0.42,
    distance: size * 2.1,
    target: [cx, cy, 140],
  }
}

function cameraPosition(cam) {
  const { azimuth: a, elevation: e, distance: d, target: t } = cam
  return [
    t[0] + d * Math.cos(e) * Math.cos(a),
    t[1] + d * Math.cos(e) * Math.sin(a),
    t[2] + d * Math.sin(e),
  ]
}

/** Normale d'une facette par la méthode de Newell */
function faceNormal(points) {
  let nx = 0
  let ny = 0
  let nz = 0
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const q = points[(i + 1) % points.length]
    nx += (p[1] - q[1]) * (p[2] + q[2])
    ny += (p[2] - q[2]) * (p[0] + q[0])
    nz += (p[0] - q[0]) * (p[1] + q[1])
  }
  return norm([nx, ny, nz])
}

const LIGHT = norm([-0.45, -0.35, 0.82])

/**
 * Projette et trie les facettes, du plus lointain au plus proche.
 *
 * Les faces d'un solide dont la normale s'éloigne de l'observateur sont
 * écartées : sur une boîte, c'est la moitié du travail en moins. L'orientation
 * se déduit du point intérieur porté par la facette, sans dépendre du sens
 * d'enroulement des sommets.
 */
export function projectScene(faces, cam, width, height, options = {}) {
  const maxLod = options.maxLod ?? 1
  const eye = cameraPosition(cam)
  const forward = norm(sub(cam.target, eye))
  const right = norm(cross(forward, [0, 0, 1]))
  const up = cross(right, forward)
  const focal = Math.min(width, height) * 1.15
  const cx = width / 2
  const cy = height / 2

  const out = []
  let culled = 0

  for (const f of faces) {
    if (f.lod > maxLod) continue

    const centroid = [0, 0, 0]
    for (const p of f.points) {
      centroid[0] += p[0] / f.points.length
      centroid[1] += p[1] / f.points.length
      centroid[2] += p[2] / f.points.length
    }

    // Orientation extérieure : exacte si la facette la porte, sinon déduite
    // du point intérieur de son solide. Les surfaces simples n'en ont aucune
    // et ne sont jamais masquées.
    const n = faceNormal(f.points)
    let outward = n
    let closed = false
    if (f.outward) {
      outward = norm(f.outward)
      closed = true
    } else if (f.ref) {
      outward = dot(n, sub(centroid, f.ref)) < 0 ? mul(n, -1) : n
      closed = true
    }
    const toEye = sub(eye, centroid)

    if (closed && dot(outward, toEye) <= 0) { culled += 1; continue }

    const view = []
    let behind = false
    let depth = 0
    for (const p of f.points) {
      const rel = sub(p, eye)
      const vz = dot(rel, forward)
      if (vz <= 20) { behind = true; break }
      view.push([dot(rel, right), dot(rel, up), vz])
      depth += vz
    }
    if (behind || view.length < 3) continue

    const facing = dot(outward, norm(toEye)) < 0 ? mul(outward, -1) : outward
    const lambert = Math.max(0, dot(facing, LIGHT))
    const intensity = 0.55 + 0.45 * lambert

    out.push({
      screen: view.map(v => [cx + (v[0] / v[2]) * focal, cy - (v[1] / v[2]) * focal]),
      color: shade(f.color, intensity - 1),
      kind: f.kind,
      depth: depth / view.length,
    })
  }

  out.sort((a, b) => b.depth - a.depth)
  out.culled = culled
  return out
}

/** Peint la scène projetée sur un contexte canvas 2D */
export function drawScene(ctx, polygons, width, height, sky = '#DCE9F5') {
  ctx.clearRect(0, 0, width, height)
  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, sky)
  gradient.addColorStop(1, '#F3F7FA')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  ctx.lineWidth = 0.7
  ctx.strokeStyle = 'rgba(30,41,59,0.16)'

  for (const poly of polygons) {
    ctx.beginPath()
    ctx.moveTo(poly.screen[0][0], poly.screen[0][1])
    for (let i = 1; i < poly.screen.length; i++) ctx.lineTo(poly.screen[i][0], poly.screen[i][1])
    ctx.closePath()
    ctx.fillStyle = poly.color
    ctx.fill()
    if (poly.kind !== 'terrain') ctx.stroke()
  }
}

/* --------------------------------------------------------- utilitaires */

/** Éclaircit (amount > 0) ou assombrit (amount < 0) une couleur hexadécimale */
export function shade(hex, amount) {
  const value = hex.replace('#', '')
  const num = parseInt(value.length === 3 ? value.split('').map(c => c + c).join('') : value, 16)
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)))
  const r = clamp(((num >> 16) & 255) * (1 + amount))
  const g = clamp(((num >> 8) & 255) * (1 + amount))
  const b = clamp((num & 255) * (1 + amount))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/** Hauteur au faîtage, utile pour vérifier les règles d'urbanisme */
export function ridgeHeight(plan) {
  const bb = wallsBoundingBox(plan.walls || [])
  if (!Number.isFinite(bb.minX)) return 0
  const roof = plan.roof || {}
  if (roof.kind === 'plat') return (plan.ceilingHeight || 250) + 25
  const span = Math.min(bb.width, bb.height) + 2 * (roof.overhang || 0)
  const pitch = ((roof.pitch ?? 35) * Math.PI) / 180
  const extra = roof.kind === 'monopente'
    ? span * Math.tan(pitch)
    : (span / 2) * Math.tan(pitch)
  return (plan.ceilingHeight || 250) + extra
}
