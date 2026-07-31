/**
 * Réseaux de plomberie : évacuations, réservations dans la dalle et
 * alimentation en eau.
 *
 * Références : DTU 60.1 pour les canalisations, DTU 60.11 pour le
 * dimensionnement. Les valeurs encodées ici correspondent aux usages courants
 * d'une maison individuelle. Un cas particulier (fosse, relevage, immeuble)
 * demande l'avis d'un plombier.
 */

import { dist, projectOnSegment, pointInPolygon, wallsBoundingBox } from './geometry'

/* ------------------------------------------------------- catalogue */

export const EQUIPMENT_TYPES = [
  {
    id: 'wc', label: 'WC', icon: '🚽', lot: 'plomberie',
    drain: 100, supplyCold: 12, supplyHot: null, maxToStack: 100,
    startDepth: 25, priceItem: 'sanitaire-wc',
    rooms: ['wc', 'sdb'],
    note: "Évacuation en Ø100. Le raccordement doit rester au plus près de la chute : au-delà d'1 m, prévoyez une ventilation secondaire.",
  },
  {
    id: 'douche', label: 'Douche', icon: '🚿', lot: 'plomberie',
    drain: 50, supplyCold: 16, supplyHot: 16, maxToStack: 400,
    startDepth: 22, priceItem: 'sanitaire-douche',
    rooms: ['sdb'],
    note: "Ø40 est admis, Ø50 évite les engorgements de cheveux. Le siphon extra-plat impose de réserver au moins 12 cm sous le receveur.",
  },
  {
    id: 'baignoire', label: 'Baignoire', icon: '🛁', lot: 'plomberie',
    drain: 40, supplyCold: 16, supplyHot: 16, maxToStack: 300,
    startDepth: 22, priceItem: 'sanitaire-douche',
    rooms: ['sdb'],
    note: 'Prévoyez une trappe de visite pour accéder au siphon et à la bonde.',
  },
  {
    id: 'lavabo', label: 'Lavabo', icon: '🧼', lot: 'plomberie',
    drain: 40, supplyCold: 12, supplyHot: 12, maxToStack: 300,
    startDepth: 20, priceItem: 'sanitaire-lavabo',
    rooms: ['sdb', 'wc'],
    note: 'Évacuation souvent reprise dans la cloison plutôt que dans la dalle : hauteur classique de sortie à 55 cm du sol.',
  },
  {
    id: 'evier', label: 'Évier', icon: '🍽️', lot: 'plomberie',
    drain: 50, supplyCold: 16, supplyHot: 16, maxToStack: 400,
    startDepth: 22, priceItem: 'sanitaire-evier',
    rooms: ['cuisine'],
    note: 'Ø50 pour un évier deux bacs. Un bac à graisse n\'est pas obligatoire en maison individuelle raccordée au tout-à-l\'égout.',
  },
  {
    id: 'lave-linge', label: 'Lave-linge', icon: '🧺', lot: 'plomberie',
    drain: 40, supplyCold: 12, supplyHot: null, maxToStack: 300,
    startDepth: 20, priceItem: null,
    rooms: ['buanderie', 'sdb', 'cuisine'],
    note: "Siphon de machine à laver à encastrer, entre 60 et 90 cm du sol. Circuit électrique spécialisé obligatoire.",
  },
  {
    id: 'lave-vaisselle', label: 'Lave-vaisselle', icon: '🍴', lot: 'plomberie',
    drain: 40, supplyCold: 12, supplyHot: null, maxToStack: 300,
    startDepth: 20, priceItem: null,
    rooms: ['cuisine'],
    note: 'Se raccorde le plus souvent sur le siphon de l\'évier, sans réservation supplémentaire.',
  },
  {
    id: 'chauffe-eau', label: 'Chauffe-eau', icon: '♨️', lot: 'plomberie',
    drain: 32, supplyCold: 16, supplyHot: 16, maxToStack: 400,
    startDepth: 20, priceItem: 'chauffe-eau',
    rooms: ['buanderie', 'cellier', 'garage', 'sdb'],
    note: "Le groupe de sécurité doit s'écouler à l'air libre vers une évacuation : ne le raccordez jamais en direct.",
  },
]

export const EQUIPMENT_BY_ID = Object.fromEntries(EQUIPMENT_TYPES.map(e => [e.id, e]))

/** Équipements pertinents pour un type de pièce donné */
export function suggestedEquipment(roomType) {
  return EQUIPMENT_TYPES.filter(e => e.rooms.includes(roomType))
}

