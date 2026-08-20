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
import { planElectricalNeeds, computeElectrical } from './electrical'
import { computePlumbing } from './plumbing'
import { coverageArea } from './render3d'

/* ---------------------------------------------------------------- le plan */

/** Épaisseur d'un plancher intermédiaire : hourdis, dalle de compression et chape */
export const FLOOR_THICKNESS = 25

export function createEmptyLevel(index) {
  return {
    id: index === 0 ? 'rdc' : `n${index}`,
    name: index === 0 ? 'Rez-de-chaussée' : `Étage ${index}`,
    ceilingHeight: 250,
    walls: [],
    openings: [],
    roomMeta: [],
    equipment: [],
    electrical: [],
  }
}

export function createEmptyPlan() {
  return {
    levels: [createEmptyLevel(0)],
    stairs: [],
    floorThickness: FLOOR_THICKNESS,
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
    diy: {},
    diyDefault: false,
    priceLevel: 'typ',
    priceOverrides: {},
  }
}

/**
 * Complète un plan chargé depuis le stockage.
 *
 * Les plans d'avant le passage aux étages n'ont pas de pile de niveaux : leurs
 * murs, ouvertures et équipements sont repris tels quels comme rez-de-chaussée,
 * sans rien perdre.
 */
export function normalisePlan(plan) {
  const base = createEmptyPlan()
  if (!plan) return base

  let levels = Array.isArray(plan.levels) && plan.levels.length ? plan.levels : null
  if (!levels) {
    levels = [{
      ...createEmptyLevel(0),
      ceilingHeight: plan.ceilingHeight || 250,
      walls: plan.walls || [],
      openings: plan.openings || [],
      roomMeta: plan.roomMeta || [],
      equipment: plan.equipment || [],
      electrical: plan.electrical || [],
    }]
  }

  const merged = {
    ...base,
    ...plan,
    levels: levels.map((level, i) => ({ ...createEmptyLevel(i), ...level })),
    stairs: plan.stairs || [],
    floorThickness: plan.floorThickness ?? FLOOR_THICKNESS,
    roof: { ...base.roof, ...(plan.roof || {}) },
    foundation: { ...base.foundation, ...(plan.foundation || {}) },
    slab: { ...base.slab, ...(plan.slab || {}) },
    options: { ...base.options, ...(plan.options || {}) },
    diy: { ...(plan.diy || {}) },
    priceOverrides: { ...(plan.priceOverrides || {}) },
  }

  // Les champs de l'ancien modèle sont retirés une fois repris dans le niveau :
  // les laisser traîner à la racine ferait cohabiter deux vérités.
  for (const key of ['walls', 'openings', 'roomMeta', 'equipment', 'electrical', 'ceilingHeight']) {
    delete merged[key]
  }
  return merged
}

/** Altitude du plancher fini d'un niveau, en cm au-dessus de la dalle basse */
export function levelElevation(plan, index) {
  let z = 0
  for (let i = 0; i < index && i < plan.levels.length; i++) {
    z += (plan.levels[i].ceilingHeight || 250) + (plan.floorThickness ?? FLOOR_THICKNESS)
  }
  return z
}

/**
 * Vue d'un niveau ayant la forme d'un plan complet.
 *
 * Tous les calculs — surfaces, plomberie, électricité — travaillent sur un
 * niveau à la fois. Leur présenter un objet de la même forme qu'auparavant
 * évite de les réécrire et garantit qu'ils restent justes étage par étage.
 */
export function levelPlan(plan, index = 0) {
  const safe = Math.max(0, Math.min(index, plan.levels.length - 1))
  const level = plan.levels[safe] || createEmptyLevel(0)
  return {
    ...plan,
    ...level,
    levelIndex: safe,
    elevation: levelElevation(plan, safe),
    isTopLevel: safe === plan.levels.length - 1,
  }
}

/** Chaque niveau, vu comme un plan complet */
export function eachLevel(plan) {
  return plan.levels.map((_, i) => levelPlan(plan, i))
}

/* -------------------------------------------------- résolution des pièces */

/**
 * Devinette du type de pièce tant que l'utilisateur ne l'a pas renseigné.
 * Les pièces arrivent triées par surface décroissante : la plus grande est
 * presque toujours le séjour, les suivantes se devinent à la surface.
 */
