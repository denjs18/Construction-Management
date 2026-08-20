/**
 * Base de prix indicative — France, 2026.
 *
 * IMPORTANT : ces prix sont des ordres de grandeur. L'écart réel entre régions
 * dépasse souvent 30 %, et les cours des matériaux bougent. Chaque ligne est
 * modifiable par l'utilisateur dans l'app, et les prix réellement payés
 * (saisis dans le Budget) prennent le dessus.
 *
 * material : € HT par unité, fourniture seule
 * labor    : € HT par unité, pose seule par une entreprise
 * hours    : heures de travail par unité si vous le faites vous-même
 * diy      : réalisable par un particulier sans qualification obligatoire
 */

export const PRICE_DISCLAIMER =
  "Prix indicatifs France 2026, hors taxes. Comptez ±30 % selon la région, " +
  "l'accessibilité du chantier et la période. Ajustez chaque ligne avec vos " +
  "propres devis pour fiabiliser l'estimation."

const item = (id, lot, label, unit, material, labor, hours, opts = {}) => ({
  id,
  lot,
  label,
  unit,
  material: { min: material[0], typ: material[1], max: material[2] },
  labor: { min: labor[0], typ: labor[1], max: labor[2] },
  hours,
  diy: opts.diy !== false,
  note: opts.note || '',
  phase: opts.phase || lot,
})

