/**
 * Contrôles de la synchronisation par code.
 *
 * La fonction serveur est exercée telle quelle, avec un stockage en mémoire à
 * la place de Vercel Blob : c'est bien le code livré qui est vérifié, et non
 * une imitation. Le cas qui compte est celui de deux appareils qui divergent —
 * écraser en silence le travail fait ailleurs serait la pire des issues.
 */

import { createServer } from 'node:http'

let failures = 0
let total = 0
const section = (name) => console.log(`\n— ${name} —`)
const check = (name, actual, expected) => {
  total += 1
  if (actual === expected) console.log(`  ✓ ${name}`)
  else { failures += 1; console.log(`  ✗ ${name} : attendu ${expected}, obtenu ${actual}`) }
}

/* --------------- stockage en mémoire à la place de Vercel Blob --------------- */

const store = new Map()
globalThis.__blobStub = {
  put: async (pathname, body) => {
    store.set(pathname, body)
    return { url: `memory://${pathname}`, size: body.length, pathname }
  },
  list: async ({ prefix }) => ({
    blobs: [...store.keys()]
      .filter(k => k.startsWith(prefix))
      .map(k => ({ pathname: k, url: `memory://${k}` })),
  }),
  del: async (url) => { store.delete(url.replace('memory://', '')) },
}

// le handler lit les blobs par fetch : on intercepte le schéma memory://
const realFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url
  if (url.startsWith('memory://')) {
    const body = store.get(url.replace('memory://', ''))
    return body === undefined
      ? new Response(null, { status: 404 })
      : new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  return realFetch(input, init)
}

process.env.BLOB_READ_WRITE_TOKEN = 'stub'
const { default: handler } = await import('../api/sync.js')

/* ------------------- serveur minimal aux conventions Vercel ------------------- */

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')

  req.query = Object.fromEntries(url.searchParams)
  try { req.body = raw ? JSON.parse(raw) : undefined } catch { req.body = undefined }

  res.status = (code) => { res.statusCode = code; return res }
  res.json = (payload) => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(payload))
    return res
  }
  await handler(req, res)
})
await new Promise(r => server.listen(4199, '127.0.0.1', r))
const BASE = 'http://127.0.0.1:4199'

/* --------------------- le client, avec un stockage simulé --------------------- */

function makeDevice() {
  const memory = new Map()
  return {
    localStorage: {
      getItem: (k) => (memory.has(k) ? memory.get(k) : null),
      setItem: (k, v) => memory.set(k, String(v)),
      removeItem: (k) => memory.delete(k),
    },
  }
}

// le module client s'appuie sur localStorage et sur des chemins relatifs
const origin = globalThis.fetch
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input.url
  return origin(url.startsWith('/') ? BASE + url : url, init)
}

const deviceA = makeDevice()
const deviceB = makeDevice()
const use = (device) => { globalThis.localStorage = device.localStorage }

use(deviceA)
const sync = await import('../src/lib/sync.js')

const stateWith = (name, walls) => ({
  projects: [{
    id: 'P1', name, type: 'custom', address: '', totalBudget: 0, startDate: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z', phases: [], budget: { total: 0, lots: [], expenses: [] },
    journal: [],
    plan: {
      levels: [{ id: 'rdc', name: 'RDC', ceilingHeight: 250, walls, openings: [], roomMeta: [], equipment: [], electrical: [] }],
      stairs: [], floorThickness: 25,
    },
  }],
  activeProjectId: 'P1',
})
const wall = (id) => ({ id, a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20, kind: 'porteur' })

/* --------------------------------- contrôles --------------------------------- */

section('Forme du code')
{
  const code = sync.generateCode()
  check('format en trois groupes de quatre', sync.CODE_PATTERN.test(code), true)
  check('aucun caractère ambigu', /[OIU]/.test(code.replace(/-/g, '')), false)
  check('mise en forme à la saisie', sync.formatCode('k7p29xqm4rtv'), 'K7P2-9XQM-4RTV')
  check('saisie partielle tolérée', sync.formatCode('k7p2 9x'), 'K7P2-9X')
  const codes = new Set(Array.from({ length: 200 }, () => sync.generateCode()))
  check('deux cents tirages sans collision', codes.size, 200)
}

section('Code invalide refusé')
{
  const response = await fetch(`${BASE}/api/sync?code=ABC`)
  check('requête rejetée', response.status, 400)
  const unknown = await fetch(`${BASE}/api/sync?code=AAAA-BBBB-CCCC`)
  check('code inconnu signalé comme absent', unknown.status, 404)
}

section('Aller-retour entre deux appareils')
const code = sync.generateCode()
{
  use(deviceA)
  await sync.push(code, stateWith('Maison A', [wall('w1')]))
  check('envoi accepté', !!sync.lastSyncAt(), true)

  use(deviceB)
  const remote = await sync.pull(code)
  check('le second appareil retrouve le projet', remote.state.projects[0].name, 'Maison A')
  check('les murs ont suivi', remote.state.projects[0].plan.levels[0].walls.length, 1)
  sync.markPulled(remote.updatedAt)
}

section('Divergence entre appareils')
{
  // B travaille et dépose ; A n'est au courant de rien
  use(deviceB)
  await new Promise(r => setTimeout(r, 15))
  await sync.push(code, stateWith('Maison A — corrigée sur B', [wall('w1'), wall('w2')]))

  use(deviceA)
  let refused = false
  let conflictAt = null
  try {
    await sync.push(code, stateWith('Maison A', [wall('w1')]))
  } catch (error) {
    refused = error.code === 'conflict'
    conflictAt = error.remoteUpdatedAt
  }
  check('un envoi périmé est refusé', refused, true)
  check('la date de la version distante est remontée', !!conflictAt, true)

  // A récupère, puis peut déposer
  const remote = await sync.pull(code)
  check('A récupère bien le travail de B', remote.state.projects[0].name, 'Maison A — corrigée sur B')
  sync.markPulled(remote.updatedAt)
  await new Promise(r => setTimeout(r, 15))
  await sync.push(code, stateWith('Maison A — fusionnée', [wall('w1'), wall('w2'), wall('w3')]))
  const after = await sync.pull(code)
  check('le dépôt suivant passe', after.state.projects[0].name, 'Maison A — fusionnée')
}

section('Écrasement volontaire')
{
  use(deviceB)
  // B est périmé, mais force
  await sync.push(code, stateWith('Maison A — imposée par B', [wall('w9')]), { force: true })
  const after = await sync.pull(code)
  check('le forçage remplace le dépôt', after.state.projects[0].name, 'Maison A — imposée par B')
}

section('Stockage indisponible')
{
  delete process.env.BLOB_READ_WRITE_TOKEN
  const response = await fetch(`${BASE}/api/sync?code=${code}`)
  check('erreur explicite plutôt que silence', response.status, 503)
  const body = await response.json()
  check('cause identifiable', body.error, 'storage-not-configured')
  process.env.BLOB_READ_WRITE_TOKEN = 'stub'
}

server.close()
console.log(
  failures === 0
    ? `\n✅ ${total} contrôles passent\n`
    : `\n❌ ${failures} contrôle(s) en échec sur ${total}\n`,
)
process.exit(failures ? 1 : 0)
