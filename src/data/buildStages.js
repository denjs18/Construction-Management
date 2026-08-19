/**
 * Phases de chantier.
 *
 * Chaque phase relie trois choses : ce qui apparaît dans la maquette 3D, les
 * postes du chiffrage qui lui correspondent, et le guide à lire avant de s'y
 * mettre. C'est ce qui permet de rejouer le chantier du terrain nu à la
 * finition en sachant, à chaque étape, ce que ça coûte et comment s'y prendre.
 */

export const BUILD_STAGES = [
  {
    id: 'terrain',
    label: 'Terrain nu',
    icon: '🌱',
    detail: "Le terrain est décapé de sa terre végétale et le bâtiment implanté au cordeau. Rien n'est encore construit.",
    watch: "L'implantation se vérifie aux diagonales : sur un rectangle, elles doivent être rigoureusement égales.",
    items: ['terrassement', 'etude-sol'],
    guide: null,
  },
  {
    id: 'fouilles',
    label: 'Fouilles et semelles',
    icon: '🕳️',
    detail: "Les rigoles sont creusées jusqu'au niveau hors gel, le ferraillage posé, puis les semelles filantes coulées.",
    watch: "La profondeur hors gel dépend de votre région et de votre sol : de 50 cm à plus de 90 cm. C'est l'étude de sol qui tranche.",
    items: ['fouilles', 'fondation-beton'],
    guide: null,
  },
  {
    id: 'soubassement',
    label: 'Soubassement',
    icon: '🧱',
    detail: "Les murs de fondation montent de la semelle jusqu'au niveau du futur dallage.",
    watch: "C'est le moment de poser les fourreaux de traversée pour l'eau, l'électricité et l'évacuation. Après le coulage, il faudra carotter.",
    items: ['soubassement'],
    guide: null,
  },
  {
    id: 'dalle',
    label: 'Dallage',
    icon: '⬜',
    detail: "Hérisson de concassé, film polyane, isolant sous dalle, treillis soudé, puis coulage et tirage à la règle.",
    watch: "Toutes les réservations d'évacuation doivent être en place avant de couler. Vérifiez-les une dernière fois sur le plan de réservations.",
    items: ['herisson', 'isolation-sous-dalle', 'dalle-beton'],
    guide: null,
  },
  {
    id: 'elevation',
    label: 'Élévation des murs',
    icon: '🏗️',
    detail: "Les murs porteurs montent rang par rang, raidis par les poteaux d'angle coulés au fur et à mesure.",
    watch: "Le premier rang commande tout le reste : posez-le au niveau et d'aplomb, quitte à y passer la journée.",
    items: ['mur-parpaing', 'mur-brique', 'mur-beton-cellulaire', 'mur-ossature-bois'],
    guide: null,
  },
  {
    id: 'chainage',
    label: 'Chaînage et linteaux',
    icon: '➖',
    detail: "La ceinture béton armé fait le tour en tête de mur, et les linteaux franchissent chaque ouverture.",
    watch: "Le chaînage doit être continu et ses aciers correctement recouvrés aux angles. C'est ce qui tient la maison ensemble.",
    items: ['chainage'],
    guide: null,
  },
  {
    id: 'charpente',
    label: 'Charpente',
    icon: '🪵',
    detail: "Les fermes sont levées, alignées et entretoisées, puis la panne faîtière les solidarise.",
    watch: "Le contreventement n'est pas optionnel : une charpente non entretoisée peut se coucher comme un jeu de cartes.",
    items: ['charpente-fermettes', 'charpente-traditionnelle'],
    guide: null,
  },
  {
    id: 'couverture',
    label: 'Couverture',
    icon: '🏠',
    detail: "Écran sous-toiture, liteaux et tuiles. Une fois le faîtage posé, le chantier est hors d'eau.",
    watch: "Travail en hauteur : échafaudage et harnais. C'est le poste où les accidents graves sont les plus fréquents.",
    items: ['couverture-tuiles', 'zinguerie'],
    guide: null,
  },
  {
    id: 'menuiseries',
    label: 'Menuiseries',
    icon: '🪟',
    detail: "Portes et fenêtres posées et calfeutrées : le chantier passe hors d'air et peut être chauffé.",
    watch: "L'étanchéité à l'air se joue ici. Un joint mal posé se paiera chaque hiver pendant trente ans.",
    items: ['fenetre', 'baie-vitree', 'porte-entree', 'garage-porte'],
    guide: null,
  },
  {
    id: 'reseaux',
    label: 'Réseaux',
    icon: '⚡',
    detail: "Gaines électriques, alimentations et évacuations sont tirées avant que les murs ne se ferment.",
    watch: "Photographiez tous les murs avant de fermer. Dans cinq ans, quand vous percerez, ces photos vaudront de l'or.",
    items: ['tableau-electrique', 'point-electrique', 'circuit-specialise', 'point-eau', 'evacuation', 'vmc', 'chauffe-eau', 'plancher-chauffant', 'pac-air-eau', 'consuel'],
    guide: 'gaines-electriques',
  },
  {
    id: 'cloisons',
    label: 'Cloisons et isolation',
    icon: '🧰',
    detail: "Isolation, doublages et cloisons de distribution découpent enfin les pièces.",
    watch: "Le pare-vapeur se pose côté chauffé, sans percement inutile. Un pare-vapeur troué ne sert plus à rien.",
    items: ['isolation-murs', 'isolation-combles', 'doublage-placo', 'cloison-ba13', 'plafond-placo', 'bandes-enduit', 'porte-interieure'],
    guide: 'cloisons-ba13',
  },
]

export const STAGE_INDEX = Object.fromEntries(BUILD_STAGES.map((s, i) => [s.id, i]))

export const STAGE_BY_ID = Object.fromEntries(BUILD_STAGES.map(s => [s.id, s]))

/** Postes du chiffrage rattachés à une phase */
export function stageLines(estimate, stageId) {
  const stage = STAGE_BY_ID[stageId]
  if (!stage) return []
  return estimate.lines.filter(line => stage.items.includes(line.itemId))
}

/** Coût et temps de travail d'une phase */
export function stageTotals(estimate, stageId) {
  const lines = stageLines(estimate, stageId)
  return {
    lines,
    total: lines.reduce((s, l) => s + l.total, 0),
    totalPro: lines.reduce((s, l) => s + l.totalPro, 0),
    hours: lines.reduce((s, l) => s + l.hours, 0),
  }
}