export const PRICE_ITEMS = [
  /* ----------------------------------------------------- Terrassement / VRD */
  item('terrassement', 'gros-oeuvre', 'Terrassement et décapage', 'm³',
    [0, 0, 0], [22, 32, 45], 0,
    { diy: false, note: "Location de mini-pelle avec chauffeur. En auto-construction, comptez 250 à 400 €/jour la pelle seule si vous savez la conduire." }),

  item('fouilles', 'gros-oeuvre', 'Fouilles en rigole pour fondations', 'm³',
    [0, 0, 0], [30, 45, 65], 0,
    { diy: false, note: "Creusement des tranchées de semelles. Profondeur hors gel : 50 à 90 cm selon la région." }),

  item('fondation-beton', 'gros-oeuvre', 'Béton de fondation + ferraillage', 'm³',
    [140, 165, 195], [170, 250, 340], 3.5,
    { note: "Béton dosé à 350 kg/m³ livré par toupie, chaînage acier HA10/HA12. Le coulage est faisable soi-même, le dimensionnement du ferraillage relève d'un bureau d'études." }),

  item('soubassement', 'gros-oeuvre', 'Soubassement en blocs à bancher', 'm²',
    [25, 34, 46], [50, 68, 92], 1.2,
    { note: "Murs de fondation entre le niveau des semelles et la dalle." }),

  /* ------------------------------------------------------------ Dallage */
  item('herisson', 'gros-oeuvre', 'Hérisson concassé + film polyane', 'm²',
    [7, 11, 16], [9, 14, 20], 0.25,
    { note: "20 cm de gravier 20/40 compacté, film polyéthylène 200 microns anti-remontées d'humidité." }),

  item('isolation-sous-dalle', 'isolation', 'Isolation sous dalle (polystyrène)', 'm²',
    [11, 17, 25], [6, 10, 15], 0.15,
    { note: "Panneaux PSE ou XPS haute densité, 10 à 14 cm. Obligatoire en construction neuve (RE2020)." }),

  item('dalle-beton', 'gros-oeuvre', 'Dalle béton armée 15 cm', 'm²',
    [40, 52, 68], [38, 55, 78], 0.9,
    { note: "Béton + treillis soudé ST25C + règle. Le tirage à la règle demande de l'expérience ou de l'aide : prévoyez 3 personnes minimum." }),

  item('chape', 'sols', 'Chape de ravoirage / ragréage', 'm²',
    [11, 16, 23], [17, 25, 36], 0.35,
    { note: "Nécessaire pour noyer les gaines et rattraper les niveaux avant revêtement." }),

  /* -------------------------------------------------------- Élévation murs */
  /* --------------------------------------------- Planchers et escaliers */
  item('plancher-intermediaire', 'gros-oeuvre', 'Plancher intermédiaire (poutrelles-hourdis)', 'm²',
    [42, 58, 78], [38, 55, 78], 0.9,
    { note: "Poutrelles, entrevous et dalle de compression ferraillée. La portée des poutrelles commande la position des refends : au-delà de 5 à 6 m, il faut un mur porteur intermédiaire ou une poutre." }),

  item('escalier', 'menuiseries', 'Escalier d\'étage', 'u',
    [750, 1800, 4200], [350, 700, 1300], 14,
    { note: "Un escalier droit en bois est le plus simple à poser soi-même. Un quart tournant, ou un béton coulé en place, demande un vrai savoir-faire." }),

  item('garde-corps', 'menuiseries', 'Garde-corps de terrasse ou de trémie', 'ml',
    [65, 130, 260], [55, 95, 160], 1.2,
    { note: "Un mètre de hauteur minimum, et un remplissage tel qu'une sphère de 11 cm ne passe pas. C'est une obligation de sécurité, pas une option." }),

  item('etancheite-terrasse', 'gros-oeuvre', 'Étanchéité de terrasse accessible', 'm²',
    [24, 40, 62], [42, 68, 105], 0.9,
    { diy: false, note: "Membrane bitumineuse ou EPDM avec relevés en périphérie. Une terrasse au-dessus d'une pièce de vie ne se rattrape pas : ce poste se confie à un étancheur." }),

  item('dalle-sur-plots', 'sols', 'Dalles sur plots', 'm²',
    [28, 48, 85], [18, 30, 48], 0.5,
    { note: "Se posent sur l'étanchéité sans la percer, et se démontent pour inspection." }),

  item('mur-parpaing', 'gros-oeuvre', 'Élévation murs — parpaing 20 cm', 'm²',
    [20, 27, 36], [46, 62, 82], 1.1,
    { note: "Blocs creux 20×20×50 + mortier. Le plus économique et le plus tolérant pour un débutant." }),

  item('mur-brique', 'gros-oeuvre', 'Élévation murs — brique monomur', 'm²',
    [52, 68, 88], [58, 76, 98], 1.3,
    { note: "Brique alvéolaire rectifiée collée. Isolation répartie : pas d'isolant intérieur nécessaire, mais pose au joint mince très exigeante en précision." }),

  item('mur-beton-cellulaire', 'gros-oeuvre', 'Élévation murs — béton cellulaire', 'm²',
    [42, 55, 72], [48, 64, 84], 1.0,
    { note: "Blocs légers collés. Se coupe à la scie, très accessible en auto-construction." }),

  item('mur-ossature-bois', 'gros-oeuvre', 'Murs ossature bois', 'm²',
    [72, 95, 125], [70, 95, 130], 1.4,
    { note: "Montants 45×145 + OSB + pare-pluie. Rapide à monter, léger, mais demande de la rigueur sur l'étanchéité à l'air." }),

  item('chainage', 'gros-oeuvre', 'Chaînages horizontaux et linteaux', 'ml',
    [16, 24, 34], [28, 42, 60], 0.7,
    { note: "Ceinturage béton armé en tête de mur et au-dessus des ouvertures. Élément structurel : le dimensionnement doit être validé." }),

  item('enduit-exterieur', 'gros-oeuvre', 'Enduit de façade monocouche', 'm²',
    [7, 12, 18], [28, 42, 58], 0.5,
    { note: "Projeté puis taloché. Location de la machine à projeter : 120 à 200 €/jour. Nécessite un échafaudage." }),

  /* ------------------------------------------------- Charpente / couverture */
  item('charpente-fermettes', 'gros-oeuvre', 'Charpente industrielle (fermettes)', 'm²',
    [38, 55, 75], [28, 42, 60], 0.5,
    { diy: false, note: "Livrée sur mesure, posée à la grue en une journée. Combles perdus uniquement." }),

  item('charpente-traditionnelle', 'gros-oeuvre', 'Charpente traditionnelle', 'm²',
    [72, 98, 135], [62, 88, 125], 1.6,
    { diy: false, note: "Permet d'aménager les combles. Assemblages complexes : réservez-la aux charpentiers." }),

  item('couverture-tuiles', 'gros-oeuvre', 'Couverture tuiles + écran sous-toiture', 'm²',
    [26, 38, 55], [32, 46, 65], 0.8,
    { note: "Liteaux, écran HPV, tuiles et faîtage. Travail en hauteur : harnais et échafaudage obligatoires." }),

  item('zinguerie', 'gros-oeuvre', 'Gouttières et descentes', 'ml',
    [14, 22, 34], [18, 28, 42], 0.5,
    { note: "Zinc ou aluminium. Pente de 3 à 5 mm par mètre vers la descente." }),

  /* ------------------------------------------------------------ Isolation */
  item('isolation-murs', 'isolation', 'Isolation thermique des murs', 'm²',
    [13, 20, 30], [11, 18, 26], 0.35,
    { note: "Laine de verre GR32 ou laine de bois, 120 à 160 mm, avec pare-vapeur." }),

  item('isolation-combles', 'isolation', 'Isolation des combles', 'm²',
    [11, 17, 25], [7, 12, 18], 0.2,
    { note: "30 à 40 cm de laine soufflée ou déroulée pour atteindre R ≥ 7 m².K/W." }),

  /* --------------------------------------------------- Cloisons / plâtrerie */
  item('doublage-placo', 'cloisons', 'Doublage des murs (placo + rails)', 'm²',
    [15, 22, 31], [26, 38, 52], 0.5,
    { note: "Ossature métallique 48 mm + BA13. Contre-cloison désolidarisée du mur porteur." }),

  item('cloison-ba13', 'cloisons', 'Cloison de distribution BA13 72/48', 'm²',
    [17, 25, 34], [28, 40, 55], 0.55,
    { note: "Deux plaques + rails 48 mm + laine acoustique. En pièce humide, utilisez des plaques hydrofuges." }),

  item('plafond-placo', 'cloisons', 'Plafond en plaques de plâtre', 'm²',
    [16, 24, 33], [30, 44, 60], 0.7,
    { note: "Suspentes + fourrures + BA13. Travail au-dessus de la tête : un lève-plaque à 15 €/jour change tout." }),

  item('bandes-enduit', 'cloisons', 'Bandes, enduit et ponçage', 'm²',
    [2, 3.5, 5], [9, 15, 23], 0.35,
    { note: "Trois passes minimum. Étape lente mais très accessible : c'est le premier poste à faire soi-même." }),

  /* --------------------------------------------------------- Électricité */
  item('tableau-electrique', 'electricite', 'Tableau électrique et GTL', 'u',
    [240, 420, 680], [280, 450, 720], 8,
    { note: "Coffret, disjoncteurs, interrupteurs différentiels 30 mA, GTL. Le raccordement au disjoncteur de branchement est réservé à Enedis." }),

  item('point-electrique', 'electricite', 'Point électrique (prise, inter, luminaire)', 'u',
    [11, 18, 28], [42, 62, 88], 0.8,
    { note: "Gaine ICTA, boîte d'encastrement, câble, appareillage. Prix par point posé et raccordé." }),

  item('circuit-specialise', 'electricite', 'Circuit spécialisé (four, plaque, lave-linge)', 'u',
    [28, 45, 70], [80, 120, 175], 1.5,
    { note: "Ligne dédiée depuis le tableau avec son propre disjoncteur, imposée par la NF C 15-100." }),

  item('consuel', 'electricite', 'Attestation de conformité CONSUEL', 'u',
    [0, 0, 0], [140, 180, 230], 0,
    { diy: false, note: "Obligatoire pour la mise en service par Enedis, y compris en auto-construction. Contrôle sur place d'une installation neuve." }),

  /* ----------------------------------------------------------- Plomberie */
  item('point-eau', 'plomberie', "Point d'eau (alimentation EF/EC)", 'u',
    [75, 130, 200], [160, 260, 380], 2.5,
    { note: "Alimentation en PER ou multicouche depuis le collecteur, avec robinet d'arrêt." }),

  item('evacuation', 'plomberie', 'Réseau d\'évacuation PVC', 'ml',
    [7, 12, 19], [16, 26, 40], 0.5,
    { note: "PVC Ø40 à Ø100 avec pente de 1 à 3 cm par mètre. Une pente insuffisante ou excessive provoque des bouchons." }),

  item('sanitaire-wc', 'plomberie', 'WC suspendu ou à poser', 'u',
    [180, 420, 900], [180, 280, 420], 3,
    { note: "Bâti-support inclus pour un WC suspendu." }),

  item('sanitaire-douche', 'plomberie', 'Douche complète (receveur + paroi + robinetterie)', 'u',
    [380, 750, 1600], [280, 450, 700], 6,
    { note: "L'étanchéité sous carrelage (SPEC) est le point critique : ne la négligez jamais." }),

  item('sanitaire-lavabo', 'plomberie', 'Lavabo ou vasque + meuble', 'u',
    [160, 380, 900], [120, 200, 320], 2.5, {}),

  item('sanitaire-evier', 'plomberie', 'Évier de cuisine + robinetterie', 'u',
    [180, 350, 750], [120, 200, 320], 2.5, {}),

  item('chauffe-eau', 'plomberie', 'Chauffe-eau thermodynamique', 'u',
    [1600, 2600, 3800], [400, 650, 950], 5,
    { note: "200 L pour 4 personnes. Un ballon électrique classique coûte 350 à 800 € mais consomme trois fois plus." }),

  item('pac-air-eau', 'plomberie', 'Pompe à chaleur air/eau', 'u',
    [5500, 8500, 13000], [2200, 3500, 5000], 0,
    { diy: false, note: "Manipulation de fluide frigorigène : attestation de capacité obligatoire. Faire poser par un RGE ouvre droit aux aides." }),

  item('plancher-chauffant', 'plomberie', 'Plancher chauffant hydraulique', 'm²',
    [28, 42, 60], [30, 45, 65], 0.6,
    { note: "Collecteur, tubes PER, dalle d'enrobage. À poser avant la chape." }),

  item('radiateur', 'plomberie', 'Radiateur + raccordement', 'u',
    [120, 280, 600], [110, 180, 280], 2, {}),

  item('vmc', 'plomberie', 'VMC double flux', 'u',
    [1400, 2400, 3800], [700, 1200, 1900], 12,
    { note: "Obligatoire en RE2020 pour atteindre les performances. Le réseau de gaines doit être isolé et étanche." }),

  /* ----------------------------------------------------------- Menuiseries */
  item('fenetre', 'menuiseries', 'Fenêtre PVC double vitrage', 'u',
    [350, 560, 850], [140, 215, 320], 2.5,
    { note: "Prix pour une fenêtre 2 vantaux d'environ 1,20 × 1,15 m avec volet roulant." }),

  item('baie-vitree', 'menuiseries', 'Baie vitrée coulissante', 'u',
    [750, 1400, 2600], [200, 320, 480], 4, {}),

  item('porte-entree', 'menuiseries', "Porte d'entrée", 'u',
    [850, 1600, 3200], [190, 300, 450], 3.5, {}),

  item('porte-interieure', 'menuiseries', 'Porte intérieure (bloc-porte)', 'u',
    [110, 220, 450], [85, 140, 220], 1.5,
    { note: "Le bloc-porte prêt à poser est bien plus simple qu'un bâti à monter." }),

  item('garage-porte', 'menuiseries', 'Porte de garage sectionnelle', 'u',
    [750, 1400, 2600], [250, 400, 600], 5, {}),

  /* --------------------------------------------------------- Revêtements */
  item('carrelage-sol', 'sols', 'Carrelage au sol', 'm²',
    [18, 35, 75], [36, 52, 74], 0.75,
    { note: "Double encollage obligatoire au-delà du format 40×40. Prévoyez 10 % de casse et de coupes." }),

  item('parquet-flottant', 'sols', 'Parquet stratifié ou flottant', 'm²',
    [14, 32, 65], [18, 28, 42], 0.35,
    { note: "Pose clipsée sur sous-couche. Le poste le plus rentable à faire soi-même : simple et rapide." }),

  item('faience', 'peinture', 'Faïence murale (salle de bain, cuisine)', 'm²',
    [18, 38, 80], [42, 62, 88], 0.9, {}),

  item('peinture', 'peinture', 'Peinture murs et plafonds', 'm²',
    [3.5, 6, 10], [15, 24, 36], 0.3,
    { note: "Sous-couche + deux couches. Poste idéal pour débuter en auto-rénovation." }),

  /* ------------------------------------------------------------- Divers */
  item('raccordements', 'autres', 'Raccordements eau, électricité, télécom', 'forfait',
    [0, 0, 0], [1800, 3500, 6500], 0,
    { diy: false, note: "Coût très variable selon la distance au réseau. Demandez les devis Enedis et le service des eaux avant d'acheter le terrain." }),

  item('assainissement', 'autres', 'Assainissement individuel (fosse + épandage)', 'forfait',
    [2800, 4500, 7000], [2200, 3800, 6000], 0,
    { diy: false, note: "Uniquement si le tout-à-l'égout n'est pas disponible. Étude de sol et validation SPANC obligatoires." }),

  item('etude-sol', 'autres', 'Étude de sol G2 AVP', 'forfait',
    [0, 0, 0], [900, 1400, 2200], 0,
    { diy: false, note: "Obligatoire en zone d'argile pour toute construction neuve depuis 2020. Détermine le type de fondation." }),

  item('assurance-do', 'autres', 'Assurance dommages-ouvrage', 'forfait',
    [0, 0, 0], [2500, 4500, 8000], 0,
    { diy: false, note: "Légalement obligatoire pour le maître d'ouvrage, même particulier. Difficile à obtenir en auto-construction, mais indispensable à la revente dans les 10 ans." }),
]

