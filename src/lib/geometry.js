/**
 * Moteur géométrique du plan.
 * Toutes les coordonnées sont en centimètres, x vers la droite, y vers le bas
 * (repère écran). Les surfaces sont renvoyées en m².
 */

export const GRID = 10 // aimantage 10 cm
export const NODE_TOLERANCE = 4 // deux points à moins de 4 cm sont le même nœud

/* ---------------------------------------------------------------- vecteurs */

export const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)

export const snap = (v, grid = GRID) => Math.round(v / grid) * grid

export const snapPoint = (p, grid = GRID) => ({ x: snap(p.x, grid), y: snap(p.y, grid) })

export function angleOf(from, to) {
  return Math.atan2(to.y - from.y, to.x - from.x)
}

/** Point sur le segment ab à la distance t (0..1) */
export function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/** Vecteur unitaire de a vers b */
export function direction(a, b) {
  const d = dist(a, b)
  if (d === 0) return { x: 0, y: 0 }
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d }
}

/** Normale à gauche du vecteur a→b */
export function normal(a, b) {
  const d = direction(a, b)
  return { x: -d.y, y: d.x }
}

/** Projection orthogonale du point p sur le segment ab, bornée au segment */
export function projectOnSegment(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return { point: { ...a }, t: 0, distance: dist(p, a) }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const point = { x: a.x + dx * t, y: a.y + dy * t }
  return { point, t, distance: dist(p, point) }
}

/* ------------------------------------------------------------------- murs */

let wallSeq = 0
export function makeWall(a, b, opts = {}) {
  wallSeq += 1
  return {
    id: opts.id || `w${Date.now().toString(36)}${wallSeq}`,
    a: { x: a.x, y: a.y },
    b: { x: b.x, y: b.y },
    thickness: opts.thickness ?? 20,
    kind: opts.kind || 'porteur', // porteur | cloison
  }
}

export const wallLength = (wall) => dist(wall.a, wall.b)

/** Longueur totale des murs d'un type donné, en mètres linéaires */
export function totalWallLength(walls, kind = null) {
  return walls
    .filter(w => !kind || w.kind === kind)
    .reduce((sum, w) => sum + wallLength(w), 0) / 100
}

/**
 * Aimante un point sur les éléments existants : d'abord les extrémités de murs,
 * puis les alignements horizontaux/verticaux, puis la grille.
 */
export function smartSnap(point, walls, { grid = GRID, radius = 25 } = {}) {
  // 1. Extrémité de mur existante : c'est l'accroche la plus forte
  let best = null
  for (const wall of walls) {
    for (const end of [wall.a, wall.b]) {
      const d = dist(point, end)
      if (d < radius && (!best || d < best.d)) best = { d, p: { ...end }, type: 'node' }
    }
  }
  if (best) return { ...best.p, snapped: 'node' }

  // 2. Le long d'un mur : indispensable pour créer un raccord en T
  let onWall = null
  for (const wall of walls) {
    const p = projectOnSegment(point, wall.a, wall.b)
    if (p.distance < radius && p.t > 0.02 && p.t < 0.98) {
      if (!onWall || p.distance < onWall.distance) onWall = p
    }
  }
  if (onWall) {
    return { x: Math.round(onWall.point.x), y: Math.round(onWall.point.y), snapped: 'wall' }
  }

  // 3. Alignement sur l'axe d'une extrémité existante
  let ax = null
  let ay = null
  for (const wall of walls) {
    for (const end of [wall.a, wall.b]) {
      if (Math.abs(point.x - end.x) < radius && (ax === null || Math.abs(point.x - end.x) < Math.abs(point.x - ax))) ax = end.x
      if (Math.abs(point.y - end.y) < radius && (ay === null || Math.abs(point.y - end.y) < Math.abs(point.y - ay))) ay = end.y
    }
  }
  const x = ax !== null ? ax : snap(point.x, grid)
  const y = ay !== null ? ay : snap(point.y, grid)
  return { x, y, snapped: ax !== null || ay !== null ? 'align' : 'grid' }
}

/** Extrémités distinctes de l'ensemble des murs */
export function uniqueNodes(walls) {
  const map = new Map()
  for (const wall of walls) {
    for (const p of [wall.a, wall.b]) {
      const key = `${Math.round(p.x / NODE_TOLERANCE)}:${Math.round(p.y / NODE_TOLERANCE)}`
      if (!map.has(key)) map.set(key, { key, x: p.x, y: p.y })
    }
  }
  return [...map.values()]
}

