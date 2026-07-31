/**
 * Règles d'installation électrique — NF C 15-100 (amendement A5).
 *
 * Ce module encode les minimums réglementaires par type de pièce, le
 * découpage en circuits et le dimensionnement des protections. Il sert à la
 * fois à estimer le nombre de points pour le chiffrage et à contrôler une
 * installation dessinée par l'utilisateur.
 *
 * Avertissement : ces règles couvrent les cas courants d'un logement
 * individuel. Une installation neuve doit être validée par le CONSUEL avant
 * mise en service, y compris en auto-construction.
 */

import { dist, projectOnSegment, pointInPolygon } from './geometry'

/* ---------------------------------------------------------- appareillage */

export const ELECTRICAL_ITEMS = [
  {
    id: 'prise', label: 'Prise 16 A', icon: '🔌', category: 'sockets',
    layer: 'sol', height: 25, section: 2.5, breaker: 20,
    note: "Axe entre 5 cm et 1,30 m du sol fini. Comptez au moins une prise par tranche de 4 m² dans le séjour.",
  },
  {
    id: 'prise-plan', label: 'Prise plan de travail', icon: '🔌', category: 'sockets',
    layer: 'plafond', height: 110, section: 2.5, breaker: 20,
    note: "À 1,10 m du sol, soit environ 20 cm au-dessus du plan de travail. Jamais au-dessus de l'évier ni des plaques.",
  },
  {
    id: 'interrupteur', label: 'Interrupteur', icon: '🎚️', category: 'lights',
    layer: 'plafond', height: 110, section: 1.5, breaker: 16,
    note: "Entre 0,90 m et 1,30 m, à 15 cm environ du bord de la porte, côté poignée.",
  },
  {
    id: 'va-et-vient', label: 'Va-et-vient', icon: '🔀', category: 'lights',
    layer: 'plafond', height: 110, section: 1.5, breaker: 16,
    note: "Deux points de commande pour un même éclairage. Obligatoire de fait dans un couloir traversant.",
  },
  {
    id: 'point-lumineux', label: 'Point lumineux', icon: '💡', category: 'lights',
    layer: 'plafond', height: 250, section: 1.5, breaker: 16,
    note: "Boîte DCL en plafond, avec fil de terre même pour un luminaire de classe II.",
  },
  {
    id: 'applique', label: 'Applique murale', icon: '🔦', category: 'lights',
    layer: 'plafond', height: 180, section: 1.5, breaker: 16,
    note: 'Au-dessus du lavabo, prévoyez un matériel IPX4 si vous êtes en volume 2.',
  },
  {
    id: 'rj45', label: 'Prise RJ45', icon: '🌐', category: 'network',
    layer: 'sol', height: 25, section: 0, breaker: 0,
    note: "Courant faible : la gaine doit être distincte de celle des courants forts. Câble catégorie 6 vers le coffret de communication.",
  },
  {
    id: 'tv', label: 'Prise TV', icon: '📺', category: 'tv',
    layer: 'sol', height: 25, section: 0, breaker: 0,
    note: 'Courant faible également. Prévoyez une prise 16 A juste à côté.',
  },
  {
    id: 'four', label: 'Four', icon: '🔥', category: 'special',
    layer: 'sol', height: 25, section: 2.5, breaker: 20, special: 'four',
    note: 'Circuit dédié en 2,5 mm² protégé par un disjoncteur 20 A.',
  },
  {
    id: 'plaque', label: 'Plaque de cuisson', icon: '🍳', category: 'special',
    layer: 'sol', height: 25, section: 6, breaker: 32, special: 'plaque',
    note: 'Circuit dédié en 6 mm² protégé par un disjoncteur 32 A, sur différentiel type A.',
  },
  {
    id: 'lave-linge', label: 'Lave-linge', icon: '🧺', category: 'special',
    layer: 'sol', height: 25, section: 2.5, breaker: 20, special: 'lave-linge',
    note: 'Circuit dédié obligatoire, sur différentiel type A.',
  },
  {
    id: 'lave-vaisselle', label: 'Lave-vaisselle', icon: '🍴', category: 'special',
    layer: 'sol', height: 25, section: 2.5, breaker: 20, special: 'lave-vaisselle',
    note: 'Circuit dédié obligatoire.',
  },
  {
    id: 'tableau', label: 'Tableau électrique', icon: '⚡', category: 'panel',
    layer: 'sol', height: 120, section: 0, breaker: 0,
    note: "Dans la GTL : un volume de 60 cm de large sur toute la hauteur, libre de tout autre équipement. Poignées entre 0,90 m et 1,80 m.",
  },
]