function guessRoomType(area, rank) {
  if (rank === 0) return 'sejour'
  if (area <= 2.5) return 'wc'
  if (area <= 6) return 'sdb'
  if (area <= 8) return 'couloir'
  return 'chambre'
}

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
    const type = meta?.type || guessRoomType(room.area, index)
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
  const partitions = interiorWalls.filter(w => w.kind !== 'porteur' && w.kind !== 'garde-corps')
  const railings = classified.filter(w => w.kind === 'garde-corps')

  const h = (plan.ceilingHeight || 250) / 100
  const exteriorLength = exteriorWalls.reduce((s, w) => s + wallLength(w), 0) / 100
  const interiorBearingLength = interiorBearing.reduce((s, w) => s + wallLength(w), 0) / 100
  const partitionLength = partitions.reduce((s, w) => s + wallLength(w), 0) / 100
  const railingLength = railings.reduce((s, w) => s + wallLength(w), 0) / 100

  // Une terrasse compte dans l'emprise mais jamais dans la surface habitable
  const indoorRooms = rooms.filter(r => !r.typeInfo?.outdoor)
  const outdoorRooms = rooms.filter(r => r.typeInfo?.outdoor)
  const floorArea = indoorRooms.reduce((s, r) => s + r.area, 0)
  const terraceArea = outdoorRooms.reduce((s, r) => s + r.area, 0)
  const terracePerimeter = outdoorRooms.reduce((s, r) => s + r.perimeter, 0)
  const footprint = contour.area || floorArea + terraceArea
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

  // Toiture : mesurée sur les pans réellement engendrés, ce qui reste juste
  // quelle que soit la forme de l'emprise.
  const roofArea = coverageArea(walls, plan.roof)

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
    railingLength: round2(railingLength),
    exteriorWallArea: round2(exteriorWallArea),
    interiorBearingArea: round2(interiorBearingArea),
    partitionArea: round2(partitionArea),
    gableArea: round2(gableArea),
    exteriorOpeningArea: round2(exteriorOpeningArea),
    roofArea: round2(roofArea),
    ceilingHeight: h,
    volume: round2(floorArea * h),
    indoorRooms,
    outdoorRooms,
    terraceArea: round2(terraceArea),
    terracePerimeter: round2(terracePerimeter),
  }
}

/**
 * Surfaces de l'ensemble du bâtiment, niveau par niveau.
 * L'emprise au sol reste celle du rez-de-chaussée ; la surface habitable
 * cumule les niveaux.
 */