/* --------------------------------------------------------- paramètres */

export const DEFAULT_SLOPE = 2 // cm par mètre

export const SLOPE_LIMITS = {
  min: 1,
  max: 3,
  note: "La pente doit rester entre 1 et 3 cm par mètre. Trop faible, les effluents stagnent ; trop forte, l'eau part plus vite que les matières et le tuyau s'encrasse.",
}

/** Distance maximale entre un siphon et la chute ventilée, par diamètre */
export const MAX_UNVENTED_RUN = {
  32: 170,
  40: 300,
  50: 400,
  100: 100,
}

/* --------------------------------------------------- géométrie du réseau */

/** Chemin orthogonal entre deux points, en privilégiant un coude à l'intérieur */
function orthogonalPath(from, to, isInside) {
  if (Math.abs(from.x - to.x) < 1 || Math.abs(from.y - to.y) < 1) return [from, to]
  const corner1 = { x: to.x, y: from.y }
  const corner2 = { x: from.x, y: to.y }
  const ok1 = isInside(corner1)
  const ok2 = isInside(corner2)
  if (ok1 && !ok2) return [from, corner1, to]
  if (ok2 && !ok1) return [from, corner2, to]
  return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)
    ? [from, corner1, to]
    : [from, corner2, to]
}

function polylineLength(points) {
  let total = 0
  for (let i = 0; i < points.length - 1; i++) total += dist(points[i], points[i + 1])
  return total
}

/** Point le plus proche sur un ensemble de polylignes déjà tracées */
function nearestOnNetwork(point, polylines) {
  let best = null
  for (const line of polylines) {
    for (let i = 0; i < line.length - 1; i++) {
      const p = projectOnSegment(point, line[i], line[i + 1])
      if (!best || p.distance < best.distance) best = { ...p, line, index: i }
    }
  }
  return best
}

/** Sortie par défaut : le point du contour extérieur le plus proche des appareils */
function autoExit(plan, surfaces) {
  const equipment = plan.equipment || []
  const bb = wallsBoundingBox(plan.walls || [])
  if (!equipment.length || !Number.isFinite(bb.minX)) {
    return { x: Math.round((bb.minX + bb.maxX) / 2) || 0, y: Math.round(bb.maxY) || 0, auto: true }
  }
  const cx = equipment.reduce((s, e) => s + e.point.x, 0) / equipment.length
  const cy = equipment.reduce((s, e) => s + e.point.y, 0) / equipment.length

  let best = null
  for (const wall of surfaces.exteriorWalls) {
    const p = projectOnSegment({ x: cx, y: cy }, wall.a, wall.b)
    if (!best || p.distance < best.distance) best = p
  }
  return best
    ? { x: Math.round(best.point.x), y: Math.round(best.point.y), auto: true }
    : { x: Math.round(cx), y: Math.round(bb.maxY), auto: true }
}

/* ------------------------------------------------------- calcul complet */

/**
 * Construit le réseau d'évacuation en arbre : un collecteur principal depuis
 * l'appareil le plus contraignant jusqu'à la sortie, puis des antennes qui
 * viennent s'y raccorder au plus court.
 */