export const ITEM_BY_ID = Object.fromEntries(ELECTRICAL_ITEMS.map(i => [i.id, i]))

/** Appareillage conseillé pour un type de pièce */
export function suggestedItems(roomType) {
  const base = ['prise', 'interrupteur', 'point-lumineux']
  switch (roomType) {
    case 'cuisine': return ['prise', 'prise-plan', 'interrupteur', 'point-lumineux', 'four', 'plaque', 'lave-vaisselle']
    case 'sejour': return [...base, 'rj45', 'tv']
    case 'chambre':
    case 'bureau': return [...base, 'rj45']
    case 'sdb': return ['prise', 'interrupteur', 'point-lumineux', 'applique']
    case 'buanderie': return [...base, 'lave-linge']
    case 'couloir': return ['va-et-vient', 'point-lumineux', 'prise']
    default: return base
  }
}

/* ------------------------------------------------------- minimums par pièce */

/**
 * Équipement minimum imposé par la norme pour une pièce.
 * @param {string} roomType identifiant de ROOM_TYPES
 * @param {number} area surface en m²
 */
export function minimumEquipment(roomType, area = 10) {
  switch (roomType) {
    case 'sejour': {
      // 1 socle par tranche de 4 m², avec un minimum de 5
      const sockets = Math.max(5, Math.ceil(area / 4))
      return {
        sockets,
        lights: 1,
        network: 1,
        tv: 1,
        special: [],
        rule: `${sockets} prises (1 par tranche de 4 m², minimum 5), 1 point lumineux, 1 prise RJ45 et 1 prise TV.`,
      }
    }
    case 'cuisine': {
      if (area < 4) {
        return { sockets: 3, lights: 1, network: 0, tv: 0, special: ['four', 'lave-vaisselle', 'plaque'], rule: 'Cuisine de moins de 4 m² : 3 prises minimum.' }
      }
      return {
        sockets: 6,
        socketsAbovePlan: 4,
        lights: 1,
        network: 0,
        tv: 0,
        special: ['four', 'lave-vaisselle', 'plaque'],
        rule: '6 prises minimum dont 4 réparties au-dessus du plan de travail, hors prises des appareils spécialisés. Aucune prise au-dessus de l\'évier ou des plaques.',
      }
    }
    case 'chambre':
    case 'bureau':
      return {
        sockets: 3,
        lights: 1,
        network: 1,
        tv: 0,
        special: [],
        rule: '3 prises minimum, 1 point lumineux et 1 prise réseau RJ45.',
      }
    case 'sdb':
      return {
        sockets: 2,
        lights: 2,
        network: 0,
        tv: 0,
        special: [],
        rule: 'Au moins 1 prise hors volumes (2 recommandées près du lavabo), 1 point lumineux principal et 1 au-dessus du lavabo. Liaison équipotentielle locale obligatoire.',
        volumes: true,
      }
    case 'wc':
      return { sockets: 1, lights: 1, network: 0, tv: 0, special: [], rule: '1 point lumineux. La prise n\'est pas imposée mais reste utile.' }
    case 'buanderie':
      return { sockets: 2, lights: 1, network: 0, tv: 0, special: ['lave-linge', 'seche-linge'], rule: '2 prises, 1 point lumineux et un circuit spécialisé par gros appareil.' }
    case 'entree':
      return { sockets: 1, lights: 1, network: 0, tv: 0, special: [], rule: '1 prise et 1 point lumineux commandé depuis l\'entrée.' }
    case 'couloir':
      return {
        sockets: area > 4 ? 1 : 0,
        lights: 1,
        network: 0,
        tv: 0,
        special: [],
        rule: '1 prise si le dégagement dépasse 4 m². Éclairage commandé par va-et-vient aux deux extrémités.',
      }
    case 'garage':
      return { sockets: 2, lights: 1, network: 0, tv: 0, special: [], rule: '2 prises et 1 point lumineux. Prévoyez une attente pour une borne de recharge.' }
    case 'cellier':
      return { sockets: 1, lights: 1, network: 0, tv: 0, special: ['congelateur'], rule: '1 prise et 1 point lumineux. Circuit dédié conseillé pour un congélateur.' }
    default:
      return { sockets: 1, lights: 1, network: 0, tv: 0, special: [], rule: '1 prise et 1 point lumineux minimum.' }
  }
}

