/**
 * Métré automatique : transforme la géométrie du plan en quantités, puis en
 * coûts matériaux / main d'œuvre.
 *
 * Le principe est celui d'un quantitatif de maître d'œuvre : chaque ouvrage a
 * une unité (m², ml, m³, u), une quantité déduite du plan, un prix de
 * fourniture et un prix de pose. Si l'utilisateur réalise l'ouvrage lui-même,
 * la pose tombe à zéro et on compte des heures de travail à la place.
 */

import {
  detectRooms,
  outerContour,
  classifyWalls,
  totalWallLength,
  wallLength,
  pointInPolygon,
  wallsBoundingBox,
} from './geometry'
import { PRICE_BY_ID, STRUCTURE_BY_ID, ROOM_TYPE_BY_ID, priceOf } from '../data/prices'
import { planElectricalNeeds } from './electrical'

/* ---------------------------------------------------------------- le plan */

export function createEmptyPlan() {
  return {
    walls: [],
    openings: [],
    roomMeta: [],
    ceilingHeight: 250,
    structure: 'parpaing',
    roof: { kind: '2pans', pitch: 35, overhang: 40 },
    foundation: { depth: 80, soubassement: 50, footingWidth: 50, footingHeight: 30 },
    slab: { thickness: 15, herisson: 20, insulation: 12 },
    options: {
      mode: 'neuf', // neuf | renovation
      heating: 'plancher',
      hotWater: 'thermodynamique',
      vmc: true,
      externalRender: true,
      assainissement: false,
      etudeSol: true,
      assuranceDO: true,
    },
    equipment: [],
    electrical: [],
    diy: {},
    diyDefault: false,
    priceLevel: 'typ',
    priceOverrides: {},
  }
}

/** Complète un plan chargé depuis le stockage avec les champs manquants */
export function normalisePlan(plan) {
  const base = createEmptyPlan()
  if (!plan) return base
  return {
    ...base,
    ...plan,
    roof: { ...base.roof, ...(plan.roof || {}) },
    foundation: { ...base.foundation, ...(plan.foundation || {}) },
    slab: { ...base.slab, ...(plan.slab || {}) },
    options: { ...base.options, ...(plan.options || {}) },
    diy: { ...(plan.diy || {}) },
    priceOverrides: { ...(plan.priceOverrides || {}) },
    walls: plan.walls || [],
    openings: plan.openings || [],
    roomMeta: plan.roomMeta || [],
    equipment: plan.equipment || [],
    electrical: plan.electrical || [],
  }
}

/* -------------------------------------------------- résolution des pièces */

const AREA_GUESS = [
  { max: 2.5, type: 'wc' },
  { max: 6, type: 'sdb' },
  { max: 12, type: 'chambre' },
  { max: 1e9, type: 'sejour' },
]

/**
 * Rattache les types de pièces enregistrés aux pièces détectées.
 * L'appariement se fait par point ancré : tant qu'un point sauvegardé reste
 * à l'intérieur du polygone, la pièce garde son nom et son type même si les
 * murs ont bougé.
 */
export function resolveRooms(plan) {
  const rooms = detectRooms(plan.walls || [])
  const used = new Set()

  return rooms.map((room, index) => {
    let meta = null
    for (const candidate of plan.roomMeta || []) {
      if (used.has(candidate.id)) continue
      if (candidate.point && pointInPolygon(candidate.point, room.points)) {
        meta = candidate
        used.add(candidate.id)
        break
      }
    }
    const guessed = AREA_GUESS.find(g => room.area <= g.max).type
    const type = meta?.type || guessed
    const typeInfo = ROOM_TYPE_BY_ID[type] || ROOM_TYPE_BY_ID.autre
    return {
      ...room,
      metaId: meta?.id || null,
      type,
      typeInfo,
      name: meta?.name || typeInfo.label,
      autoTyped: !meta,
    }
  })
}

/* ------------------------------------------------------ surfaces globales */