export const PRICE_BY_ID = Object.fromEntries(PRICE_ITEMS.map(p => [p.id, p]))

/* --------------------------------------------------- Systèmes constructifs */

export const STRUCTURE_TYPES = [
  {
    id: 'parpaing',
    label: 'Parpaing',
    icon: '🧱',
    wallItem: 'mur-parpaing',
    thickness: 20,
    needsInsulation: true,
    description: 'Le plus courant et le plus économique',
    diyRating: 'Accessible avec de la méthode',
  },
  {
    id: 'beton-cellulaire',
    label: 'Béton cellulaire',
    icon: '⬜',
    wallItem: 'mur-beton-cellulaire',
    thickness: 30,
    needsInsulation: false,
    description: 'Léger, isolant, se coupe à la scie',
    diyRating: 'Très accessible',
  },
  {
    id: 'brique',
    label: 'Brique monomur',
    icon: '🟫',
    wallItem: 'mur-brique',
    thickness: 37,
    needsInsulation: false,
    description: 'Isolation répartie, pas de doublage',
    diyRating: 'Exigeant en précision',
  },
  {
    id: 'ossature-bois',
    label: 'Ossature bois',
    icon: '🪵',
    wallItem: 'mur-ossature-bois',
    thickness: 20,
    needsInsulation: true,
    description: 'Montage rapide, chantier sec',
    diyRating: 'Accessible si vous êtes bricoleur',
  },
]