export const SPECIAL_CIRCUIT_LABELS = {
  four: { label: 'Four', section: 2.5, breaker: 20 },
  'lave-vaisselle': { label: 'Lave-vaisselle', section: 2.5, breaker: 20 },
  'lave-linge': { label: 'Lave-linge', section: 2.5, breaker: 20 },
  'seche-linge': { label: 'Sèche-linge', section: 2.5, breaker: 20 },
  plaque: { label: 'Plaque de cuisson', section: 6, breaker: 32 },
  congelateur: { label: 'Congélateur', section: 2.5, breaker: 20 },
  'chauffe-eau': { label: 'Chauffe-eau', section: 2.5, breaker: 20 },
  vmc: { label: 'VMC', section: 1.5, breaker: 2 },
  ivb: { label: 'Borne de recharge véhicule', section: 6, breaker: 32 },
}

/* ------------------------------------------------- limites par circuit */

export const CIRCUIT_LIMITS = {
  sockets: { perCircuit: 8, section: 2.5, breaker: 20, note: '8 prises maximum par circuit en 2,5 mm² (12 autorisées, 8 recommandées pour garder de la marge).' },
  lights: { perCircuit: 8, section: 1.5, breaker: 16, note: '8 points lumineux maximum par circuit en 1,5 mm².' },
}

/**
 * Analyse complète des besoins électriques d'un logement à partir de ses pièces.
 * @param {Array<{type:string, area:number, name:string}>} rooms
 */
export function planElectricalNeeds(rooms = [], options = {}) {
  let sockets = 0
  let lights = 0
  let network = 0
  let tv = 0
  const special = []
  const perRoom = []

  for (const room of rooms) {
    const need = minimumEquipment(room.type, room.area)
    sockets += need.sockets
    lights += need.lights
    network += need.network
    tv += need.tv
    for (const s of need.special) {
      if (!special.includes(s)) special.push(s)
    }
    perRoom.push({ room, need })
  }

  // Équipements techniques du logement
  if (options.hotWater && options.hotWater !== 'none') special.push('chauffe-eau')
  if (options.vmc) special.push('vmc')

  // La norme impose au minimum 3 circuits spécialisés dans un logement
  const specialCircuits = special.map(id => ({ id, ...SPECIAL_CIRCUIT_LABELS[id] }))

  const socketCircuits = Math.max(1, Math.ceil(sockets / CIRCUIT_LIMITS.sockets.perCircuit))
  const lightCircuits = Math.max(1, Math.ceil(lights / CIRCUIT_LIMITS.lights.perCircuit))

  const circuits = [
    ...Array.from({ length: socketCircuits }, (_, i) => ({
      id: `prises-${i + 1}`,
      label: `Prises ${i + 1}`,
      kind: 'sockets',
      section: 2.5,
      breaker: 20,
      count: Math.min(CIRCUIT_LIMITS.sockets.perCircuit, sockets - i * CIRCUIT_LIMITS.sockets.perCircuit),
    })),
    ...Array.from({ length: lightCircuits }, (_, i) => ({
      id: `eclairage-${i + 1}`,
      label: `Éclairage ${i + 1}`,
      kind: 'lights',
      section: 1.5,
      breaker: 16,
      count: Math.min(CIRCUIT_LIMITS.lights.perCircuit, lights - i * CIRCUIT_LIMITS.lights.perCircuit),
    })),
    ...specialCircuits.map(c => ({
      id: `spe-${c.id}`,
      label: c.label,
      kind: 'special',
      section: c.section,
      breaker: c.breaker,
      count: 1,
    })),
  ]

  const totalArea = rooms.reduce((sum, r) => sum + (r.area || 0), 0)
  const differentials = sizeDifferentials(totalArea, circuits.length)

  return {
    sockets,
    lights,
    network,
    tv,
    specialCircuits,
    circuits,
    differentials,
    perRoom,
    totalPoints: sockets + lights + network + tv,
    warnings: buildWarnings(specialCircuits.length, rooms),
  }
}

