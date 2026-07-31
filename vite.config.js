import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Le chemin de base dépend de l'hébergeur.
 *
 * Vercel, Netlify et un serveur classique servent l'app à la racine : base « / ».
 * GitHub Pages la sert dans un sous-dossier au nom du dépôt, d'où la variable
 * VITE_BASE utilisée par le script `build:gh`.
 *
 * Cette valeur est ensuite reprise à l'exécution par le routeur via
 * import.meta.env.BASE_URL : il n'y a qu'un seul endroit à changer.
 */
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/',
})