export function computePlumbing(plan, surfaces) {
  const equipment = (plan.equipment || []).map(e => ({ ...e, spec: EQUIPMENT_BY_ID[e.type] })).filter(e => e.spec)
  const slope = plan.plumbing?.slope ?? DEFAULT_SLOPE
  const exit = plan.plumbing?.exit || autoExit(plan, surfaces)

  const rooms = surfaces.rooms || []
  const isInside = (p) => rooms.some(r => pointInPolygon(p, r.points))

  if (!equipment.length) {
    return {
      equipment: [], routes: [], reservations: [], exit, slope,
      totals: emptyTotals(), warnings: [], depthAtExit: 0, supply: [], origin: originOf(plan),
    }
  }

  // L'appareil qui commande le collecteur : le WC s'il existe, sinon le plus éloigné
  const wc = equipment.find(e => e.type === 'wc')
  const primary = wc || equipment.reduce((far, e) =>
    dist(e.point, exit) > dist(far.point, exit) ? e : far, equipment[0])

  const hasWc = !!wc
  const trunkDiameter = hasWc ? 100 : Math.max(50, ...equipment.map(e => e.spec.drain))

  const routes = []
  const drawn = []

  const trunkPoints = orthogonalPath(primary.point, exit, isInside)
  routes.push({
    id: `route-${primary.id}`,
    equipmentId: primary.id,
    points: trunkPoints,
    diameter: trunkDiameter,
    trunk: true,
    length: polylineLength(trunkPoints),
    color: '#0284C7',
  })
  drawn.push(trunkPoints)

  const others = equipment.filter(e => e.id !== primary.id)
    .sort((a, b) => dist(b.point, exit) - dist(a.point, exit))

  for (const item of others) {
    const join = nearestOnNetwork(item.point, drawn)
    const target = join ? join.point : exit
    const points = orthogonalPath(item.point, target, isInside)
    routes.push({
      id: `route-${item.id}`,
      equipmentId: item.id,
      points,
      diameter: item.spec.drain,
      trunk: false,
      length: polylineLength(points),
      distanceToTrunk: join ? join.distance : dist(item.point, exit),
      color: '#38BDF8',
    })
    drawn.push(points)
  }

  /* ---- profondeurs ---- */
  const routeById = new Map(routes.map(r => [r.equipmentId, r]))
  const trunkLength = routes.find(r => r.trunk)?.length || 0

  const depths = equipment.map(item => {
    const route = routeById.get(item.id)
    const own = route?.length || 0
    // trajet total jusqu'à la sortie : antenne + portion de collecteur restante
    const totalRun = route?.trunk ? own : own + trunkLength
    const fall = (totalRun / 100) * slope
    return {
      equipmentId: item.id,
      run: totalRun,
      depthAtExit: item.spec.startDepth + fall,
    }
  })
  const depthAtExit = Math.max(0, ...depths.map(d => d.depthAtExit))

  /* ---- réservations ---- */
  const origin = originOf(plan)
  const reservations = equipment
    .filter(e => e.type !== 'lave-vaisselle') // se reprend sur le siphon de l'évier
    .map(item => ({
      id: `res-${item.id}`,
      equipmentId: item.id,
      label: item.spec.label,
      icon: item.spec.icon,
      point: item.point,
      pipe: item.spec.drain,
      diameter: reservationDiameter(item.spec.drain),
      x: Math.round(item.point.x - origin.x),
      y: Math.round(item.point.y - origin.y),
      depth: item.spec.startDepth,
    }))

  reservations.push({
    id: 'res-exit',
    equipmentId: null,
    label: 'Sortie vers le réseau',
    icon: '➡️',
    point: exit,
    pipe: trunkDiameter,
    diameter: reservationDiameter(trunkDiameter),
    x: Math.round(exit.x - origin.x),
    y: Math.round(exit.y - origin.y),
    depth: Math.round(depthAtExit),
    isExit: true,
  })

  /* ---- alimentation ---- */
  const manifold = plan.plumbing?.manifold || nearestSupplyPoint(equipment, exit)
  const supply = equipment.map(item => {
    const points = orthogonalPath(manifold, item.point, isInside)
    const length = polylineLength(points)
    return {
      id: `sup-${item.id}`,
      equipmentId: item.id,
      label: item.spec.label,
      points,
      length,
      cold: item.spec.supplyCold,
      hot: item.spec.supplyHot,
      // aller simple pour l'eau froide, plus un second tube si eau chaude
      metres: (length / 100) * (item.spec.supplyHot ? 2 : 1),
    }
  })

  /* ---- quantitatifs ---- */
  const drainByDiameter = {}
  for (const route of routes) {
    drainByDiameter[route.diameter] = (drainByDiameter[route.diameter] || 0) + route.length / 100
  }
  // Chaque appareil demande au minimum son siphon et sa descente, même quand il
  // se trouve pile sur le collecteur.
  for (const item of equipment) {
    const d = item.spec.drain
    drainByDiameter[d] = (drainByDiameter[d] || 0) + CONNECTION_ALLOWANCE / 100
  }
  const supplyByDiameter = {}
  for (const s of supply) {
    supplyByDiameter[s.cold] = (supplyByDiameter[s.cold] || 0) + s.length / 100
    if (s.hot) supplyByDiameter[s.hot] = (supplyByDiameter[s.hot] || 0) + s.length / 100
  }

  const totals = {
    drainByDiameter,
    supplyByDiameter,
    drainTotal: (routes.reduce((s, r) => s + r.length, 0) + equipment.length * CONNECTION_ALLOWANCE) / 100,
    supplyTotal: supply.reduce((s, x) => s + x.metres, 0),
    fittings: routes.reduce((s, r) => s + Math.max(1, r.points.length - 1), 0) + equipment.length,
    waterPoints: equipment.filter(e => e.spec.supplyCold).length,
  }

  return {
    equipment,
    routes,
    reservations,
    exit,
    manifold,
    slope,
    depths,
    depthAtExit,
    supply,
    totals,
    origin,
    warnings: buildWarnings(equipment, routes, slope, depthAtExit, rooms),
  }
}

