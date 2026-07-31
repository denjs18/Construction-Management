/**
 * Moteur de rendu 3D minimal, écrit sur mesure pour la maquette de maison.
 *
 * La géométrie se réduit à des boîtes extrudées et à quelques pans de toiture :
 * une centaine de facettes au total. Un projecteur perspectif avec tri par
 * profondeur (algorithme du peintre) et éclairage plat suffit largement, pour
 * un coût nul en taille de bundle et un affichage immédiat sur mobile.
 *
 * Repère : x et y repris du plan (en cm), z vers le haut.
 */

import { dist, direction, normal as normal2d, outerContour, wallsBoundingBox } from './geometry'

/* ------------------------------------------------------------ couleurs */

export const MATERIALS = {
  mur: '#D8D2C6',
  murInterieur: '#E8E4DC',
  pignon: '#D8D2C6',
  dalle: '#B9B4AC',
  terrain: '#C7D9B8',
  toiture: '#9C4A32',
  toiturePlate: '#5B6169',
  vitrage: '#7FB3D5',
  porte: '#8B5E3C',
  fondation: '#9A9A9A',
}

/* ------------------------------------------------------- petites facettes */

const face = (points, color, kind) => ({ points, color, kind })

/** Boîte définie par un quadrilatère de base (ordre constant) et deux altitudes */
function box(baseQuad, z0, z1, color, kind) {
  const bottom = baseQuad.map(p => [p.x, p.y, z0])
  const top = baseQuad.map(p => [p.x, p.y, z1])
  const faces = [face(top, color, kind), face([...bottom].reverse(), color, kind)]
  for (let i = 0; i < baseQuad.length; i++) {
    const j = (i + 1) % baseQuad.length
    faces.push(face([bottom[i], bottom[j], top[j], top[i]], color, kind))
  }
  return faces
}

/* ------------------------------------------------------------ murs */