/**
 * Dimensionnement des interrupteurs différentiels 30 mA selon la surface.
 * Chaque différentiel protège au maximum 8 circuits.
 */
export function sizeDifferentials(area, circuitCount) {
  let list
  if (area <= 35) list = [{ rating: 25, type: 'AC' }, { rating: 40, type: 'A' }]
  else if (area <= 100) list = [{ rating: 40, type: 'AC' }, { rating: 40, type: 'AC' }, { rating: 40, type: 'A' }]
  else list = [{ rating: 40, type: 'AC' }, { rating: 40, type: 'AC' }, { rating: 40, type: 'AC' }, { rating: 40, type: 'A' }]

  // au moins un différentiel par tranche de 8 circuits
  const needed = Math.max(list.length, Math.ceil(circuitCount / 8))
  while (list.length < needed) list.push({ rating: 40, type: 'AC' })

  return list.map((d, i) => ({
    ...d,
    id: `id-${i + 1}`,
    label: `Inter. différentiel ${d.rating} A type ${d.type}`,
    note: d.type === 'A'
      ? 'Type A obligatoire : il protège les circuits plaque de cuisson, lave-linge et borne de recharge, qui peuvent générer des courants de fuite continus.'
      : 'Type AC pour les circuits courants (prises, éclairage).',
  }))
}

function buildWarnings(specialCount, rooms) {
  const warnings = []
  if (specialCount < 3) {
    warnings.push("La norme impose au moins 3 circuits spécialisés dans un logement (typiquement four, lave-vaisselle et lave-linge).")
  }
  if (!rooms.some(r => r.type === 'cuisine')) {
    warnings.push("Aucune cuisine identifiée : pensez à typer vos pièces pour que le contrôle de conformité soit pertinent.")
  }
  const sdb = rooms.filter(r => r.type === 'sdb')
  if (sdb.length) {
    warnings.push("Salle de bain : respectez les volumes de sécurité. Aucun appareillage dans le volume 0 et 1, matériel IPX4 minimum en volume 2, et liaison équipotentielle sur toutes les canalisations métalliques.")
  }
  return warnings
}

/* ------------------------------------------------ hauteurs réglementaires */

export const MOUNTING_HEIGHTS = {
  prise: { min: 5, max: 130, typical: 25, label: 'Prise 16 A', note: "Axe entre 5 cm et 1,30 m du sol fini. En cuisine, les prises du plan de travail se posent à 1,10 m." },
  'prise-plan-travail': { min: 100, max: 130, typical: 110, label: 'Prise plan de travail', note: 'Au moins 8 cm au-dessus du plan de travail.' },
  interrupteur: { min: 90, max: 130, typical: 110, label: 'Interrupteur', note: "Axe entre 0,90 m et 1,30 m, à environ 15 cm du bord de la porte, côté poignée." },
  'point-lumineux': { min: 0, max: 0, typical: 250, label: 'Point lumineux', note: 'En plafond, avec une boîte DCL équipée de son fil de terre.' },
  applique: { min: 160, max: 200, typical: 180, label: 'Applique murale', note: 'Au-dessus du lavabo : hors volume 1 et 2 si non IPX4.' },
  tableau: { min: 90, max: 180, typical: 120, label: 'Tableau électrique', note: "Poignées des appareils entre 0,90 m et 1,80 m du sol. Dans la GTL, en volume dédié de 60 cm de large." },
  rj45: { min: 5, max: 130, typical: 25, label: 'Prise RJ45', note: 'Même hauteur que les prises de courant.' },
  tv: { min: 5, max: 130, typical: 25, label: 'Prise TV', note: 'Prévoir une prise 16 A à côté.' },
}

