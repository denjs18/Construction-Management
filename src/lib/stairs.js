/**
 * Escaliers.
 *
 * Le nombre de marches découle de la hauteur d'étage, elle-même donnée par la
 * hauteur sous plafond augmentée de l'épaisseur du plancher. Le giron se déduit
 * ensuite de la loi de Blondel, qui relie hauteur de marche et profondeur pour
 * que le pas reste naturel.
 *
 * Références : NF P01-012 pour les garde-corps, DTU 36.3 pour les escaliers
 * bois. Les valeurs ci-dessous couvrent l'escalier droit d'une maison
 * individuelle.
 */

/** Somme de Blondel : deux hauteurs de marche plus un giron */
export const BLONDEL_MIN = 60
export const BLONDEL_MAX = 65

/** Hauteur de marche confortable, en cm */
export const RISER_MIN = 16
export const RISER_MAX = 19

/** Échappée : hauteur libre au-dessus du nez de marche */
export const HEADROOM = 190

export const STAIR_KINDS = [
  {
    id: 'droit',
    label: 'Droit',
    icon: '📐',
    factor: 1,
    note: "Le plus simple à construire et le plus confortable à emprunter, mais c'est aussi celui qui mange le plus de surface au sol.",
  },
  {
    id: 'quart-tournant',
    label: 'Quart tournant',
    icon: '↰',
    factor: 0.62,
    note: "Un palier ou des marches balancées font gagner de la place. Les marches balancées se calculent : un giron trop court côté intérieur devient dangereux.",
  },
  {
    id: 'colimacon',
    label: 'Colimaçon',
    icon: '🌀',
    factor: 0.3,
    note: "Très compact, mais impraticable pour monter un meuble et pénible au quotidien. À réserver à un accès secondaire.",
  },
]

export const STAIR_KIND_BY_ID = Object.fromEntries(STAIR_KINDS.map(k => [k.id, k]))

/**
 * Dimensionne un escalier pour une hauteur d'étage donnée.
 * @param {number} rise hauteur de plancher fini à plancher fini, en cm
 * @param {string} kind identifiant de STAIR_KINDS
 * @param {number} width emmarchement en cm
 */
export function stairGeometry(rise, kind = 'droit', width = 90) {
  const shape = STAIR_KIND_BY_ID[kind] || STAIR_KINDS[0]
  const steps = Math.max(2, Math.round(rise / 17.5))
  const riser = rise / steps
  // Blondel : 2h + g ≈ 63, borné à un giron praticable
  const tread = Math.max(21, Math.min(34, 63 - 2 * riser))
  const straightRun = (steps - 1) * tread
  const run = straightRun * shape.factor

  // Échappée : la trémie doit s'ouvrir avant que la tête ne touche le plancher
  const clearFrom = Math.max(0, Math.ceil((rise - HEADROOM) / riser))
  const wellLength = Math.max(0, straightRun - (clearFrom - 1) * tread) * shape.factor

  return {
    kind: shape.id,
    steps,
    riser: Math.round(riser * 10) / 10,
    tread: Math.round(tread * 10) / 10,
    run: Math.round(run),
    straightRun: Math.round(straightRun),
    width,
    blondel: Math.round((2 * riser + tread) * 10) / 10,
    wellLength: Math.round(wellLength),
    wellWidth: width + 10,
    footprint: Math.round((run * width) / 100) / 100,
  }
}

/** Contrôles de confort et de sécurité sur un escalier dimensionné */
export function checkStair(geometry) {
  const issues = []

  if (geometry.riser < RISER_MIN || geometry.riser > RISER_MAX) {
    issues.push({
      level: geometry.riser > 21 ? 'error' : 'warning',
      text: `Marches de ${geometry.riser} cm. Le confortable se situe entre ${RISER_MIN} et ${RISER_MAX} cm : au-delà, l'escalier devient fatigant et dangereux à la descente.`,
    })
  }

  if (geometry.blondel < BLONDEL_MIN || geometry.blondel > BLONDEL_MAX) {
    issues.push({
      level: 'warning',
      text: `Somme de Blondel à ${geometry.blondel} cm, hors de la plage ${BLONDEL_MIN} à ${BLONDEL_MAX}. Le pas ne tombera pas naturellement : on trébuche sur ce genre d'escalier.`,
    })
  }

  if (geometry.tread < 24) {
    issues.push({
      level: 'warning',
      text: `Giron de ${geometry.tread} cm. En dessous de 24 cm, le pied ne se pose plus entièrement sur la marche.`,
    })
  }

  if (geometry.width < 80) {
    issues.push({
      level: 'warning',
      text: `Emmarchement de ${geometry.width} cm. 90 cm est le minimum confortable pour croiser quelqu'un ou monter un meuble.`,
    })
  }

  issues.push({
    level: 'info',
    text: `Prévoyez une trémie d'au moins ${(geometry.wellLength / 100).toFixed(2).replace('.', ',')} m sur ${(geometry.wellWidth / 100).toFixed(2).replace('.', ',')} m : c'est ce qu'il faut pour conserver 1,90 m de hauteur libre au-dessus des marches.`,
  })

  issues.push({
    level: 'info',
    text: "Un garde-corps d'un mètre de haut est obligatoire le long de la trémie et de la volée, avec un remplissage tel qu'une sphère de 11 cm ne passe pas.",
  })

  return issues
}

/** Empreinte au sol de l'escalier, pour le plan et la maquette */
export function stairFootprint(stair, geometry) {
  const angle = ((stair.rotation || 0) * Math.PI) / 180
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const nx = -dy
  const ny = dx
  const half = geometry.width / 2
  const origin = stair.point
  const corners = [
    { x: origin.x + nx * half, y: origin.y + ny * half },
    { x: origin.x + dx * geometry.run + nx * half, y: origin.y + dy * geometry.run + ny * half },
    { x: origin.x + dx * geometry.run - nx * half, y: origin.y + dy * geometry.run - ny * half },
    { x: origin.x - nx * half, y: origin.y - ny * half },
  ]
  return { corners, direction: { x: dx, y: dy }, normal: { x: nx, y: ny } }
}