/**
 * Découpe un mur en tronçons pleins autour de ses ouvertures.
 * On obtient les trumeaux (pleins sur toute la hauteur), les allèges sous les
 * fenêtres et les linteaux au-dessus des baies, sans avoir besoin de faire de
 * la géométrie booléenne.
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

function wallFaces(wall, openings, height, exterior) {
  const len = dist(wall.a, wall.b)
  if (len < 1) return []
  const d = direction(wall.a, wall.b)
  const n = normal2d(wall.a, wall.b)
  const half = wall.thickness / 2
  const color = exterior ? MATERIALS.mur : MATERIALS.murInterieur

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
    faces.push(...box(quad, span.z0, span.z1, color, 'mur'))
  }
  return faces
}

/** Panneau vitré ou vantail de porte, posé au nu intérieur du mur */
function openingFaces(opening, wall) {
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
  return [face([
    [p0.x, p0.y, z0], [p1.x, p1.y, z0], [p1.x, p1.y, z1], [p0.x, p0.y, z1],
  ], color, 'ouverture')]
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
  const alongX = w >= h // le faîtage suit le plus grand côté
  const span = alongX ? h : w
  const ridgeZ = eaveZ + (span / 2) * Math.tan(pitch)
  const thickness = 18 // épaisseur apparente de la couverture

  const kind = roof?.kind || '2pans'
  const color = kind === 'plat' ? MATERIALS.toiturePlate : MATERIALS.toiture

  if (kind === 'plat') {
    const quad = [
      { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 },
    ]
    return box(quad, eaveZ, eaveZ + 25, color, 'toiture')
  }

  if (kind === 'monopente') {
    const zHigh = eaveZ + span * Math.tan(pitch)
    const pts = alongX
      ? [[x0, y0, eaveZ], [x1, y0, eaveZ], [x1, y1, zHigh], [x0, y1, zHigh]]
      : [[x0, y0, eaveZ], [x0, y1, eaveZ], [x1, y1, zHigh], [x1, y0, zHigh]]
    const faces = [face(pts, color, 'toiture')]
    faces.push(face(pts.map(p => [p[0], p[1], p[2] - thickness]).reverse(), shade(color, -0.2), 'toiture'))
    // pignons sous la pente
    if (alongX) {
      faces.push(face([[x0, y0, eaveZ], [x0, y1, zHigh], [x0, y1, eaveZ]], MATERIALS.pignon, 'pignon'))
      faces.push(face([[x1, y0, eaveZ], [x1, y1, eaveZ], [x1, y1, zHigh]], MATERIALS.pignon, 'pignon'))
    }
    return faces
  }

  if (kind === '4pans') {
    // croupe : le faîtage est raccourci de la demi-portée à chaque extrémité
    const inset = span / 2
    const faces = []
    if (alongX) {
      const ym = (y0 + y1) / 2
      const rA = [x0 + inset, ym, ridgeZ]
      const rB = [x1 - inset, ym, ridgeZ]
      faces.push(face([[x0, y0, eaveZ], [x1, y0, eaveZ], rB, rA], color, 'toiture'))
      faces.push(face([[x1, y1, eaveZ], [x0, y1, eaveZ], rA, rB], color, 'toiture'))
      faces.push(face([[x0, y1, eaveZ], [x0, y0, eaveZ], rA], shade(color, -0.08), 'toiture'))
      faces.push(face([[x1, y0, eaveZ], [x1, y1, eaveZ], rB], shade(color, -0.08), 'toiture'))
    } else {
      const xm = (x0 + x1) / 2
      const rA = [xm, y0 + inset, ridgeZ]
      const rB = [xm, y1 - inset, ridgeZ]
      faces.push(face([[x0, y1, eaveZ], [x0, y0, eaveZ], rA, rB], color, 'toiture'))
      faces.push(face([[x1, y0, eaveZ], [x1, y1, eaveZ], rB, rA], color, 'toiture'))
      faces.push(face([[x0, y0, eaveZ], [x1, y0, eaveZ], rA], shade(color, -0.08), 'toiture'))
      faces.push(face([[x1, y1, eaveZ], [x0, y1, eaveZ], rB], shade(color, -0.08), 'toiture'))
    }
    return faces
  }

  // 2 pans
  const faces = []
  if (alongX) {
    const ym = (y0 + y1) / 2
    faces.push(face([[x0, y0, eaveZ], [x1, y0, eaveZ], [x1, ym, ridgeZ], [x0, ym, ridgeZ]], color, 'toiture'))
    faces.push(face([[x1, y1, eaveZ], [x0, y1, eaveZ], [x0, ym, ridgeZ], [x1, ym, ridgeZ]], shade(color, -0.12), 'toiture'))
    faces.push(face([[x0, y0, eaveZ], [x0, ym, ridgeZ], [x0, y1, eaveZ]], MATERIALS.pignon, 'pignon'))
    faces.push(face([[x1, y1, eaveZ], [x1, ym, ridgeZ], [x1, y0, eaveZ]], MATERIALS.pignon, 'pignon'))
  } else {
    const xm = (x0 + x1) / 2
    faces.push(face([[x0, y1, eaveZ], [x0, y0, eaveZ], [xm, y0, ridgeZ], [xm, y1, ridgeZ]], color, 'toiture'))
    faces.push(face([[x1, y0, eaveZ], [x1, y1, eaveZ], [xm, y1, ridgeZ], [xm, y0, ridgeZ]], shade(color, -0.12), 'toiture'))
    faces.push(face([[x0, y0, eaveZ], [xm, y0, ridgeZ], [x1, y0, eaveZ]], MATERIALS.pignon, 'pignon'))
    faces.push(face([[x1, y1, eaveZ], [xm, y1, ridgeZ], [x0, y1, eaveZ]], MATERIALS.pignon, 'pignon'))
  }
  return faces
}

/* --------------------------------------------------------- construction */