export function computeSurfaces(plan) {
  const walls = plan.walls || []
  const rooms = resolveRooms(plan)
  const contour = outerContour(walls)
  const classified = classifyWalls(walls, rooms)

  const exteriorWalls = classified.filter(w => w.exterior)
  const interiorWalls = classified.filter(w => !w.exterior)
  const interiorBearing = interiorWalls.filter(w => w.kind === 'porteur')
  const partitions = interiorWalls.filter(w => w.kind !== 'porteur')

  const h = (plan.ceilingHeight || 250) / 100
  const exteriorLength = exteriorWalls.reduce((s, w) => s + wallLength(w), 0) / 100
  const interiorBearingLength = interiorBearing.reduce((s, w) => s + wallLength(w), 0) / 100
  const partitionLength = partitions.reduce((s, w) => s + wallLength(w), 0) / 100

  const floorArea = rooms.reduce((s, r) => s + r.area, 0)
  const footprint = contour.area || floorArea
  const perimeter = contour.perimeter || 0

  // Surfaces d'ouvertures, réparties entre murs extérieurs et cloisons
  const exteriorIds = new Set(exteriorWalls.map(w => w.id))
  let exteriorOpeningArea = 0
  let interiorOpeningArea = 0
  for (const o of plan.openings || []) {
    const area = (o.width * o.height) / 10000
    if (exteriorIds.has(o.wallId)) exteriorOpeningArea += area
    else interiorOpeningArea += area
  }

  // Pignons : surface triangulaire ajoutée par une toiture à 2 pans
  const bbox = wallsBoundingBox(walls)
  const gableWidth = Math.min(bbox.width, bbox.height) / 100
  const pitchRad = ((plan.roof?.pitch || 35) * Math.PI) / 180
  const gableArea = plan.roof?.kind === '2pans'
    ? 2 * (gableWidth * ((gableWidth / 2) * Math.tan(pitchRad))) / 2
    : 0

  const exteriorWallArea = Math.max(0, exteriorLength * h + gableArea - exteriorOpeningArea)
  const partitionArea = Math.max(0, partitionLength * h - interiorOpeningArea)
  const interiorBearingArea = Math.max(0, interiorBearingLength * h)

  // Toiture : surface rampante avec débord
  const roofFootprint = footprint + perimeter * ((plan.roof?.overhang || 0) / 100)
  const roofArea = plan.roof?.kind === 'plat'
    ? roofFootprint
    : roofFootprint / Math.cos(pitchRad)

  return {
    rooms,
    classified,
    exteriorWalls,
    interiorWalls,
    floorArea: round2(floorArea),
    footprint: round2(footprint),
    perimeter: round2(perimeter),
    exteriorLength: round2(exteriorLength),
    interiorBearingLength: round2(interiorBearingLength),
    partitionLength: round2(partitionLength),
    exteriorWallArea: round2(exteriorWallArea),
    interiorBearingArea: round2(interiorBearingArea),
    partitionArea: round2(partitionArea),
    gableArea: round2(gableArea),
    exteriorOpeningArea: round2(exteriorOpeningArea),
    roofArea: round2(roofArea),
    ceilingHeight: h,
    volume: round2(floorArea * h),
  }
}

/* ---------------------------------------------------------------- métré */

const STAGE = {
  TERRASSEMENT: 'terrassement',
  FONDATION: 'fondation',
  ELEVATION: 'elevation',
  COUVERTURE: 'couverture',
  SECOND: 'second-oeuvre',
  FINITION: 'finition',
  DIVERS: 'divers',
}

export const STAGE_LABELS = {
  terrassement: 'Terrassement',
  fondation: 'Fondations et dallage',
  elevation: 'Élévation et structure',
  couverture: 'Charpente et couverture',
  'second-oeuvre': 'Second œuvre',
  finition: 'Finitions',
  divers: 'Frais et raccordements',
}

/** Étapes exclues par défaut en rénovation */
const STRUCTURAL_STAGES = [STAGE.TERRASSEMENT, STAGE.FONDATION, STAGE.ELEVATION, STAGE.COUVERTURE]

/**
 * Produit la liste des ouvrages avec leurs quantités.
 * @returns {Array<{itemId, qty, stage, detail}>}
 */
