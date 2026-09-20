import * as vercelBlob from '@vercel/blob'

// En test, un stockage en mémoire prend la place de Vercel Blob : c'est bien
// ce fichier qui est exercé, et non une imitation.
const blob = globalThis.__blobStub || vercelBlob
const { put, list, del } = blob

/**
 * Synchronisation d'un projet par code, sans compte.
 *
 * Le code est la seule clé d'accès : il ouvre la lecture comme l'écriture.
 * C'est un compromis assumé — pas de mot de passe à retenir, pas d'inscription —
 * qui suppose de ne pas le diffuser. Son alphabet écarte les caractères qu'on
 * confond en les recopiant, et il compte assez de combinaisons pour qu'un tirage
 * au hasard n'ait aucune chance d'aboutir.
 *
 * GET  /api/sync?code=XXXX-XXXX-XXXX  → renvoie l'instantané stocké
 * PUT  /api/sync?code=XXXX-XXXX-XXXX  → remplace l'instantané
 */

const CODE_PATTERN = /^[0-9A-HJ-NP-TV-Z]{4}-[0-9A-HJ-NP-TV-Z]{4}-[0-9A-HJ-NP-TV-Z]{4}$/
const MAX_BYTES = 4 * 1024 * 1024

const pathFor = (code) => `sync/${code}.json`

async function findBlob(code) {
  const { blobs } = await list({ prefix: pathFor(code), limit: 1 })
  return blobs.find(b => b.pathname === pathFor(code)) || null
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({
      error: 'storage-not-configured',
      message: "La synchronisation n'est pas configurée sur ce déploiement.",
    })
  }

  const code = String(req.query.code || '').trim().toUpperCase()
  if (!CODE_PATTERN.test(code)) {
    return res.status(400).json({ error: 'invalid-code', message: 'Code de synchronisation invalide.' })
  }

  try {
    if (req.method === 'GET') {
      const blob = await findBlob(code)
      if (!blob) {
        return res.status(404).json({ error: 'not-found', message: 'Aucun projet enregistré sous ce code.' })
      }
      const response = await fetch(blob.url, { cache: 'no-store' })
      if (!response.ok) throw new Error(`lecture impossible (${response.status})`)
      const payload = await response.json()
      return res.status(200).json(payload)
    }

    if (req.method === 'PUT') {
      const body = req.body && typeof req.body === 'object' ? req.body : null
      if (!body || !body.state || !Array.isArray(body.state.projects)) {
        return res.status(400).json({ error: 'invalid-payload', message: 'Contenu inattendu.' })
      }

      const serialised = JSON.stringify({
        format: 'monchantier/v1',
        updatedAt: new Date().toISOString(),
        state: body.state,
      })
      if (serialised.length > MAX_BYTES) {
        return res.status(413).json({ error: 'too-large', message: 'Projet trop volumineux pour la synchronisation.' })
      }

      // Le suffixe aléatoire est désactivé pour que le code seul suffise à
      // retrouver l'instantané ; l'adresse du fichier ne sort jamais d'ici.
      const blob = await put(pathFor(code), serialised, {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      })
      return res.status(200).json({ ok: true, updatedAt: JSON.parse(serialised).updatedAt, size: blob.size })
    }

    if (req.method === 'DELETE') {
      const blob = await findBlob(code)
      if (blob) await del(blob.url)
      return res.status(200).json({ ok: true })
    }

    res.setHeader('Allow', 'GET, PUT, DELETE')
    return res.status(405).json({ error: 'method-not-allowed' })
  } catch (error) {
    return res.status(500).json({ error: 'storage-failure', message: String(error?.message || error) })
  }
}