/**
 * Aimantation pendant un déplacement, avec repères d'alignement.
 *
 * Ordre de priorité : une extrémité existante, puis un point le long d'un mur,
 * puis l'alignement sur l'axe d'un point voisin, et enfin la grille. Les deux
 * premiers créent une vraie connexion, le troisième renvoie des repères à
 * afficher pour que l'utilisateur comprenne ce sur quoi il s'aligne.
 */
export function snapDrag(world, walls, options = {}) {
  const { excludeWallIds = [], ignoreNear = null, radius = 25, grid = GRID } = options
  const skip = (p) => ignoreNear && dist(p, ignoreNear) <= NODE_TOLERANCE

  let best = null
  for (const wall of walls) {
    for (const p of [wall.a, wall.b]) {
      if (skip(p)) continue
      const d = dist(world, p)
      if (d < radius && (!best || d < best.d)) best = { d, p }
    }
  }
  if (best) return { point: { x: best.p.x, y: best.p.y }, snapped: 'node', guides: [] }

  let onWall = null
  for (const wall of walls) {
    if (excludeWallIds.includes(wall.id)) continue
    const pr = projectOnSegment(world, wall.a, wall.b)
    if (pr.distance < radius && pr.t > 0.02 && pr.t < 0.98 && (!onWall || pr.distance < onWall.distance)) {
      onWall = pr
    }
  }
  if (onWall) {
    return {
      point: { x: Math.round(onWall.point.x), y: Math.round(onWall.point.y) },
      snapped: 'wall',
      guides: [],
    }
  }

  let ax = null
  let ay = null
  for (const wall of walls) {
    for (const p of [wall.a, wall.b]) {
      if (skip(p)) continue
      if (Math.abs(world.x - p.x) < radius && (!ax || Math.abs(world.x - p.x) < Math.abs(world.x - ax.x))) ax = p
      if (Math.abs(world.y - p.y) < radius && (!ay || Math.abs(world.y - p.y) < Math.abs(world.y - ay.y))) ay = p
    }
  }
  const point = {
    x: ax ? ax.x : snap(world.x, grid),
    y: ay ? ay.y : snap(world.y, grid),
  }
  const guides = []
  if (ax) guides.push({ x1: ax.x, y1: ax.y, x2: point.x, y2: point.y })
  if (ay) guides.push({ x1: ay.x, y1: ay.y, x2: point.x, y2: point.y })
  return { point, snapped: ax || ay ? 'align' : 'grid', guides }
}

/** Contraint b à être exactement horizontal ou vertical par rapport à a */
export function orthoConstrain(a, b) {
  const dx = Math.abs(b.x - a.x)
  const dy = Math.abs(b.y - a.y)
  return dx >= dy ? { x: b.x, y: a.y } : { x: a.x, y: b.y }
}

/* -------------------------------------------------------------- polygones */

/** Aire signée (shoelace). Positive ou négative selon le sens de parcours. */
export function signedArea(points) {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const q = points[(i + 1) % points.length]
    sum += p.x * q.y - q.x * p.y
  }
  return sum / 2
}

/** Aire absolue en m² */
export const polygonArea = (points) => Math.abs(signedArea(points)) / 10000

/** Périmètre en mètres */
export function polygonPerimeter(points) {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    sum += dist(points[i], points[(i + 1) % points.length])
  }
  return sum / 100
}

export function centroid(points) {
  if (points.length === 0) return { x: 0, y: 0 }
  const a = signedArea(points)
  if (Math.abs(a) < 1) {
    // dégénéré : moyenne simple
    return {
      x: points.reduce((s, p) => s + p.x, 0) / points.length,
      y: points.reduce((s, p) => s + p.y, 0) / points.length,
    }
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const q = points[(i + 1) % points.length]
    const cross = p.x * q.y - q.x * p.y
    cx += (p.x + q.x) * cross
    cy += (p.y + q.y) * cross
  }
  return { x: cx / (6 * a), y: cy / (6 * a) }
}

export function pointInPolygon(p, points) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const pi = points[i]
    const pj = points[j]
    const intersect = (pi.y > p.y) !== (pj.y > p.y) &&
      p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x
    if (intersect) inside = !inside
  }
  return inside
}