function emptyTotals() {
  return { drainByDiameter: {}, supplyByDiameter: {}, drainTotal: 0, supplyTotal: 0, fittings: 0, waterPoints: 0 }
}

/**
 * Diamètre de la réservation à ménager dans la dalle.
 * On ne perce jamais au diamètre exact du tube : il faut la place du fourreau,
 * du calage et de l'ajustement au moment de la pose.
 */
export function reservationDiameter(pipe) {
  return Math.round(Math.max(pipe + 50, pipe * 1.5) / 10) * 10
}

/** Longueur forfaitaire de raccordement d'un appareil : siphon et descente */
const CONNECTION_ALLOWANCE = 60 // cm

/** Coin de référence pour les cotes : angle haut-gauche du bâtiment */
export function originOf(plan) {
  const bb = wallsBoundingBox(plan.walls || [])
  if (!Number.isFinite(bb.minX)) return { x: 0, y: 0 }
  return { x: bb.minX, y: bb.minY }
}

function nearestSupplyPoint(equipment, exit) {
  if (!equipment.length) return exit
  const heater = equipment.find(e => e.type === 'chauffe-eau')
  if (heater) return { x: heater.point.x, y: heater.point.y }
  return { x: Math.round(exit.x), y: Math.round(exit.y) }
}

function buildWarnings(equipment, routes, slope, depthAtExit, rooms) {
  const warnings = []

  if (slope < SLOPE_LIMITS.min || slope > SLOPE_LIMITS.max) {
    warnings.push({
      level: 'error',
      text: `Pente de ${slope} cm/m hors des limites admises. ${SLOPE_LIMITS.note}`,
    })
  }

  const routeById = new Map(routes.map(r => [r.equipmentId, r]))
  for (const item of equipment) {
    const route = routeById.get(item.id)
    if (!route || route.trunk) continue
    const limit = MAX_UNVENTED_RUN[item.spec.drain] || 300
    if (route.length > limit) {
      warnings.push({
        level: 'warning',
        text: `${item.spec.label} : ${(route.length / 100).toFixed(1).replace('.', ',')} m jusqu'au collecteur, au-delà de la limite de ${(limit / 100).toFixed(1).replace('.', ',')} m en Ø${item.spec.drain}. Rapprochez l'appareil ou ajoutez une ventilation secondaire (clapet aérateur).`,
      })
    }
  }

  if (depthAtExit > 60) {
    warnings.push({
      level: 'warning',
      text: `Le collecteur sortira à ${Math.round(depthAtExit)} cm sous le sol fini. Vérifiez la profondeur du branchement au tout-à-l'égout : s'il est plus haut, il faudra rapprocher la sortie ou installer une pompe de relevage.`,
    })
  }

  const wcCount = equipment.filter(e => e.type === 'wc').length
  if (wcCount === 0 && equipment.length > 0) {
    warnings.push({
      level: 'info',
      text: "Aucun WC placé : le collecteur est dimensionné en Ø50. Ajoutez le WC pour passer le calcul en Ø100.",
    })
  }

  const wetRoomsWithoutEquipment = rooms.filter(r =>
    ['sdb', 'wc', 'cuisine'].includes(r.type) &&
    !equipment.some(e => pointInPolygon(e.point, r.points)))
  for (const room of wetRoomsWithoutEquipment) {
    warnings.push({ level: 'info', text: `${room.name} : aucun appareil placé pour l'instant.` })
  }

  warnings.push({
    level: 'info',
    text: "La chute doit être prolongée en ventilation primaire au-dessus de la toiture, sur toute sa section. Sans elle, les siphons se désamorcent et les odeurs remontent.",
  })

  return warnings
}

/* ------------------------------------------------------------ formats */

export function formatDepth(cm) {
  return `${Math.round(cm)} cm`
}

export function formatRun(cm) {
  return `${(cm / 100).toFixed(2).replace('.', ',')} m`
}