export function computeQuantities(plan) {
  const s = computeSurfaces(plan)
  const opts = plan.options || {}
  const isNew = opts.mode !== 'renovation'
  const lines = []

  const add = (itemId, qty, stage, detail) => {
    if (!PRICE_BY_ID[itemId]) return
    if (!qty || qty <= 0) return
    lines.push({ itemId, qty: round2(qty), stage, detail })
  }

  const fnd = plan.foundation || {}
  const slab = plan.slab || {}
  const structure = STRUCTURE_BY_ID[plan.structure] || STRUCTURE_BY_ID.parpaing

  /* --- Terrassement et fondations (construction neuve uniquement) --- */
  if (isNew) {
    const footingLength = s.perimeter + s.interiorBearingLength
    add('terrassement', s.footprint * 0.4, STAGE.TERRASSEMENT,
      `Décapage de la terre végétale sur l'emprise de ${s.footprint} m²`)
    add('fouilles', footingLength * 0.6 * ((fnd.depth || 80) / 100), STAGE.TERRASSEMENT,
      `${round2(footingLength)} ml de rigole, largeur 60 cm, profondeur ${fnd.depth || 80} cm`)
    add('fondation-beton', footingLength * ((fnd.footingWidth || 50) / 100) * ((fnd.footingHeight || 30) / 100), STAGE.FONDATION,
      `Semelle filante ${fnd.footingWidth || 50} × ${fnd.footingHeight || 30} cm sur ${round2(footingLength)} ml`)
    add('soubassement', footingLength * ((fnd.soubassement || 50) / 100), STAGE.FONDATION,
      `Élévation de ${fnd.soubassement || 50} cm entre semelle et dalle`)
    add('herisson', s.footprint, STAGE.FONDATION,
      `${slab.herisson || 20} cm de concassé compacté sous la dalle`)
    add('isolation-sous-dalle', s.footprint, STAGE.FONDATION,
      `Panneaux de ${slab.insulation || 12} cm sous la dalle`)
    add('dalle-beton', s.footprint, STAGE.FONDATION,
      `Dalle de ${slab.thickness || 15} cm sur ${s.footprint} m²`)
  }

  /* --- Élévation --- */
  if (isNew) {
    add(structure.wallItem, s.exteriorWallArea + s.interiorBearingArea, STAGE.ELEVATION,
      `${s.exteriorLength} ml de murs extérieurs${s.interiorBearingLength > 0 ? ` et ${s.interiorBearingLength} ml de refends` : ''} sur ${s.ceilingHeight} m de hauteur`)

    const lintelLength = (plan.openings || []).reduce((sum, o) => sum + (o.width / 100) * 1.4, 0)
    add('chainage', s.perimeter + s.interiorBearingLength + lintelLength, STAGE.ELEVATION,
      `Chaînage en tête de mur + ${round2(lintelLength)} ml de linteaux au-dessus des ouvertures`)

    if (opts.externalRender) {
      add('enduit-exterieur', s.exteriorWallArea, STAGE.ELEVATION,
        `Façades sur ${s.exteriorWallArea} m²`)
    }
  }

  /* --- Charpente et couverture --- */
  if (isNew) {
    const roofKind = plan.roof?.kind
    if (roofKind !== 'plat') {
      const charpente = opts.amenagedAttic ? 'charpente-traditionnelle' : 'charpente-fermettes'
      add(charpente, s.footprint, STAGE.COUVERTURE,
        `Charpente sur une emprise de ${s.footprint} m²`)
      add('couverture-tuiles', s.roofArea, STAGE.COUVERTURE,
        `${s.roofArea} m² de rampant, pente ${plan.roof?.pitch || 35}°, débord ${plan.roof?.overhang || 40} cm`)
    }
    add('zinguerie', s.perimeter * 0.6, STAGE.COUVERTURE,
      'Gouttières sur les rives basses de la toiture')
  }

  /* --- Isolation --- */
  const insulatedWallArea = s.exteriorWallArea
  if (structure.needsInsulation || !isNew) {
    add('isolation-murs', insulatedWallArea, STAGE.SECOND,
      `Doublage isolant sur ${insulatedWallArea} m² de murs extérieurs`)
  }
  add('isolation-combles', s.footprint, STAGE.SECOND,
    `Isolation en plafond sur ${s.footprint} m²`)

  /* --- Cloisons et plâtrerie --- */
  add('doublage-placo', insulatedWallArea, STAGE.SECOND,
    `Contre-cloison sur les murs extérieurs`)
  add('cloison-ba13', s.partitionArea, STAGE.SECOND,
    `${s.partitionLength} ml de cloisons de distribution`)
  add('plafond-placo', s.floorArea, STAGE.SECOND,
    `Plafond sur ${s.floorArea} m² habitables`)
  const plasterArea = insulatedWallArea + s.partitionArea * 2 + s.floorArea
  add('bandes-enduit', plasterArea, STAGE.SECOND,
    `Traitement des joints sur ${round2(plasterArea)} m² de plaques`)

  /* --- Électricité --- */
  const elec = planElectricalNeeds(s.rooms, opts)
  add('tableau-electrique', 1, STAGE.SECOND,
    `${elec.circuits.length} circuits, ${elec.differentials.length} interrupteurs différentiels`)
  add('point-electrique', elec.totalPoints, STAGE.SECOND,
    `${elec.sockets} prises, ${elec.lights} points lumineux, ${elec.network} RJ45, ${elec.tv} prises TV`)
  add('circuit-specialise', elec.specialCircuits.length, STAGE.SECOND,
    elec.specialCircuits.map(c => c.label).join(', '))
  if (isNew) add('consuel', 1, STAGE.DIVERS, 'Contrôle obligatoire avant mise en service')

  /* --- Plomberie --- */
  const wetRooms = s.rooms.filter(r => r.typeInfo?.wet)
  const sdbCount = s.rooms.filter(r => r.type === 'sdb').length
  const wcCount = s.rooms.filter(r => r.type === 'wc').length + sdbCount
  const kitchenCount = s.rooms.filter(r => r.type === 'cuisine').length
  const laundryCount = s.rooms.filter(r => r.type === 'buanderie').length

  const waterPoints = sdbCount * 2 + wcCount + kitchenCount + laundryCount
  add('point-eau', waterPoints, STAGE.SECOND,
    `${sdbCount} salle(s) de bain, ${wcCount} WC, ${kitchenCount} cuisine(s)`)
  add('evacuation', wetRooms.length * 6 + 8, STAGE.SECOND,
    `Collecteur principal et antennes vers ${wetRooms.length} pièce(s) humide(s)`)
  add('sanitaire-wc', wcCount, STAGE.FINITION, null)
  add('sanitaire-douche', sdbCount, STAGE.FINITION, null)
  add('sanitaire-lavabo', sdbCount, STAGE.FINITION, null)
  add('sanitaire-evier', kitchenCount, STAGE.FINITION, null)

  if (opts.hotWater === 'thermodynamique') add('chauffe-eau', 1, STAGE.SECOND, 'Ballon 200 L')
  if (opts.vmc) add('vmc', 1, STAGE.SECOND, 'Réseau double flux avec bouches dans chaque pièce')

  if (opts.heating === 'plancher') {
    add('plancher-chauffant', s.floorArea, STAGE.SECOND, `Sur ${s.floorArea} m² habitables`)
    add('pac-air-eau', 1, STAGE.SECOND, 'Générateur alimentant le plancher chauffant')
  } else if (opts.heating === 'radiateurs') {
    add('pac-air-eau', 1, STAGE.SECOND, 'Générateur alimentant les radiateurs')
    add('radiateur', s.rooms.filter(r => r.type !== 'garage' && r.type !== 'wc').length, STAGE.SECOND,
      'Un émetteur par pièce de vie')
  }

  /* --- Menuiseries --- */
  const byKind = {}
  for (const o of plan.openings || []) {
    byKind[o.kind] = (byKind[o.kind] || 0) + 1
  }
  add('fenetre', byKind.fenetre || 0, STAGE.SECOND, null)
  add('baie-vitree', byKind.baie || 0, STAGE.SECOND, null)
  add('porte-entree', byKind['porte-entree'] || 0, STAGE.SECOND, null)
  add('porte-interieure', byKind.porte || 0, STAGE.FINITION, null)
  add('garage-porte', byKind['porte-garage'] || 0, STAGE.SECOND, null)

  /* --- Revêtements et finitions --- */
  const floorByMaterial = {}
  for (const room of s.rooms) {
    const material = room.typeInfo?.floor
    if (!material) continue
    floorByMaterial[material] = (floorByMaterial[material] || 0) + room.area
  }
  add('chape', s.floorArea, STAGE.FINITION, `Ravoirage pour noyer les gaines sur ${s.floorArea} m²`)
  for (const [material, area] of Object.entries(floorByMaterial)) {
    const names = s.rooms.filter(r => r.typeInfo?.floor === material).map(r => r.name)
    add(material, area, STAGE.FINITION, names.join(', '))
  }

  const faienceArea = s.rooms.reduce((sum, r) => {
    if (r.type === 'sdb') return sum + r.perimeter * 1.3
    if (r.type === 'cuisine') return sum + 4
    return sum
  }, 0)
  add('faience', faienceArea, STAGE.FINITION,
    'Salles de bain jusqu\'à 1,30 m de haut et crédence de cuisine')

  const paintArea = s.rooms.reduce((sum, r) => sum + r.perimeter * s.ceilingHeight, 0) + s.floorArea
  add('peinture', paintArea - s.exteriorOpeningArea, STAGE.FINITION,
    `Murs et plafonds de toutes les pièces`)

  /* --- Frais annexes --- */
  if (isNew) {
    add('raccordements', 1, STAGE.DIVERS, 'Eau, électricité et fibre depuis le domaine public')
    if (opts.etudeSol) add('etude-sol', 1, STAGE.DIVERS, 'Étude géotechnique G2 AVP')
    if (opts.assuranceDO) add('assurance-do', 1, STAGE.DIVERS, 'Couverture décennale du maître d\'ouvrage')
    if (opts.assainissement) add('assainissement', 1, STAGE.DIVERS, 'Filière individuelle validée par le SPANC')
  }

  return { lines, surfaces: s, electrical: elec }
}