export function boundingBox(points) {
  if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

export function wallsBoundingBox(walls) {
  const pts = []
  for (const w of walls) { pts.push(w.a, w.b) }
  return boundingBox(pts)
}

/* ------------------------------------------- détection automatique des pièces */

function nodeKey(p) {
  return `${Math.round(p.x / NODE_TOLERANCE)}:${Math.round(p.y / NODE_TOLERANCE)}`
}

/** Intersection propre de deux segments. Renvoie null s'ils sont parallèles. */
export function segmentIntersection(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x
  const d1y = p2.y - p1.y
  const d2x = p4.x - p3.x
  const d2y = p4.y - p3.y
  const denom = d1x * d2y - d1y * d2x
  if (Math.abs(denom) < 1e-9) return null
  const t1 = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom
  const t2 = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom
  return { t1, t2, point: { x: p1.x + d1x * t1, y: p1.y + d1y * t1 } }
}

/**
 * Découpe les murs à leurs points de rencontre.
 *
 * Un utilisateur trace naturellement une cloison qui vient buter au milieu
 * d'un mur extérieur. Sans découpe, ce raccord en T ne crée pas de nœud dans
 * le graphe et les pièces ne sont pas détectées. On produit donc une version
 * segmentée du plan pour l'analyse, sans toucher aux murs d'origine : les
 * identifiants restent stables pour les ouvertures et la sélection.
 */
export function splitWalls(walls) {
  const segments = []

  for (const wall of walls) {
    const len = wallLength(wall)
    if (len < NODE_TOLERANCE) continue

    const cuts = new Set([0, 1])
    const addCut = (t) => {
      if (!Number.isFinite(t)) return
      if (t * len <= NODE_TOLERANCE) return
      if ((1 - t) * len <= NODE_TOLERANCE) return
      cuts.add(t)
    }

    for (const other of walls) {
      if (other.id === wall.id) continue

      // raccord en T : une extrémité de l'autre mur tombe sur celui-ci
      for (const end of [other.a, other.b]) {
        const p = projectOnSegment(end, wall.a, wall.b)
        if (p.distance <= NODE_TOLERANCE) addCut(p.t)
      }

      // croisement en X
      const x = segmentIntersection(wall.a, wall.b, other.a, other.b)
      if (x && x.t2 > 1e-6 && x.t2 < 1 - 1e-6) addCut(x.t1)
    }

    const sorted = [...cuts].sort((a, b) => a - b)
    const single = sorted.length === 2
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = lerp(wall.a, wall.b, sorted[i])
      const b = lerp(wall.a, wall.b, sorted[i + 1])
      if (dist(a, b) < NODE_TOLERANCE) continue
      segments.push({
        ...wall,
        id: single ? wall.id : `${wall.id}#${i}`,
        parentId: wall.id,
        a,
        b,
      })
    }
  }

  return segments
}

/**
 * Construit le graphe planaire des murs.
 * Renvoie { nodes: Map<key, {x,y,key,neighbours:[]}> }
 */
function buildGraph(walls) {
  const nodes = new Map()
  const ensure = (p) => {
    const key = nodeKey(p)
    if (!nodes.has(key)) nodes.set(key, { key, x: p.x, y: p.y, neighbours: [] })
    return nodes.get(key)
  }
  for (const wall of walls) {
    if (wallLength(wall) < NODE_TOLERANCE) continue
    const na = ensure(wall.a)
    const nb = ensure(wall.b)
    if (na.key === nb.key) continue
    if (!na.neighbours.some(n => n.key === nb.key)) na.neighbours.push({ key: nb.key, wallId: wall.id })
    if (!nb.neighbours.some(n => n.key === na.key)) nb.neighbours.push({ key: na.key, wallId: wall.id })
  }
  return nodes
}

/**
 * Détecte les pièces (faces intérieures du graphe planaire des murs).
 *
 * Principe : on parcourt les demi-arêtes. Depuis l'arête u→v, la suivante est
 * la première arête sortant de v dans le sens horaire à partir de v→u. Ce
 * parcours isole toutes les faces ; dans chaque composante connexe, la face de
 * plus grande aire absolue est le contour extérieur, on l'écarte.
 */