/** Sections de câble admissibles par calibre de disjoncteur */
export const CABLE_SECTIONS = [
  { section: 1.5, breaker: 16, usage: 'Éclairage, VMC, volets roulants' },
  { section: 2.5, breaker: 20, usage: 'Prises de courant, lave-linge, lave-vaisselle, four' },
  { section: 4, breaker: 25, usage: 'Chauffage électrique jusqu\'à 5 750 W' },
  { section: 6, breaker: 32, usage: 'Plaque de cuisson, borne de recharge' },
]

/* ================================================================== */
/*  Installation dessinée : circuits, cheminement des gaines, contrôle  */
/* ================================================================== */

/** Chemin orthogonal entre deux points, coude gardé à l'intérieur si possible */
function orthogonalPath(from, to, isInside) {
  if (Math.abs(from.x - to.x) < 1 || Math.abs(from.y - to.y) < 1) return [from, to]
  const c1 = { x: to.x, y: from.y }
  const c2 = { x: from.x, y: to.y }
  const ok1 = isInside(c1)
  const ok2 = isInside(c2)
  if (ok1 && !ok2) return [from, c1, to]
  if (ok2 && !ok1) return [from, c2, to]
  return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? [from, c1, to] : [from, c2, to]
}

function pathLength(points) {
  let total = 0
  for (let i = 0; i < points.length - 1; i++) total += dist(points[i], points[i + 1])
  return total
}

/**
 * Répartit les appareils placés en circuits.
 *
 * On regroupe pièce par pièce, comme le ferait un électricien, puis on ouvre un
 * nouveau circuit dès que la limite de points est atteinte. Chaque appareil
 * spécialisé prend son propre circuit, comme l'impose la norme.
 */
export function assignCircuits(devices, rooms) {
  const roomOf = (device) => rooms.find(r => pointInPolygon(device.point, r.points)) || null

  const circuits = []
  const groupByCategory = { sockets: [], lights: [], network: [], tv: [] }

  for (const device of devices) {
    const spec = ITEM_BY_ID[device.type]
    if (!spec || spec.category === 'panel') continue
    if (spec.category === 'special') {
      circuits.push({
        id: `spe-${device.id}`,
        label: spec.label,
        kind: 'special',
        section: spec.section,
        breaker: spec.breaker,
        devices: [device],
        differentialType: ['plaque', 'lave-linge'].includes(spec.special) ? 'A' : 'AC',
      })
    } else {
      groupByCategory[spec.category].push({ ...device, room: roomOf(device) })
    }
  }

  const pack = (list, kind, label, limit, section, breaker) => {
    // regroupement par pièce pour garder des circuits cohérents sur le terrain
    const byRoom = new Map()
    for (const device of list) {
      const key = device.room?.id || 'hors-piece'
      if (!byRoom.has(key)) byRoom.set(key, [])
      byRoom.get(key).push(device)
    }
    let current = null
    let index = 0
    for (const [, group] of byRoom) {
      for (const device of group) {
        if (!current || current.devices.length >= limit) {
          index += 1
          current = {
            id: `${kind}-${index}`,
            label: `${label} ${index}`,
            kind,
            section,
            breaker,
            devices: [],
            differentialType: 'AC',
          }
          circuits.push(current)
        }
        current.devices.push(device)
      }
    }
  }

  pack(groupByCategory.sockets, 'sockets', 'Prises', CIRCUIT_LIMITS.sockets.perCircuit, 2.5, 20)
  pack(groupByCategory.lights, 'lights', 'Éclairage', CIRCUIT_LIMITS.lights.perCircuit, 1.5, 16)
  if (groupByCategory.network.length) {
    circuits.push({
      id: 'reseau', label: 'Réseau RJ45', kind: 'network', section: 0, breaker: 0,
      devices: groupByCategory.network, differentialType: null,
    })
  }
  if (groupByCategory.tv.length) {
    circuits.push({
      id: 'tv', label: 'Antenne TV', kind: 'tv', section: 0, breaker: 0,
      devices: groupByCategory.tv, differentialType: null,
    })
  }

  return circuits
}

