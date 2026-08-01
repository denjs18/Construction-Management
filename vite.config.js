import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Le chemin de base dépend de l'hébergeur.
 *
 * Vercel, Netlify et un serveur classique servent l'app à la racine : « / »,
 * la valeur par défaut. Pour un hébergement dans un sous-dossier, il suffit de
 * compiler avec VITE_BASE=/mon-sous-dossier/.
 *
 * Cette valeur est reprise à l'exécution par le routeur via
 * import.meta.env.BASE_URL : il n'y a qu'un seul endroit à changer.
 */
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/',
})