export function analyseFaces(rawWalls) {
  const walls = splitWalls(rawWalls)
  const nodes = buildGraph(walls)
  if (nodes.size < 3) return { inner: [], outer: [], nodes, segments: walls }

  const angles = new Map() // key -> [{key, angle}] trié par angle croissant
  for (const node of nodes.values()) {
    const list = node.neighbours.map(n => {
      const other = nodes.get(n.key)
      return { key: n.key, wallId: n.wallId, angle: Math.atan2(other.y - node.y, other.x - node.x) }
    })
    list.sort((p, q) => p.angle - q.angle)
    angles.set(node.key, list)
  }

  const nextHalfEdge = (fromKey, toKey) => {
    const list = angles.get(toKey)
    if (!list || list.length === 0) return null
    const back = nodes.get(fromKey)
    const here = nodes.get(toKey)
    const backAngle = Math.atan2(back.y - here.y, back.x - here.x)
    // première arête strictement avant backAngle en tournant dans le sens horaire
    let candidate = null
    for (const item of list) {
      if (item.key === toKey) continue
      let delta = backAngle - item.angle
      while (delta <= 1e-9) delta += Math.PI * 2
      while (delta > Math.PI * 2) delta -= Math.PI * 2
      if (!candidate || delta < candidate.delta) candidate = { ...item, delta }
    }
    return candidate ? candidate.key : null
  }

  // composante connexe de chaque nœud
  const component = new Map()
  let compId = 0
  for (const node of nodes.values()) {
    if (component.has(node.key)) continue
    const stack = [node.key]
    component.set(node.key, compId)
    while (stack.length) {
      const k = stack.pop()
      for (const n of nodes.get(k).neighbours) {
        if (!component.has(n.key)) { component.set(n.key, compId); stack.push(n.key) }
      }
    }
    compId += 1
  }

  const visited = new Set()
  const faces = []
  for (const node of nodes.values()) {
    for (const n of node.neighbours) {
      const startKey = `${node.key}>${n.key}`
      if (visited.has(startKey)) continue

      const cycle = []
      let from = node.key
      let to = n.key
      let guard = 0
      let ok = true
      while (guard < 4000) {
        guard += 1
        const edgeKey = `${from}>${to}`
        if (visited.has(edgeKey)) { ok = edgeKey === startKey; break }
        visited.add(edgeKey)
        cycle.push(from)
        const next = nextHalfEdge(from, to)
        if (next === null) { ok = false; break }
        from = to
        to = next
        if (`${from}>${to}` === startKey) break
      }
      if (!ok || cycle.length < 3) continue

      const points = cycle.map(k => ({ x: nodes.get(k).x, y: nodes.get(k).y }))
      const area = signedArea(points)
      if (Math.abs(area) < 5000) continue // < 0,5 m² : impasse ou artefact
      faces.push({ points, area, keys: cycle, component: component.get(cycle[0]) })
    }
  }

  // Dans chaque composante, la face de plus grande aire absolue est l'extérieur
  const largestPerComponent = new Map()
  for (const face of faces) {
    const current = largestPerComponent.get(face.component)
    if (!current || Math.abs(face.area) > Math.abs(current.area)) largestPerComponent.set(face.component, face)
  }

  const outerFaces = new Set(largestPerComponent.values())

  const decorate = (face, index) => {
    const perimeter = polygonPerimeter(face.points)
    const grossArea = Math.abs(face.area) / 10000
    // surface utile ≈ surface d'axe − (périmètre × demi-épaisseur moyenne)
    const avgThickness = averageThicknessAround(face.keys, nodes, walls)
    const netArea = Math.max(0.5, grossArea - (perimeter * avgThickness) / 200)
    return {
      id: `room-${face.keys.join('-')}`,
      index,
      points: face.points,
      grossArea: round2(grossArea),
      area: round2(netArea),
      perimeter: round2(perimeter),
      centroid: centroid(face.points),
    }
  }

  const inner = faces
    .filter(face => !outerFaces.has(face))
    .map(decorate)
    .sort((a, b) => b.area - a.area)

  const outer = [...outerFaces].map(decorate)

  return { inner, outer, nodes, segments: walls }
}

/** Pièces = faces intérieures du graphe des murs */
export function detectRooms(walls) {
  return analyseFaces(walls).inner
}

/**
 * Contour extérieur du bâtiment. Renvoie l'emprise au sol (m²) et le périmètre
 * (ml) mesurés sur l'axe des murs, ainsi que le polygone.
 */
export function outerContour(walls) {
  const { outer } = analyseFaces(walls)
  if (!outer.length) return { points: [], area: 0, perimeter: 0 }
  const total = outer.reduce(
    (acc, face) => ({
      area: acc.area + face.grossArea,
      perimeter: acc.perimeter + face.perimeter,
    }),
    { area: 0, perimeter: 0 },
  )
  return { points: outer[0].points, area: round2(total.area), perimeter: round2(total.perimeter), faces: outer }
}

function averageThicknessAround(keys, nodes, walls) {
  const wallById = new Map(walls.map(w => [w.id, w]))
  let sum = 0
  let count = 0
  for (let i = 0; i < keys.length; i++) {
    const node = nodes.get(keys[i])
    const nextKey = keys[(i + 1) % keys.length]
    const link = node.neighbours.find(n => n.key === nextKey)
    const wall = link && wallById.get(link.wallId)
    if (wall) { sum += wall.thickness; count += 1 }
  }
  return count ? sum / count : 20
}

const round2 = (v) => Math.round(v * 100) / 100

/* -------------------------------------------------------- murs extérieurs */