export const STRUCTURE_BY_ID = Object.fromEntries(STRUCTURE_TYPES.map(s => [s.id, s]))

export const ROOF_TYPES = [
  { id: '2pans', label: '2 pans', icon: '🏠', pitch: 35, description: 'Le grand classique, le moins cher' },
  { id: '4pans', label: '4 pans', icon: '🏡', pitch: 30, description: 'Toit en croupe, plus de charpente' },
  { id: 'monopente', label: 'Monopente', icon: '📐', pitch: 15, description: 'Une seule pente, style contemporain' },
  { id: 'plat', label: 'Toit plat', icon: '⬛', pitch: 2, description: 'Terrasse accessible ou végétalisée' },
]

export const ROOF_BY_ID = Object.fromEntries(ROOF_TYPES.map(r => [r.id, r]))

/* --------------------------------------------------------- Types de pièces */

export const ROOM_TYPES = [
  { id: 'sejour', label: 'Séjour', icon: '🛋️', floor: 'parquet-flottant', wet: false },
  { id: 'cuisine', label: 'Cuisine', icon: '🍳', floor: 'carrelage-sol', wet: true },
  { id: 'chambre', label: 'Chambre', icon: '🛏️', floor: 'parquet-flottant', wet: false },
  { id: 'sdb', label: 'Salle de bain', icon: '🚿', floor: 'carrelage-sol', wet: true },
  { id: 'wc', label: 'WC', icon: '🚽', floor: 'carrelage-sol', wet: true },
  { id: 'entree', label: 'Entrée', icon: '🚪', floor: 'carrelage-sol', wet: false },
  { id: 'couloir', label: 'Couloir', icon: '↔️', floor: 'carrelage-sol', wet: false },
  { id: 'bureau', label: 'Bureau', icon: '💻', floor: 'parquet-flottant', wet: false },
  { id: 'buanderie', label: 'Buanderie', icon: '🧺', floor: 'carrelage-sol', wet: true },
  { id: 'garage', label: 'Garage', icon: '🚗', floor: null, wet: false },
  { id: 'cellier', label: 'Cellier', icon: '📦', floor: 'carrelage-sol', wet: false },
  { id: 'dressing', label: 'Dressing', icon: '👔', floor: 'parquet-flottant', wet: false },
  { id: 'palier', label: 'Palier', icon: '🪜', floor: 'parquet-flottant', wet: false },
  { id: 'terrasse', label: 'Terrasse', icon: '🌤️', floor: 'dalle-sur-plots', wet: false, outdoor: true },
  { id: 'autre', label: 'Autre', icon: '⬜', floor: 'carrelage-sol', wet: false },
]

export const ROOM_TYPE_BY_ID = Object.fromEntries(ROOM_TYPES.map(r => [r.id, r]))

/* -------------------------------------------------------------- Utilitaires */

export function priceOf(itemId, level = 'typ', overrides = {}) {
  const base = PRICE_BY_ID[itemId]
  if (!base) return { material: 0, labor: 0, hours: 0 }
  const override = overrides[itemId] || {}
  return {
    material: override.material ?? base.material[level],
    labor: override.labor ?? base.labor[level],
    hours: base.hours,
  }
}

export function formatEuro(value) {
  const rounded = Math.round(value)
  return `${rounded.toLocaleString('fr-FR')} €`
}

export function formatEuroShort(value) {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1).replace('.', ',')} k€`
  return `${Math.round(value)} €`
}
