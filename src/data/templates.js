export const PROJECT_TYPES = [
  { id: 'renovation-complete', label: 'Rénovation complète', icon: '🏠', description: 'Rénovation totale d\'un logement' },
  { id: 'salle-de-bain', label: 'Salle de bain', icon: '🚿', description: 'Rénovation complète de salle de bain' },
  { id: 'isolation', label: 'Isolation seule', icon: '🌡️', description: 'Isolation thermique (combles, murs)' },
  { id: 'cuisine', label: 'Cuisine', icon: '🍳', description: 'Rénovation de cuisine' },
  { id: 'custom', label: 'Projet personnalisé', icon: '✏️', description: 'Je construis mon planning moi-même' },
]

export const BUDGET_LOTS = [
  { id: 'gros-oeuvre', label: 'Gros œuvre & Maçonnerie', color: '#78716C' },
  { id: 'isolation', label: 'Isolation', color: '#22C55E' },
  { id: 'electricite', label: 'Électricité', color: '#EAB308' },
  { id: 'plomberie', label: 'Plomberie & Sanitaires', color: '#3B82F6' },
  { id: 'cloisons', label: 'Cloisons & Plâtrerie', color: '#A855F7' },
  { id: 'menuiseries', label: 'Menuiseries', color: '#F97316' },
  { id: 'sols', label: 'Revêtements de sol', color: '#D97706' },
  { id: 'peinture', label: 'Peinture & Finitions', color: '#EC4899' },
  { id: 'materiaux', label: 'Matériaux divers', color: '#6B7280' },
  { id: 'autres', label: 'Autres dépenses', color: '#9CA3AF' },
]

const PHASE_COLORS = {
  demolition: 'bg-red-50 border-red-200',
  'gros-oeuvre': 'bg-stone-50 border-stone-200',
  isolation: 'bg-green-50 border-green-200',
  plomberie: 'bg-blue-50 border-blue-200',
  electricite: 'bg-yellow-50 border-yellow-200',
  cloisons: 'bg-purple-50 border-purple-200',
  menuiseries: 'bg-orange-50 border-orange-200',
  sols: 'bg-amber-50 border-amber-200',
  peinture: 'bg-pink-50 border-pink-200',
  finitions: 'bg-gray-50 border-gray-200',
}

export const PHASE_COLORS_MAP = PHASE_COLORS

function makeTask(id, title, guideId = null, durationDays = 1, lotId = 'autres', notes = '') {
  return { id, title, guideId, durationDays, lotId, status: 'todo', notes, completedAt: null }
}