/**
 * Assemble toutes les facettes de la maquette.
 * @param {object} plan
 * @param {object} options { showRoof, showWalls, exploded }
 */
export function buildScene(plan, options = {}) {
  const walls = plan.walls || []
  const openings = plan.openings || []
  const height = plan.ceilingHeight || 250
  const faces = []

  if (!walls.length) return { faces, bbox: null }

  const contour = outerContour(walls)
  const bb = wallsBoundingBox(walls)

  // Terrain
  const pad = 350
  faces.push(face([
    [bb.minX - pad, bb.minY - pad, -2], [bb.maxX + pad, bb.minY - pad, -2],
    [bb.maxX + pad, bb.maxY + pad, -2], [bb.minX - pad, bb.maxY + pad, -2],
  ], MATERIALS.terrain, 'terrain'))

  // Dalle
  if (contour.points.length >= 3) {
    const slabThickness = plan.slab?.thickness || 15
    faces.push(...box(contour.points.map(p => ({ x: p.x, y: p.y })), -slabThickness, 0, MATERIALS.dalle, 'dalle'))
  }

  // Murs
  if (options.showWalls !== false) {
    const exteriorIds = new Set(options.exteriorWallIds || walls.map(w => w.id))
    for (const wall of walls) {
      faces.push(...wallFaces(wall, openings, height, exteriorIds.has(wall.id)))
    }
    for (const opening of openings) {
      const wall = walls.find(w => w.id === opening.wallId)
      if (wall) faces.push(...openingFaces(opening, wall))
    }
  }

  // Toiture
  if (options.showRoof !== false) {
    const lift = options.exploded ? 150 : 0
    const roof = roofFaces(walls, plan.roof, height + lift)
    faces.push(...roof)
  }

  return { faces, bbox: bb, contour }
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

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
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

/** Normale d'une facette par la méthode de Newell (robuste aux polygones non plans) */
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
 * Projette et trie les facettes. Renvoie des polygones écran prêts à peindre,
 * du plus lointain au plus proche.
 */
export function projectScene(faces, cam, width, height) {
  const eye = cameraPosition(cam)
  const forward = norm(sub(cam.target, eye))
  const right = norm(cross(forward, [0, 0, 1]))
  const up = cross(right, forward)
  const focal = Math.min(width, height) * 1.15
  const cx = width / 2
  const cy = height / 2

  const out = []
  for (const f of faces) {
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

    const screen = view.map(v => [cx + (v[0] / v[2]) * focal, cy - (v[1] / v[2]) * focal])

    // Éclairage : normale rabattue vers l'observateur pour ignorer le sens
    const n = faceNormal(f.points)
    const centroid = f.points.reduce((acc, p) => [acc[0] + p[0] / f.points.length, acc[1] + p[1] / f.points.length, acc[2] + p[2] / f.points.length], [0, 0, 0])
    const toEye = norm(sub(eye, centroid))
    const facing = dot(n, toEye) < 0 ? [-n[0], -n[1], -n[2]] : n
    const lambert = Math.max(0, dot(facing, LIGHT))
    const intensity = 0.55 + 0.45 * lambert

    out.push({
      screen,
      color: shade(f.color, intensity - 1),
      kind: f.kind,
      depth: depth / view.length,
    })
  }

  out.sort((a, b) => b.depth - a.depth)
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

  for (const poly of polygons) {
    ctx.beginPath()
    ctx.moveTo(poly.screen[0][0], poly.screen[0][1])
    for (let i = 1; i < poly.screen.length; i++) ctx.lineTo(poly.screen[i][0], poly.screen[i][1])
    ctx.closePath()
    ctx.fillStyle = poly.color
    ctx.fill()
    if (poly.kind !== 'terrain') {
      ctx.strokeStyle = 'rgba(30,41,59,0.16)'
      ctx.lineWidth = 0.7
      ctx.stroke()
    }
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
