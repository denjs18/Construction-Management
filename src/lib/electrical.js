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