/**
 * Un mur est extérieur s'il borde le contour extérieur du bâtiment, c'est à
 * dire s'il n'a pas une pièce détectée de chaque côté.
 */
export function classifyWalls(walls, rooms) {
  return walls.map(wall => {
    const mid = lerp(wall.a, wall.b, 0.5)
    const n = normal(wall.a, wall.b)
    const probe = 30
    const left = { x: mid.x + n.x * probe, y: mid.y + n.y * probe }
    const right = { x: mid.x - n.x * probe, y: mid.y - n.y * probe }
    const leftInside = rooms.some(r => pointInPolygon(left, r.points))
    const rightInside = rooms.some(r => pointInPolygon(right, r.points))
    return { ...wall, exterior: !(leftInside && rightInside) }
  })
}

/* -------------------------------------------------------------- ouvertures */

export function openingArea(opening) {
  return (opening.width * opening.height) / 10000
}

export function totalOpeningArea(openings, wallIds = null) {
  return openings
    .filter(o => !wallIds || wallIds.includes(o.wallId))
    .reduce((sum, o) => sum + openingArea(o), 0)
}

/* ------------------------------------------------------------ constructeurs */

/**
 * Rattrape les extrémités de mur restées en l'air.
 *
 * Au doigt, on vise rarement juste : une cloison tracée à quelques centimètres
 * du mur porteur ne ferme pas la pièce, et rien ne se calcule. On rattache donc
 * toute extrémité libre qui passe à portée d'un autre mur, en la posant
 * exactement dessus.
 */
export function healDanglingEnds(walls, tolerance = 45) {
  const endpoints = []
  for (const wall of walls) {
    endpoints.push({ wall, key: 'a' }, { wall, key: 'b' })
  }

  const isConnected = (point, self) => walls.some(w =>
    w.id !== self.id && (dist(w.a, point) <= NODE_TOLERANCE || dist(w.b, point) <= NODE_TOLERANCE))

  const moved = new Map() // id -> { a?, b? }

  for (const { wall, key } of endpoints) {
    const point = wall[key]
    if (isConnected(point, wall)) continue

    let best = null
    for (const other of walls) {
      if (other.id === wall.id) continue
      const p = projectOnSegment(point, other.a, other.b)
      if (p.distance <= tolerance && p.distance > 0.5 && (!best || p.distance < best.distance)) {
        best = p
      }
    }
    if (!best) continue

    const patch = moved.get(wall.id) || {}
    patch[key] = { x: Math.round(best.point.x), y: Math.round(best.point.y) }
    moved.set(wall.id, patch)
  }

  if (!moved.size) return walls
  return walls.map(w => (moved.has(w.id) ? { ...w, ...moved.get(w.id) } : w))
}

/**
 * Déplace tous les murs qui partagent un nœud. Indispensable pour que les
 * angles restent connectés quand on modifie la longueur d'un mur.
 */
export function moveNode(walls, at, to) {
  const same = (p) => dist(p, at) <= NODE_TOLERANCE
  return walls.map(wall => ({
    ...wall,
    a: same(wall.a) ? { x: to.x, y: to.y } : wall.a,
    b: same(wall.b) ? { x: to.x, y: to.y } : wall.b,
  }))
}

/**
 * Modifie la longueur d'un mur en déplaçant son extrémité b le long de sa
 * direction, en entraînant les murs connectés à cette extrémité.
 */
export function setWallLength(walls, wallId, newLengthCm) {
  const wall = walls.find(w => w.id === wallId)
  if (!wall || newLengthCm <= 0) return walls
  const d = direction(wall.a, wall.b)
  if (d.x === 0 && d.y === 0) return walls
  const target = { x: wall.a.x + d.x * newLengthCm, y: wall.a.y + d.y * newLengthCm }
  return moveNode(walls, wall.b, target)
}

/** Rectangle prêt à l'emploi (dimensions extérieures en cm) */
export function rectanglePlan(width, depth, thickness = 20) {
  const half = thickness / 2
  const w = width - thickness
  const d = depth - thickness
  const corners = [
    { x: half, y: half },
    { x: half + w, y: half },
    { x: half + w, y: half + d },
    { x: half, y: half + d },
  ]
  return corners.map((c, i) => makeWall(c, corners[(i + 1) % 4], { thickness, kind: 'porteur' }))
}

/** Format lisible : 4.2 -> "4,20 m" */
export function formatMeters(cm, decimals = 2) {
  return `${(cm / 100).toFixed(decimals).replace('.', ',')} m`
}

export function formatArea(m2) {
  return `${m2.toFixed(1).replace('.', ',')} m²`
}