/**
 * Trace les gaines, circuit par circuit.
 *
 * Le cheminement part du tableau et enchaîne les appareils du plus proche au
 * plus proche, en tracés strictement horizontaux et verticaux : la norme
 * interdit les diagonales pour qu'on puisse deviner où passent les câbles
 * avant de percer un mur.
 */
export function routeElectrical(circuits, panel, rooms) {
  const isInside = (p) => rooms.some(r => pointInPolygon(p, r.points))
  const routes = []

  for (const circuit of circuits) {
    const remaining = [...circuit.devices]
    let cursor = panel
    const points = [panel]
    let horizontal = 0

    while (remaining.length) {
      let bestIndex = 0
      let bestDist = Infinity
      for (let i = 0; i < remaining.length; i++) {
        const d = dist(cursor, remaining[i].point)
        if (d < bestDist) { bestDist = d; bestIndex = i }
      }
      const next = remaining.splice(bestIndex, 1)[0]
      const leg = orthogonalPath(cursor, next.point, isInside)
      horizontal += pathLength(leg)
      points.push(...leg.slice(1))
      cursor = next.point
    }

    // remontées et descentes verticales jusqu'à chaque appareil
    const vertical = circuit.devices.reduce((sum, device) => {
      const spec = ITEM_BY_ID[device.type]
      if (!spec) return sum
      return sum + (spec.layer === 'plafond'
        ? Math.max(0, 250 - spec.height) + 30
        : spec.height + 30)
    }, 0)

    routes.push({
      id: `route-${circuit.id}`,
      circuitId: circuit.id,
      points,
      length: horizontal + vertical,
      horizontal,
      vertical,
      color: circuit.kind === 'lights' ? '#F59E0B'
        : circuit.kind === 'special' ? '#DC2626'
          : circuit.kind === 'sockets' ? '#2563EB' : '#16A34A',
    })
  }

  return routes
}

/**
 * Compare l'installation dessinée aux minimums de la norme, pièce par pièce.
 */
export function checkCompliance(rooms, devices) {
  const results = []
  for (const room of rooms) {
    if (room.type === 'garage' || room.type === 'cellier') continue
    const inRoom = devices.filter(d => pointInPolygon(d.point, room.points))
    const count = (categories) => inRoom.filter(d => {
      const spec = ITEM_BY_ID[d.type]
      return spec && categories.includes(spec.category)
    }).length

    const need = minimumEquipment(room.type, room.area)
    const placedSockets = inRoom.filter(d => ['prise', 'prise-plan'].includes(d.type)).length
    const placedLights = inRoom.filter(d => ['point-lumineux', 'applique'].includes(d.type)).length
    const placedNetwork = count(['network'])

    const issues = []
    if (placedSockets < need.sockets) {
      issues.push(`${need.sockets - placedSockets} prise${need.sockets - placedSockets > 1 ? 's' : ''} manquante${need.sockets - placedSockets > 1 ? 's' : ''}`)
    }
    if (placedLights < need.lights) {
      issues.push(`${need.lights - placedLights} point${need.lights - placedLights > 1 ? 's' : ''} lumineux manquant${need.lights - placedLights > 1 ? 's' : ''}`)
    }
    if (need.network && placedNetwork < need.network) {
      issues.push('prise RJ45 manquante')
    }
    if (room.type === 'cuisine' && room.area >= 4) {
      const plan = inRoom.filter(d => d.type === 'prise-plan').length
      if (plan < 4) issues.push(`${4 - plan} prise(s) de plan de travail manquante(s)`)
    }

    results.push({
      room,
      need,
      placedSockets,
      placedLights,
      placedNetwork,
      issues,
      compliant: issues.length === 0,
    })
  }
  return results
}

