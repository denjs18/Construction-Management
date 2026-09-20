# MonChantier

Application mobile pour auto-constructeurs et auto-rénovateurs : dessin du plan,
maquette 3D, métré et chiffrage automatiques, plans de réseaux, suivi de
chantier et budget.

Tout fonctionne hors ligne et sans compte. Les données restent sur l'appareil.

## Démarrer

```bash
npm install
npm run dev      # développement
npm run build    # production, dans dist/
npm test         # contrôles de non-régression des moteurs de calcul
```

## Hébergement

L'application est un site statique. Le chemin de base vient de `VITE_BASE`, avec
« / » par défaut :

```bash
npm run build                          # racine du domaine (Vercel, Netlify…)
VITE_BASE=/sous-dossier/ npm run build # hébergement dans un sous-dossier
```

`vercel.json` réécrit toutes les routes vers `index.html`, sauf `/api`, sans quoi
un rechargement direct sur `/plan` renverrait une erreur.

## Synchronisation entre appareils

Facultative. Sans elle, l'application reste entièrement utilisable : la
sauvegarde par fichier, elle, ne dépend d'aucun service.

La fonction `api/sync.js` dépose un instantané du projet sur Vercel Blob, sous un
code à douze signes qui tient lieu d'identifiant et de clé. Pour l'activer :

1. Vercel → **Storage** → **Create Database** → **Blob**
2. Connecter ce stockage au projet, ce qui crée la variable
   `BLOB_READ_WRITE_TOKEN`
3. **Redéployer** : les déploiements déjà en ligne conservent leur ancien
   environnement et ne verraient pas la variable

Tant que la variable est absente, la fonction répond `503` avec
`storage-not-configured`, et l'interface le dit clairement plutôt que d'échouer
en silence. Pour vérifier depuis un terminal :

```bash
curl "https://<votre-domaine>/api/sync?code=ABC"
# attendu une fois activé : {"error":"invalid-code", …}
# tant que le stockage manque : {"error":"storage-not-configured", …}
```

## Organisation

| Chemin | Rôle |
| --- | --- |
| `src/lib/geometry.js` | Graphe planaire des murs, détection des pièces, aimantation |
| `src/lib/metre.js` | Modèle de plan multi-niveaux, surfaces, quantités, chiffrage |
| `src/lib/render3d.js` | Moteur 3D sur mesure : projection, masquage, toitures |
| `src/lib/plumbing.js` | Réseau d'évacuation, réservations de dalle |
| `src/lib/electrical.js` | Circuits, cheminement des gaines, contrôle NF C 15-100 |
| `src/lib/stairs.js` | Dimensionnement d'escalier, loi de Blondel, trémie |
| `src/data/prices.js` | Base de prix indicative France 2026, modifiable dans l'app |
| `api/sync.js` | Synchronisation par code, sur Vercel Blob |

## Portée et limites

L'application ne réalise **aucun calcul de structure**. Les sections de poteaux,
chaînages, linteaux et fermes affichées sont des valeurs courantes, données à
titre indicatif. Le dimensionnement des fondations, des armatures et des portées
relève d'un bureau d'études.

Les prix sont des ordres de grandeur pour la France en 2026, à ±30 % selon la
région et la période. Chaque ligne est modifiable dans l'application.