/* --------------------------------------------------------------- chiffrage */

/** Un ouvrage est-il réalisé par l'utilisateur ? */
export function isDiy(plan, itemId) {
  const item = PRICE_BY_ID[itemId]
  if (!item || item.diy === false) return false
  if (Object.prototype.hasOwnProperty.call(plan.diy || {}, itemId)) return plan.diy[itemId]
  return !!plan.diyDefault
}

/**
 * Chiffrage complet. Renvoie les lignes détaillées, les totaux par lot,
 * par étape, et la comparaison auto-construction / tout entreprise.
 */
export function computeEstimate(plan) {
  const { lines, surfaces, electrical } = computeQuantities(plan)
  const level = plan.priceLevel || 'typ'
  const overrides = plan.priceOverrides || {}

  const detailed = lines.map(line => {
    const item = PRICE_BY_ID[line.itemId]
    const p = priceOf(line.itemId, level, overrides)
    const diy = isDiy(plan, line.itemId)
    const material = line.qty * p.material
    const laborFull = line.qty * p.labor
    const labor = diy ? 0 : laborFull
    const hours = diy ? line.qty * p.hours : 0
    return {
      ...line,
      item,
      label: item.label,
      unit: item.unit,
      lot: item.lot,
      note: item.note,
      canDiy: item.diy !== false,
      diy,
      unitMaterial: p.material,
      unitLabor: p.labor,
      material,
      labor,
      laborFull,
      hours,
      total: material + labor,
      totalPro: material + laborFull,
    }
  })

  const totalMaterial = sum(detailed, l => l.material)
  const totalLabor = sum(detailed, l => l.labor)
  const totalLaborFull = sum(detailed, l => l.laborFull)
  const totalHours = sum(detailed, l => l.hours)
  const total = totalMaterial + totalLabor
  const totalPro = totalMaterial + totalLaborFull

  const byLot = groupTotals(detailed, l => l.lot)
  const byStage = groupTotals(detailed, l => l.stage)

  const habitable = surfaces.floorArea || 1

  return {
    lines: detailed,
    surfaces,
    electrical,
    totalMaterial,
    totalLabor,
    totalLaborFull,
    totalHours,
    total,
    totalPro,
    savings: totalPro - total,
    pricePerM2: total / habitable,
    pricePerM2Pro: totalPro / habitable,
    byLot,
    byStage,
    level,
  }
}

function sum(list, fn) {
  return list.reduce((acc, item) => acc + fn(item), 0)
}

function groupTotals(lines, keyFn) {
  const map = new Map()
  for (const line of lines) {
    const key = keyFn(line)
    if (!map.has(key)) {
      map.set(key, { key, total: 0, material: 0, labor: 0, totalPro: 0, hours: 0, lines: [] })
    }
    const entry = map.get(key)
    entry.total += line.total
    entry.material += line.material
    entry.labor += line.labor
    entry.totalPro += line.totalPro
    entry.hours += line.hours
    entry.lines.push(line)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

const round2 = (v) => Math.round(v * 100) / 100

/** Conversion des heures en journées de chantier de 7 h */
export function hoursToDays(hours) {
  return Math.round((hours / 7) * 10) / 10
}