export const PROJECT_TEMPLATES = {
  'renovation-complete': {
    phases: [
      {
        id: 'demolition',
        name: 'Démolition & Dépose',
        colorClass: PHASE_COLORS.demolition,
        icon: '⛏️',
        tasks: [
          makeTask('d1', 'Déposer les anciens revêtements muraux', null, 2, 'gros-oeuvre'),
          makeTask('d2', 'Déposer les anciens revêtements de sol', null, 2, 'gros-oeuvre'),
          makeTask('d3', 'Démolir les cloisons prévues', null, 1, 'gros-oeuvre'),
          makeTask('d4', 'Déposer les sanitaires et robinetterie existants', null, 1, 'plomberie'),
          makeTask('d5', 'Déposer l\'ancienne installation électrique (tableau)', null, 1, 'electricite'),
          makeTask('d6', 'Évacuer les gravats', null, 1, 'autres'),
        ],
      },
      {
        id: 'gros-oeuvre',
        name: 'Gros œuvre & Structure',
        colorClass: PHASE_COLORS['gros-oeuvre'],
        icon: '🧱',
        tasks: [
          makeTask('go1', 'Reprendre les fissures de structure', null, 1, 'gros-oeuvre'),
          makeTask('go2', 'Réaliser les ouvertures (linteaux, portes)', null, 3, 'gros-oeuvre'),
          makeTask('go3', 'Vérifier et traiter l\'humidité des murs', null, 2, 'gros-oeuvre'),
          makeTask('go4', 'Mise hors d\'eau (toiture étanche)', null, 3, 'gros-oeuvre'),
          makeTask('go5', 'Mise hors d\'air (menuiseries extérieures posées)', null, 3, 'menuiseries'),
        ],
      },
      {
        id: 'isolation',
        name: 'Isolation thermique',
        colorClass: PHASE_COLORS.isolation,
        icon: '🌡️',
        tasks: [
          makeTask('i1', 'Isoler les combles perdus', 'isolation-combles', 2, 'isolation'),
          makeTask('i2', 'Doublage isolant sur les murs froids', 'isolation-murs-doublage', 3, 'isolation'),
          makeTask('i3', 'Isoler le plancher bas (si nécessaire)', null, 1, 'isolation'),
        ],
      },
      {
        id: 'plomberie-brut',
        name: 'Plomberie brute',
        colorClass: PHASE_COLORS.plomberie,
        icon: '🔧',
        tasks: [
          makeTask('pb1', 'Établir le plan de plomberie', null, 1, 'plomberie'),
          makeTask('pb2', 'Réaliser les alimentations eau froide/chaude', null, 3, 'plomberie'),
          makeTask('pb3', 'Réaliser les évacuations (PVC)', null, 2, 'plomberie'),
          makeTask('pb4', 'Poser le ballon d\'eau chaude ou chaudière', null, 1, 'plomberie'),
          makeTask('pb5', 'Test de pression des réseaux', null, 1, 'plomberie'),
        ],
      },
      {
        id: 'electricite-brut',
        name: 'Électricité brute',
        colorClass: PHASE_COLORS.electricite,
        icon: '⚡',
        tasks: [
          makeTask('eb1', 'Établir le plan électrique (circuits, tableau)', null, 1, 'electricite'),
          makeTask('eb2', 'Passer toutes les gaines ICTA', 'gaines-electriques', 3, 'electricite'),
          makeTask('eb3', 'Tirer tous les câbles électriques', null, 2, 'electricite'),
          makeTask('eb4', 'Monter et câbler le tableau électrique', null, 2, 'electricite'),
        ],
      },
      {
        id: 'cloisons',
        name: 'Cloisons & Plâtrerie',
        colorClass: PHASE_COLORS.cloisons,
        icon: '🔩',
        tasks: [
          makeTask('c1', 'Tracer et implanter les cloisons', 'cloisons-ba13', 1, 'cloisons'),
          makeTask('c2', 'Poser l\'ossature métallique (rails + montants)', 'cloisons-ba13', 2, 'cloisons'),
          makeTask('c3', 'Passer les gaines dans les cloisons (avant fermeture)', 'gaines-electriques', 1, 'electricite'),
          makeTask('c4', 'Fermer les cloisons (plaques BA13)', 'cloisons-ba13', 2, 'cloisons'),
          makeTask('c5', 'Réaliser les bandes et enduits (3 passes)', 'bandes-enduit', 4, 'cloisons'),
        ],
      },
      {
        id: 'menuiseries-int',
        name: 'Menuiseries intérieures',
        colorClass: PHASE_COLORS.menuiseries,
        icon: '🚪',
        tasks: [
          makeTask('mi1', 'Poser les huisseries et portes intérieures', null, 2, 'menuiseries'),
          makeTask('mi2', 'Poser les plinthes (après revêtements de sol)', null, 1, 'menuiseries'),
        ],
      },
      {
        id: 'sols',
        name: 'Revêtements de sol',
        colorClass: PHASE_COLORS.sols,
        icon: '🏗️',
        tasks: [
          makeTask('s1', 'Ragréage des sols (si nécessaire)', null, 1, 'sols'),
          makeTask('s2', 'Poser le carrelage (salle de bain, cuisine)', 'carrelage-sol', 3, 'sols'),
          makeTask('s3', 'Poser le parquet ou stratifié (séjour, chambres)', 'parquet-flottant', 2, 'sols'),
        ],
      },
      {
        id: 'peinture',
        name: 'Peinture & Finitions',
        colorClass: PHASE_COLORS.peinture,
        icon: '🎨',
        tasks: [
          makeTask('p1', 'Préparer les surfaces (enduit, ponçage)', 'peinture-interieure', 2, 'peinture'),
          makeTask('p2', 'Appliquer la peinture — première couche', 'peinture-interieure', 2, 'peinture'),
          makeTask('p3', 'Appliquer la peinture — deuxième couche', 'peinture-interieure', 2, 'peinture'),
        ],
      },
      {
        id: 'plomberie-finition',
        name: 'Plomberie finition',
        colorClass: PHASE_COLORS.plomberie,
        icon: '🚿',
        tasks: [
          makeTask('pf1', 'Poser les sanitaires (WC, lavabo, douche)', 'plomberie-sanitaires', 2, 'plomberie'),
          makeTask('pf2', 'Raccorder et tester la robinetterie', 'plomberie-sanitaires', 1, 'plomberie'),
          makeTask('pf3', 'Poser les radiateurs ou convecteurs', null, 1, 'plomberie'),
        ],
      },
      {
        id: 'electricite-finition',
        name: 'Électricité finition',
        colorClass: PHASE_COLORS.electricite,
        icon: '💡',
        tasks: [
          makeTask('ef1', 'Poser prises, interrupteurs et plaques', 'tableau-electrique', 2, 'electricite'),
          makeTask('ef2', 'Poser les luminaires', null, 1, 'electricite'),
          makeTask('ef3', 'Tester et vérifier l\'installation', null, 1, 'electricite'),
        ],
      },
      {
        id: 'reception',
        name: 'Réception & Nettoyage',
        colorClass: PHASE_COLORS.finitions,
        icon: '✅',
        tasks: [
          makeTask('r1', 'Nettoyage complet du chantier', null, 1, 'autres'),
          makeTask('r2', 'Vérifications et retouches finales', null, 1, 'autres'),
          makeTask('r3', 'Classer les factures et garanties', null, 1, 'autres'),
          makeTask('r4', 'Photos finales du chantier terminé', null, 1, 'autres'),
        ],
      },
    ],
  },

  'salle-de-bain': {
    phases: [
      {
        id: 'demolition',
        name: 'Démolition & Dépose',
        colorClass: PHASE_COLORS.demolition,
        icon: '⛏️',
        tasks: [
          makeTask('d1', 'Déposer l\'ancien carrelage mural et sol', null, 1, 'gros-oeuvre'),
          makeTask('d2', 'Déposer les anciens sanitaires', null, 1, 'plomberie'),
          makeTask('d3', 'Couper l\'eau et l\'électricité de la salle de bain', null, 1, 'autres'),
        ],
      },
      {
        id: 'plomberie-brut',
        name: 'Plomberie brute',
        colorClass: PHASE_COLORS.plomberie,
        icon: '🔧',
        tasks: [
          makeTask('pb1', 'Adapter les arrivées d\'eau (si déplacement)', null, 1, 'plomberie'),
          makeTask('pb2', 'Adapter les évacuations (si déplacement)', null, 1, 'plomberie'),
        ],
      },
      {
        id: 'electricite-brut',
        name: 'Électricité',
        colorClass: PHASE_COLORS.electricite,
        icon: '⚡',
        tasks: [
          makeTask('eb1', 'Passer les gaines (VMC, éclairage, radiateur)', 'gaines-electriques', 1, 'electricite'),
          makeTask('eb2', 'Respecter les zones de sécurité NFC 15-100', null, 1, 'electricite'),
        ],
      },
      {
        id: 'etancheite',
        name: 'Étanchéité',
        colorClass: PHASE_COLORS.cloisons,
        icon: '🛡️',
        tasks: [
          makeTask('e1', 'Appliquer le système d\'étanchéité sous carrelage (SPEC)', null, 1, 'cloisons'),
          makeTask('e2', 'Poser le receveur de douche ou la niche', null, 1, 'plomberie'),
        ],
      },
      {
        id: 'carrelage',
        name: 'Carrelage sol & murs',
        colorClass: PHASE_COLORS.sols,
        icon: '🏗️',
        tasks: [
          makeTask('c1', 'Poser le carrelage au sol', 'carrelage-sol', 2, 'sols'),
          makeTask('c2', 'Poser le carrelage mural (faïence)', 'carrelage-sol', 2, 'sols'),
          makeTask('c3', 'Jointoyer et finir', 'carrelage-sol', 1, 'sols'),
        ],
      },
      {
        id: 'sanitaires',
        name: 'Pose des sanitaires',
        colorClass: PHASE_COLORS.plomberie,
        icon: '🚿',
        tasks: [
          makeTask('s1', 'Poser le WC', 'plomberie-sanitaires', 1, 'plomberie'),
          makeTask('s2', 'Poser le lavabo et robinetterie', 'plomberie-sanitaires', 1, 'plomberie'),
          makeTask('s3', 'Poser la douche ou baignoire', 'plomberie-sanitaires', 1, 'plomberie'),
          makeTask('s4', 'Poser le meuble de salle de bain', null, 1, 'menuiseries'),
        ],
      },
      {
        id: 'electricite-finition',
        name: 'Électricité finition',
        colorClass: PHASE_COLORS.electricite,
        icon: '💡',
        tasks: [
          makeTask('ef1', 'Poser les prises et interrupteurs (zones adaptées)', 'tableau-electrique', 1, 'electricite'),
          makeTask('ef2', 'Installer la VMC ou ventilation', null, 1, 'electricite'),
          makeTask('ef3', 'Installer les luminaires salle de bain (IP44 min)', null, 1, 'electricite'),
        ],
      },
      {
        id: 'finitions',
        name: 'Finitions',
        colorClass: PHASE_COLORS.finitions,
        icon: '✅',
        tasks: [
          makeTask('f1', 'Poser les joints silicone (douche, baignoire, plan)', null, 1, 'cloisons'),
          makeTask('f2', 'Poser les accessoires (porte-serviette, miroir)', null, 1, 'autres'),
          makeTask('f3', 'Test final (fuites, électricité, VMC)', null, 1, 'autres'),
        ],
      },
    ],
  },

  'isolation': {
    phases: [
      {
        id: 'diagnostic',
        name: 'Diagnostic thermique',
        colorClass: PHASE_COLORS.finitions,
        icon: '🔍',
        tasks: [
          makeTask('diag1', 'Identifier les déperditions prioritaires (combles, murs, sol)', null, 1, 'autres'),
          makeTask('diag2', 'Vérifier l\'état de la charpente et de la toiture', null, 1, 'autres'),
          makeTask('diag3', 'Vérifier l\'absence d\'humidité avant isolation', null, 1, 'autres'),
        ],
      },
      {
        id: 'combles',
        name: 'Isolation des combles',
        colorClass: PHASE_COLORS.isolation,
        icon: '🏠',
        tasks: [
          makeTask('c1', 'Isoler les combles perdus en rouleaux', 'isolation-combles', 2, 'isolation'),
          makeTask('c2', 'Isoler la trappe d\'accès', 'isolation-combles', 1, 'isolation'),
        ],
      },
      {
        id: 'murs',
        name: 'Isolation des murs',
        colorClass: PHASE_COLORS.isolation,
        icon: '🧱',
        tasks: [
          makeTask('m1', 'Doublage isolant sur les murs froids', 'isolation-murs-doublage', 4, 'isolation'),
          makeTask('m2', 'Bandes et enduits sur le doublage', 'bandes-enduit', 2, 'cloisons'),
        ],
      },
      {
        id: 'finitions-iso',
        name: 'Finitions',
        colorClass: PHASE_COLORS.peinture,
        icon: '🎨',
        tasks: [
          makeTask('f1', 'Repositionner les prises et interrupteurs', 'tableau-electrique', 1, 'electricite'),
          makeTask('f2', 'Peindre les surfaces nouvellement isolées', 'peinture-interieure', 2, 'peinture'),
        ],
      },
    ],
  },

  'cuisine': {
    phases: [
      {
        id: 'demolition',
        name: 'Démolition & Dépose',
        colorClass: PHASE_COLORS.demolition,
        icon: '⛏️',
        tasks: [
          makeTask('d1', 'Déposer l\'ancienne cuisine (meubles, plan de travail)', null, 1, 'gros-oeuvre'),
          makeTask('d2', 'Déposer le carrelage sol si nécessaire', null, 1, 'sols'),
          makeTask('d3', 'Couper eau, électricité et gaz si existant', null, 1, 'autres'),
        ],
      },
      {
        id: 'reseaux',
        name: 'Réseaux',
        colorClass: PHASE_COLORS.electricite,
        icon: '⚡',
        tasks: [
          makeTask('r1', 'Adapter les arrivées d\'eau et évacuations', null, 1, 'plomberie'),
          makeTask('r2', 'Créer les circuits électriques dédiés (four, lave-vaisselle, plaque)', 'gaines-electriques', 1, 'electricite'),
          makeTask('r3', 'Prévoir la hotte et sa gaine d\'extraction', null, 1, 'electricite'),
        ],
      },
      {
        id: 'sol',
        name: 'Revêtement de sol',
        colorClass: PHASE_COLORS.sols,
        icon: '🏗️',
        tasks: [
          makeTask('s1', 'Ragréage si nécessaire', null, 1, 'sols'),
          makeTask('s2', 'Poser le carrelage ou revêtement sol', 'carrelage-sol', 2, 'sols'),
        ],
      },
      {
        id: 'meubles',
        name: 'Pose cuisine',
        colorClass: PHASE_COLORS.menuiseries,
        icon: '🍳',
        tasks: [
          makeTask('m1', 'Tracer et implanter les caissons', null, 1, 'menuiseries'),
          makeTask('m2', 'Poser les caissons bas et hauts', null, 2, 'menuiseries'),
          makeTask('m3', 'Poser le plan de travail', null, 1, 'menuiseries'),
          makeTask('m4', 'Poser l\'évier et la robinetterie', 'plomberie-sanitaires', 1, 'plomberie'),
          makeTask('m5', 'Raccorder électroménager', 'tableau-electrique', 1, 'electricite'),
          makeTask('m6', 'Poser les portes et façades', null, 1, 'menuiseries'),
        ],
      },
      {
        id: 'finitions',
        name: 'Finitions',
        colorClass: PHASE_COLORS.peinture,
        icon: '🎨',
        tasks: [
          makeTask('f1', 'Carrelage mural (crédence)', 'carrelage-sol', 1, 'sols'),
          makeTask('f2', 'Peinture des murs', 'peinture-interieure', 1, 'peinture'),
          makeTask('f3', 'Poser la hotte et vérifier extraction', null, 1, 'electricite'),
          makeTask('f4', 'Test complet (eau, électricité, tiroirs, portes)', null, 1, 'autres'),
        ],
      },
    ],
  },

  'custom': {
    phases: [
      {
        id: 'custom-phase-1',
        name: 'Ma première phase',
        colorClass: PHASE_COLORS.finitions,
        icon: '📋',
        tasks: [
          makeTask('cp1', 'Première tâche (modifiez-moi)', null, 1, 'autres'),
        ],
      },
    ],
  },
}
