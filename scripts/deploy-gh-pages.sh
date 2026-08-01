#!/usr/bin/env bash
#
# Publie l'application compilée sur la branche gh-pages.
#
# Cette branche ne contient que le résultat du build : aucun package.json, aucune
# dépendance. Un hébergeur qui tenterait de la construire échouerait forcément.
# On y dépose donc un vercel.json qui désactive explicitement le déploiement de
# cette branche, sans quoi chaque publication déclenche un build Vercel en échec.
#
set -euo pipefail

cd "$(dirname "$0")/.."

REMOTE=$(git config --get remote.origin.url)
STAGING=$(mktemp -d)
trap 'rm -rf "$STAGING"' EXIT

echo "→ Compilation avec le sous-chemin GitHub Pages"
npm run build:gh

cp -r dist/* "$STAGING/"

# GitHub Pages ne sait pas réécrire les routes : on sert index.html sur les 404
# pour que /plan ou /chiffrage fonctionnent au rechargement direct.
cp "$STAGING/index.html" "$STAGING/404.html"

# Empêche Vercel de tenter un build sur cette branche sans sources.
cat > "$STAGING/vercel.json" <<'JSON'
{
  "git": {
    "deploymentEnabled": {
      "gh-pages": false
    }
  }
}
JSON

# Désactive le traitement Jekyll de GitHub Pages, qui ignore les dossiers _*.
touch "$STAGING/.nojekyll"

echo "→ Publication sur gh-pages"
cd "$STAGING"
git init -q
git add -A
git -c user.email=deploy@monchantier.local -c user.name="MonChantier Deploy" \
  commit -q -m "Deploy MonChantier"
git remote add origin "$REMOTE"
git push -f origin HEAD:gh-pages

cd - > /dev/null
echo "→ Remise en place du build racine (Vercel)"
npm run build > /dev/null

echo "✓ Publié sur gh-pages, dist régénéré pour la racine"
