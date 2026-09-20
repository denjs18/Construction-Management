/**
 * Synchronisation par code, côté navigateur.
 *
 * Le code tient lieu d'identifiant et de mot de passe à la fois. Il est
 * conservé sur l'appareil, aux côtés de la date du dernier échange : c'est
 * elle qui permet de repérer qu'un autre appareil a déposé une version plus
 * récente, et d'éviter de l'écraser sans le savoir.
 */

const CODE_KEY = 'monchantier-sync-code'
const SYNCED_KEY = 'monchantier-sync-at'

/** Alphabet sans les caractères qu'on confond en recopiant : ni O, ni I, ni U */
const ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTVWXYZ'

export function generateCode() {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  const chars = [...bytes].map(b => ALPHABET[b % ALPHABET.length])
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`
}

export const CODE_PATTERN = /^[0-9A-HJ-NP-TV-Z]{4}-[0-9A-HJ-NP-TV-Z]{4}-[0-9A-HJ-NP-TV-Z]{4}$/

/** Met en forme une saisie libre : majuscules, tirets tous les quatre signes */
export function formatCode(input) {
  const clean = String(input || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 12)
  return clean.replace(/(.{4})(?=.)/g, '$1-')
}

export const storedCode = () => localStorage.getItem(CODE_KEY)
export const storeCode = (code) => localStorage.setItem(CODE_KEY, code)
export const forgetCode = () => {
  localStorage.removeItem(CODE_KEY)
  localStorage.removeItem(SYNCED_KEY)
}

export const lastSyncAt = () => {
  const raw = localStorage.getItem(SYNCED_KEY)
  return raw ? new Date(raw) : null
}
const markSynced = (iso) => localStorage.setItem(SYNCED_KEY, iso || new Date().toISOString())

async function call(method, code, body) {
  const response = await fetch(`/api/sync?code=${encodeURIComponent(code)}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  let payload = null
  try { payload = await response.json() } catch { /* réponse non JSON */ }
  if (!response.ok) {
    const error = new Error(payload?.message || `Échec de la synchronisation (${response.status})`)
    error.code = payload?.error || String(response.status)
    throw error
  }
  return payload
}

/** Lit l'instantané distant, ou null s'il n'existe pas encore */
export async function pull(code) {
  try {
    return await call('GET', code)
  } catch (error) {
    if (error.code === 'not-found') return null
    throw error
  }
}

/**
 * Dépose l'état courant.
 *
 * Si le dépôt distant a été modifié depuis le dernier échange de cet appareil,
 * l'envoi est refusé : écraser en silence le travail fait ailleurs serait la
 * pire des issues. L'appelant décide alors de récupérer ou de forcer.
 */
export async function push(code, state, { force = false } = {}) {
  if (!force) {
    const remote = await pull(code)
    const localSync = lastSyncAt()
    if (remote?.updatedAt && localSync && new Date(remote.updatedAt) > localSync) {
      const conflict = new Error('Le code contient une version plus récente, déposée depuis un autre appareil.')
      conflict.code = 'conflict'
      conflict.remoteUpdatedAt = remote.updatedAt
      throw conflict
    }
  }
  const result = await call('PUT', code, { state })
  markSynced(result?.updatedAt)
  return result
}

/** Accuse réception d'une récupération réussie */
export function markPulled(updatedAt) {
  markSynced(updatedAt)
}