export function computeBuildingSurfaces(rawPlan) {
  // Un plan d'avant les étages, ou construit à la main, n'a pas de pile de
  // niveaux : on le normalise plutôt que d'échouer.
  const plan = Array.isArray(rawPlan?.levels) && rawPlan.levels.length
    ? rawPlan
    : normalisePlan(rawPlan)
  const levels = eachLevel(plan).map(view => ({
    level: view,
    surfaces: computeSurfaces(view),
  }))
  const ground = levels[0]
  const top = levels[levels.length - 1]

  return {
    levels,
    ground: ground.surfaces,
    top: top.surfaces,
    levelCount: levels.length,
    floorArea: round2(levels.reduce((s, l) => s + l.surfaces.floorArea, 0)),
    terraceArea: round2(levels.reduce((s, l) => s + l.surfaces.terraceArea, 0)),
    footprint: ground.surfaces.footprint,
    perimeter: ground.surfaces.perimeter,
    volume: round2(levels.reduce((s, l) => s + l.surfaces.volume, 0)),
    rooms: levels.flatMap(l => l.surfaces.rooms.map(r => ({ ...r, levelName: l.level.name }))),
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
export function computeQuantities(rawPlan) {
  const plan = Array.isArray(rawPlan?.levels) && rawPlan.levels.length
    ? rawPlan
    : normalisePlan(rawPlan)
  const building = computeBuildingSurfaces(plan)
  const levels = building.levels
  const ground = levels[0].surfaces
  const top = levels[levels.length - 1].surfaces
  const opts = plan.options || {}
  const isNew = opts.mode !== 'renovation'

  // Les ouvrages se répètent d'un niveau à l'autre : on cumule les quantités
  // sur une seule ligne plutôt que d'en empiler une par étage.
  const byItem = new Map()
  const add = (itemId, qty, stage, detail) => {
    if (!PRICE_BY_ID[itemId]) return
    if (!qty || qty <= 0) return
    const existing = byItem.get(itemId)
    if (existing) {
      existing.qty = round2(existing.qty + qty)
      if (detail && !existing.detail?.includes(detail)) {
        existing.detail = existing.detail ? `${existing.detail} · ${detail}` : detail
      }
      return
    }
    byItem.set(itemId, { itemId, qty: round2(qty), stage, detail })
  }

  const fnd = plan.foundation || {}
  const slab = plan.slab || {}
  const structure = STRUCTURE_BY_ID[plan.structure] || STRUCTURE_BY_ID.parpaing
  const multi = levels.length > 1

  /* ================= Ouvrages comptés une seule fois ================= */

  if (isNew) {
    const footingLength = ground.perimeter + ground.interiorBearingLength
    add('terrassement', ground.footprint * 0.4, STAGE.TERRASSEMENT,
      `Décapage sur l'emprise de ${ground.footprint} m²`)
    add('fouilles', footingLength * 0.6 * ((fnd.depth || 80) / 100), STAGE.TERRASSEMENT,
      `${round2(footingLength)} ml de rigole, profondeur ${fnd.depth || 80} cm`)
    add('fondation-beton', footingLength * ((fnd.footingWidth || 50) / 100) * ((fnd.footingHeight || 30) / 100), STAGE.FONDATION,
      `Semelle filante ${fnd.footingWidth || 50} × ${fnd.footingHeight || 30} cm sur ${round2(footingLength)} ml`)
    add('soubassement', footingLength * ((fnd.soubassement || 50) / 100), STAGE.FONDATION,
      `Élévation de ${fnd.soubassement || 50} cm entre semelle et dalle`)
    add('herisson', ground.footprint, STAGE.FONDATION, `${slab.herisson || 20} cm de concassé compacté`)
    add('isolation-sous-dalle', ground.footprint, STAGE.FONDATION, `Panneaux de ${slab.insulation || 12} cm`)
    add('dalle-beton', ground.footprint, STAGE.FONDATION, `Dalle de ${slab.thickness || 15} cm`)

    // Un plancher par niveau supplémentaire
    for (let i = 1; i < levels.length; i++) {
      const s = levels[i].surfaces
      add('plancher-intermediaire', s.footprint, STAGE.FONDATION,
        `${levels[i].level.name} sur ${s.footprint} m²`)
    }

    const roofKind = plan.roof?.kind
    if (roofKind !== 'plat') {
      const charpente = opts.amenagedAttic ? 'charpente-traditionnelle' : 'charpente-fermettes'
      add(charpente, top.footprint, STAGE.COUVERTURE, `Sur une emprise de ${top.footprint} m²`)
      add('couverture-tuiles', top.roofArea, STAGE.COUVERTURE,
        `${top.roofArea} m² de rampant, pente ${plan.roof?.pitch || 35}°`)
    }
    add('zinguerie', top.perimeter * 0.6, STAGE.COUVERTURE, 'Gouttières sur les rives basses')
    add('isolation-combles', top.floorArea, STAGE.SECOND,
      `Isolation en plafond du dernier niveau sur ${top.floorArea} m²`)
  }

  // Escaliers
  for (const stair of plan.stairs || []) {
    add('escalier', 1, STAGE.FINITION,
      `${levels[stair.levelFrom]?.level.name || 'Niveau'} vers le niveau supérieur`)
  }

  /* ==================== Ouvrages répétés par niveau ==================== */

  for (const { level, surfaces: s } of levels) {
    const name = level.name

    if (isNew) {
      add(structure.wallItem, s.exteriorWallArea + s.interiorBearingArea, STAGE.ELEVATION,
        `${name} : ${s.exteriorLength} ml de murs extérieurs`)
      const lintelLength = (level.openings || []).reduce((sum, o) => sum + (o.width / 100) * 1.4, 0)
      add('chainage', s.perimeter + s.interiorBearingLength + lintelLength, STAGE.ELEVATION,
        `${name} : chaînage en tête de mur et linteaux`)
      if (opts.externalRender) {
        add('enduit-exterieur', s.exteriorWallArea, STAGE.ELEVATION, `${name} : ${s.exteriorWallArea} m² de façade`)
      }
    }

    if (structure.needsInsulation || !isNew) {
      add('isolation-murs', s.exteriorWallArea, STAGE.SECOND, `${name} : ${s.exteriorWallArea} m²`)
    }
    add('doublage-placo', s.exteriorWallArea, STAGE.SECOND, `${name}`)
    add('cloison-ba13', s.partitionArea, STAGE.SECOND, `${name} : ${s.partitionLength} ml de cloisons`)
    add('plafond-placo', s.floorArea, STAGE.SECOND, `${name} : ${s.floorArea} m²`)
    add('bandes-enduit', s.exteriorWallArea + s.partitionArea * 2 + s.floorArea, STAGE.SECOND,
      `${name}`)

    // Terrasses : étanchéité seulement au-dessus d'un volume habité
    if (s.terraceArea > 0) {
      if (level.levelIndex > 0) {
        add('etancheite-terrasse', s.terraceArea, STAGE.COUVERTURE,
          `${name} : ${s.terraceArea} m² au-dessus du niveau inférieur`)
      }
      add('garde-corps', s.railingLength || s.terracePerimeter * 0.8, STAGE.FINITION,
        `${name} : ${round2(s.railingLength || s.terracePerimeter * 0.8)} ml exposés`)
    }

    /* --- Menuiseries --- */
    const byKind = {}
    for (const o of level.openings || []) byKind[o.kind] = (byKind[o.kind] || 0) + 1
    add('fenetre', byKind.fenetre || 0, STAGE.SECOND, null)
    add('baie-vitree', byKind.baie || 0, STAGE.SECOND, null)
    add('porte-entree', byKind['porte-entree'] || 0, STAGE.SECOND, null)
    add('porte-interieure', byKind.porte || 0, STAGE.FINITION, null)
    add('garage-porte', byKind['porte-garage'] || 0, STAGE.SECOND, null)

    /* --- Revêtements --- */
    const floorByMaterial = {}
    for (const room of s.rooms) {
      const material = room.typeInfo?.floor
      if (!material) continue
      floorByMaterial[material] = (floorByMaterial[material] || 0) + room.area
    }
    add('chape', s.floorArea, STAGE.FINITION, `${name} : ravoirage pour noyer les gaines`)
    for (const [material, area] of Object.entries(floorByMaterial)) {
      add(material, area, STAGE.FINITION, name)
    }

    const faienceArea = s.rooms.reduce((sum, r) => {
      if (r.type === 'sdb') return sum + r.perimeter * 1.3
      if (r.type === 'cuisine') return sum + 4
      return sum
    }, 0)
    add('faience', faienceArea, STAGE.FINITION, 'Salles de bain et crédences')

    const paintArea = s.indoorRooms.reduce((sum, r) => sum + r.perimeter * s.ceilingHeight, 0) + s.floorArea
    add('peinture', Math.max(0, paintArea - s.exteriorOpeningArea), STAGE.FINITION, `${name}`)
  }

  /* ========================= Électricité ========================= */

  const drawnElec = levels.reduce((n, l) => n + (l.level.electrical || []).filter(d => d.type !== 'tableau').length, 0)

  if (drawnElec > 0) {
    let devices = 0
    let conduit = 0
    let circuits = 0
    const specials = new Set()
    for (const { level, surfaces } of levels) {
      if (!(level.electrical || []).length) continue
      const install = computeElectrical(level, surfaces)
      devices += install.totals.devices
      conduit += install.totals.conduitLength
      circuits += install.circuits.length
      for (const c of install.circuits.filter(c => c.kind === 'special')) specials.add(c.label)
    }
    add('tableau-electrique', 1, STAGE.SECOND, `${circuits} circuits sur l'ensemble du bâtiment`)
    add('point-electrique', devices, STAGE.SECOND,
      `Relevé sur le plan : ${devices} points, ${conduit.toFixed(0)} m de gaine`)
    add('circuit-specialise', specials.size, STAGE.SECOND, [...specials].join(', '))
  } else {
    const elec = planElectricalNeeds(building.rooms, opts)
    add('tableau-electrique', 1, STAGE.SECOND,
      `${elec.circuits.length} circuits, ${elec.differentials.length} interrupteurs différentiels`)
    add('point-electrique', elec.totalPoints, STAGE.SECOND,
      `Minimums NF C 15-100 : ${elec.sockets} prises, ${elec.lights} points lumineux`)
    add('circuit-specialise', elec.specialCircuits.length, STAGE.SECOND,
      elec.specialCircuits.map(c => c.label).join(', '))
  }
  if (isNew) add('consuel', 1, STAGE.DIVERS, 'Contrôle obligatoire avant mise en service')

  /* ========================== Plomberie ========================== */

  const placedTotal = levels.reduce((n, l) => n + (l.level.equipment || []).length, 0)

  if (placedTotal > 0) {
    let waterPoints = 0
    let drainLength = 0
    const counts = {}
    for (const { level, surfaces } of levels) {
      const placed = level.equipment || []
      if (!placed.length) continue
      const network = computePlumbing(level, surfaces)
      waterPoints += network.totals.waterPoints
      drainLength += network.totals.drainTotal
      for (const e of placed) counts[e.type] = (counts[e.type] || 0) + 1
    }
    add('point-eau', waterPoints, STAGE.SECOND, `Relevé sur ${placedTotal} appareils placés`)
    add('evacuation', drainLength * 1.15, STAGE.SECOND,
      `Réseau tracé : ${drainLength.toFixed(1)} ml, majorés de 15 % pour les chutes et reprises`)
    add('sanitaire-wc', counts.wc || 0, STAGE.FINITION, null)
    add('sanitaire-douche', (counts.douche || 0) + (counts.baignoire || 0), STAGE.FINITION, null)
    add('sanitaire-lavabo', counts.lavabo || 0, STAGE.FINITION, null)
    add('sanitaire-evier', counts.evier || 0, STAGE.FINITION, null)
  } else {
    const rooms = building.rooms
    const sdbCount = rooms.filter(r => r.type === 'sdb').length
    const wcCount = rooms.filter(r => r.type === 'wc').length + sdbCount
    const kitchenCount = rooms.filter(r => r.type === 'cuisine').length
    const laundryCount = rooms.filter(r => r.type === 'buanderie').length
    const wetRooms = rooms.filter(r => r.typeInfo?.wet)
    add('point-eau', sdbCount * 2 + wcCount + kitchenCount + laundryCount, STAGE.SECOND,
      `${sdbCount} salle(s) de bain, ${wcCount} WC, ${kitchenCount} cuisine(s)`)
    add('evacuation', wetRooms.length * 6 + 8 + (multi ? 6 : 0), STAGE.SECOND,
      'Estimation forfaitaire — placez les appareils dans l\'onglet Plomberie pour un métré exact')
    add('sanitaire-wc', wcCount, STAGE.FINITION, null)
    add('sanitaire-douche', sdbCount, STAGE.FINITION, null)
    add('sanitaire-lavabo', sdbCount, STAGE.FINITION, null)
    add('sanitaire-evier', kitchenCount, STAGE.FINITION, null)
  }

  if (opts.hotWater === 'thermodynamique') add('chauffe-eau', 1, STAGE.SECOND, 'Ballon 200 L')
  if (opts.vmc) add('vmc', 1, STAGE.SECOND, 'Réseau double flux avec bouches dans chaque pièce')

  if (opts.heating === 'plancher') {
    add('plancher-chauffant', building.floorArea, STAGE.SECOND, `Sur ${building.floorArea} m² habitables`)
    add('pac-air-eau', 1, STAGE.SECOND, 'Générateur alimentant le plancher chauffant')
  } else if (opts.heating === 'radiateurs') {
    add('pac-air-eau', 1, STAGE.SECOND, 'Générateur alimentant les radiateurs')
    add('radiateur', building.rooms.filter(r => !['garage', 'wc', 'terrasse'].includes(r.type)).length,
      STAGE.SECOND, 'Un émetteur par pièce de vie')
  }

  /* ========================= Frais annexes ========================= */

  if (isNew) {
    add('raccordements', 1, STAGE.DIVERS, 'Eau, électricité et fibre depuis le domaine public')
    if (opts.etudeSol) add('etude-sol', 1, STAGE.DIVERS, 'Étude géotechnique G2 AVP')
    if (opts.assuranceDO) add('assurance-do', 1, STAGE.DIVERS, 'Couverture décennale du maître d\'ouvrage')
    if (opts.assainissement) add('assainissement', 1, STAGE.DIVERS, 'Filière individuelle validée par le SPANC')
  }

  return { lines: [...byItem.values()], surfaces: ground, building }
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
  const { lines, surfaces, building } = computeQuantities(plan)
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

  const habitable = building.floorArea || 1

  return {
    lines: detailed,
    surfaces,
    building,
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