/**
 * Analyse complète d'une installation dessinée : circuits, gaines, protections,
 * quantitatif et conformité.
 */
export function computeElectrical(plan, surfaces) {
  const devices = (plan.electrical || []).filter(d => ITEM_BY_ID[d.type])
  const rooms = surfaces.rooms || []
  const panelDevice = devices.find(d => d.type === 'tableau')
  const panel = panelDevice?.point || autoPanel(rooms)

  const powered = devices.filter(d => d.type !== 'tableau')
  const circuits = assignCircuits(powered, rooms)
  const routes = routeElectrical(circuits, panel, rooms)
  const compliance = checkCompliance(rooms, powered)

  const conduitLength = routes.reduce((s, r) => s + r.length, 0) / 100
  const byCircuitKind = {}
  for (const circuit of circuits) {
    const route = routes.find(r => r.circuitId === circuit.id)
    const key = circuit.section || 'courant-faible'
    byCircuitKind[key] = (byCircuitKind[key] || 0) + (route?.length || 0) / 100
  }

  const powerCircuits = circuits.filter(c => c.breaker > 0)
  const differentials = sizeDifferentials(
    rooms.reduce((s, r) => s + r.area, 0),
    powerCircuits.length,
  )
  const needsTypeA = circuits.some(c => c.differentialType === 'A')

  return {
    devices,
    powered,
    panel,
    panelPlaced: !!panelDevice,
    circuits,
    routes,
    compliance,
    differentials,
    needsTypeA,
    totals: {
      conduitLength,
      cableLength: conduitLength * 3, // trois conducteurs par circuit
      boxes: powered.length,
      breakers: powerCircuits.length,
      bySection: byCircuitKind,
      devices: powered.length,
    },
    warnings: buildInstallWarnings(circuits, compliance, !!panelDevice),
  }
}

function autoPanel(rooms) {
  const entry = rooms.find(r => r.type === 'entree') || rooms.find(r => r.type === 'couloir') || rooms[0]
  return entry ? { x: Math.round(entry.centroid.x), y: Math.round(entry.centroid.y) } : { x: 0, y: 0 }
}

function buildInstallWarnings(circuits, compliance, panelPlaced) {
  const warnings = []

  if (!panelPlaced) {
    warnings.push({
      level: 'warning',
      text: "Le tableau électrique n'est pas placé. Il est positionné automatiquement dans l'entrée pour le calcul : posez-le à son emplacement réel pour obtenir les bonnes longueurs de gaine.",
    })
  }

  const specials = circuits.filter(c => c.kind === 'special').length
  if (specials < 3) {
    warnings.push({
      level: 'error',
      text: `Seulement ${specials} circuit${specials > 1 ? 's' : ''} spécialisé${specials > 1 ? 's' : ''} sur les 3 exigés par la NF C 15-100. Ajoutez au minimum le four, le lave-vaisselle et le lave-linge.`,
    })
  }

  const nonCompliant = compliance.filter(c => !c.compliant)
  for (const item of nonCompliant) {
    warnings.push({
      level: 'warning',
      text: `${item.room.name} : ${item.issues.join(', ')}.`,
    })
  }

  const overloaded = circuits.filter(c =>
    (c.kind === 'sockets' && c.devices.length > CIRCUIT_LIMITS.sockets.perCircuit) ||
    (c.kind === 'lights' && c.devices.length > CIRCUIT_LIMITS.lights.perCircuit))
  for (const circuit of overloaded) {
    warnings.push({ level: 'error', text: `${circuit.label} dépasse le nombre de points autorisés.` })
  }

  warnings.push({
    level: 'info',
    text: "Toute installation neuve doit être contrôlée par le CONSUEL avant sa mise en service par Enedis, y compris en auto-construction.",
  })

  return warnings
}
