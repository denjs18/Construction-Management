import { useState, useRef, useMemo } from 'react'
import {
  Download, Upload, ShieldCheck, ShieldAlert, AlertTriangle, Info,
  HardDrive, Smartphone, CheckCircle2, RefreshCw, Copy, CloudUpload,
  CloudDownload, KeyRound, Loader2,
} from 'lucide-react'
import {
  generateCode, formatCode, CODE_PATTERN, storedCode, storeCode, forgetCode,
  lastSyncAt, pull, push, markPulled,
} from '../../lib/sync'
import Header from '../layout/Header'
import { useApp } from '../../contexts/AppContext'

const STORAGE_KEY = 'monchantier-state'
const BACKUP_KEY = 'monchantier-last-backup'

/** Date du dernier export, mémorisée à part pour survivre à un import */
export function lastBackupAt() {
  const raw = localStorage.getItem(BACKUP_KEY)
  return raw ? new Date(raw) : null
}

export function markBackedUp() {
  localStorage.setItem(BACKUP_KEY, new Date().toISOString())
}

/** Nombre de jours écoulés depuis la dernière sauvegarde, null si jamais */
export function daysSinceBackup() {
  const at = lastBackupAt()
  if (!at) return null
  return Math.floor((Date.now() - at.getTime()) / 86400000)
}

export default function Backup() {
  const { state, dispatch } = useApp()
  const fileRef = useRef(null)
  const [message, setMessage] = useState(null)
  const [persisted, setPersisted] = useState(null)

  const size = useMemo(() => {
    const raw = localStorage.getItem(STORAGE_KEY) || ''
    return Math.round((new Blob([raw]).size / 1024) * 10) / 10
  }, [state])

  const since = daysSinceBackup()
  const lastAt = lastBackupAt()

  // État du stockage durable, si le navigateur sait répondre
  useMemo(() => {
    if (!navigator.storage?.persisted) return
    navigator.storage.persisted().then(setPersisted).catch(() => {})
  }, [])

  const exportAll = () => {
    const payload = {
      format: 'monchantier/v1',
      exportedAt: new Date().toISOString(),
      state,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const stamp = new Date().toISOString().slice(0, 10)
    const name = state.projects.length === 1
      ? state.projects[0].name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase()
      : 'projets'
    const link = document.createElement('a')
    link.href = url
    link.download = `monchantier-${name}-${stamp}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    markBackedUp()
    setMessage({ kind: 'ok', text: 'Sauvegarde enregistrée. Rangez-la dans votre cloud ou envoyez-la-vous par courriel.' })
  }

  const importFile = async (file) => {
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const incoming = data?.state?.projects ? data.state : data
      if (!Array.isArray(incoming?.projects)) {
        setMessage({ kind: 'error', text: "Ce fichier ne contient pas de projet MonChantier." })
        return
      }

      // Les projets du fichier remplacent ceux de même identifiant et
      // s'ajoutent aux autres : restaurer ne détruit jamais un projet absent
      // de la sauvegarde.
      const merged = [...state.projects]
      let replaced = 0
      let added = 0
      for (const project of incoming.projects) {
        const at = merged.findIndex(p => p.id === project.id)
        if (at >= 0) { merged[at] = project; replaced += 1 }
        else { merged.push(project); added += 1 }
      }

      dispatch({
        type: 'LOAD_STATE',
        payload: {
          projects: merged,
          activeProjectId: incoming.activeProjectId || merged[0]?.id || null,
        },
      })
      setMessage({
        kind: 'ok',
        text: `${added} projet${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''}, ${replaced} mis à jour.`,
      })
    } catch {
      setMessage({ kind: 'error', text: "Fichier illisible. Vérifiez qu'il s'agit bien d'une sauvegarde MonChantier." })
    }
  }

  const stale = since === null || since > 14

  return (
    <div className="pb-24 bg-slate-50 min-h-screen">
      <Header title="Sauvegarde" back />

      <div className="p-4 space-y-4">
        {/* État */}
        <div className={`rounded-2xl p-4 ${stale ? 'bg-amber-50 border border-amber-100' : 'bg-green-50 border border-green-100'}`}>
          <div className="flex gap-2">
            {stale
              ? <ShieldAlert size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
              : <ShieldCheck size={18} className="text-green-600 flex-shrink-0 mt-0.5" />}
            <div className="flex-1">
              <p className={`font-semibold text-sm ${stale ? 'text-amber-800' : 'text-green-800'}`}>
                {since === null
                  ? 'Aucune sauvegarde à ce jour'
                  : since === 0
                    ? "Sauvegardé aujourd'hui"
                    : `Dernière sauvegarde il y a ${since} jour${since > 1 ? 's' : ''}`}
              </p>
              <p className={`text-xs mt-0.5 leading-relaxed ${stale ? 'text-amber-700' : 'text-green-700'}`}>
                {since === null
                  ? "Votre projet n'existe que dans ce navigateur. Un nettoyage de données et tout disparaît."
                  : `Le ${lastAt.toLocaleDateString('fr-FR')}. Vos données occupent ${size} ko.`}
              </p>
            </div>
          </div>
        </div>

        {/* Exporter */}
        <div className="card space-y-3">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Download size={17} className="text-blue-600" />
            Enregistrer une sauvegarde
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            Un seul fichier contenant tout : plans, niveaux, réseaux, budget, dépenses et journal.
            Rangez-le dans votre cloud ou envoyez-le-vous par courriel — il ne dépend d'aucun service
            et restera lisible dans dix ans.
          </p>
          <button onClick={exportAll} className="w-full btn-primary flex items-center justify-center gap-2">
            <Download size={17} />
            Télécharger la sauvegarde
          </button>
        </div>

        {/* Importer */}
        <div className="card space-y-3">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Upload size={17} className="text-blue-600" />
            Restaurer ou transférer
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            Reprenez une sauvegarde après un effacement, ou reprenez votre projet sur un autre
            téléphone. Les projets du fichier remplacent ceux de même nom et s'ajoutent aux autres :
            rien n'est supprimé.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={e => importFile(e.target.files?.[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full btn-secondary flex items-center justify-center gap-2"
          >
            <Upload size={17} />
            Choisir un fichier
          </button>
        </div>

        {message && (
          <div className={`rounded-2xl p-4 flex gap-2 ${
            message.kind === 'ok' ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'
          }`}>
            {message.kind === 'ok'
              ? <CheckCircle2 size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
              : <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />}
            <p className={`text-xs leading-relaxed ${message.kind === 'ok' ? 'text-green-800' : 'text-red-700'}`}>
              {message.text}
            </p>
          </div>
        )}

        {/* Synchronisation par code */}
        <SyncCard />

        {/* Où vivent les données */}
        <div className="card space-y-3">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
            <HardDrive size={16} className="text-gray-500" />
            Où sont vos données
          </h3>
          <p className="text-xs text-gray-600 leading-relaxed">
            Tout reste sur votre appareil, dans le stockage de ce navigateur. Rien n'est envoyé
            nulle part, aucun compte n'est nécessaire, et l'app fonctionne sans réseau.
          </p>
          <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
            <Row label="Emplacement" value="Ce navigateur, cet appareil" />
            <Row label="Taille" value={`${size} ko`} />
            <Row
              label="Stockage durable"
              value={persisted === null ? 'Inconnu' : persisted ? 'Accordé' : 'Non accordé'}
            />
          </div>
        </div>

        {/* Le vrai risque */}
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
            <Smartphone size={16} />
            Installez l'app sur votre écran d'accueil
          </p>
          <p className="text-xs text-amber-800 leading-relaxed">
            Sur iPhone, Safari efface le stockage d'un site qu'on n'a pas ouvert depuis sept jours.
            Sur un chantier qui dure des mois, c'est un projet entier qui peut disparaître entre deux
            visites.
          </p>
          <p className="text-xs text-amber-800 leading-relaxed">
            Une app ajoutée à l'écran d'accueil échappe à cette règle. Depuis Safari : bouton de
            partage, puis <span className="font-semibold">Sur l'écran d'accueil</span>. Sur Android,
            Chrome propose <span className="font-semibold">Installer l'application</span> dans son menu.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-2">
          <Info size={15} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800 leading-relaxed">
            Prenez l'habitude d'exporter après chaque grosse séance de travail. Le fichier est
            minuscule et c'est la seule protection qui ne dépend de personne.
          </p>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-gray-800">{value}</span>
    </div>
  )
}


/* ------------------------------------------------- synchronisation */

/**
 * Synchronisation par code, sans compte.
 *
 * Le code tient lieu de clé : il ouvre la lecture comme l'écriture, ce qui est
 * dit sans détour à l'utilisateur. L'envoi vérifie d'abord qu'aucun autre
 * appareil n'a déposé une version plus récente : écraser en silence le travail
 * fait ailleurs serait pire que ne pas synchroniser du tout.
 */
function SyncCard() {
  const { state, dispatch } = useApp()
  const [code, setCode] = useState(() => storedCode())
  const [entry, setEntry] = useState('')
  const [busy, setBusy] = useState(null)
  const [note, setNote] = useState(null)
  const [conflict, setConflict] = useState(null)
  const [copied, setCopied] = useState(false)

  const syncedAt = lastSyncAt()

  const report = (kind, text) => setNote({ kind, text })

  const doPush = async (targetCode, { force = false } = {}) => {
    setBusy('push'); setNote(null); setConflict(null)
    try {
      await push(targetCode, state, { force })
      storeCode(targetCode)
      setCode(targetCode)
      report('ok', 'Projet envoyé. Saisissez ce code sur un autre appareil pour le récupérer.')
    } catch (error) {
      if (error.code === 'conflict') {
        setConflict({ code: targetCode, at: error.remoteUpdatedAt })
      } else if (error.code === 'storage-not-configured') {
        report('error', "La synchronisation n'est pas encore activée sur ce déploiement. La sauvegarde par fichier, elle, fonctionne.")
      } else {
        report('error', error.message)
      }
    } finally {
      setBusy(null)
    }
  }

  const doPull = async (targetCode) => {
    setBusy('pull'); setNote(null); setConflict(null)
    try {
      const remote = await pull(targetCode)
      if (!remote) {
        report('error', "Aucun projet enregistré sous ce code. Vérifiez la saisie.")
        return
      }
      const incoming = remote.state
      const merged = [...state.projects]
      let added = 0
      let replaced = 0
      for (const project of incoming.projects || []) {
        const at = merged.findIndex(p => p.id === project.id)
        if (at >= 0) { merged[at] = project; replaced += 1 }
        else { merged.push(project); added += 1 }
      }
      dispatch({
        type: 'LOAD_STATE',
        payload: { projects: merged, activeProjectId: incoming.activeProjectId || merged[0]?.id || null },
      })
      storeCode(targetCode)
      setCode(targetCode)
      markPulled(remote.updatedAt)
      report('ok', `${added} projet${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''}, ${replaced} mis à jour depuis le code.`)
    } catch (error) {
      report('error', error.code === 'storage-not-configured'
        ? "La synchronisation n'est pas encore activée sur ce déploiement."
        : error.message)
    } finally {
      setBusy(null)
    }
  }

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* le presse-papiers peut être refusé */ }
  }

  return (
    <div className="card space-y-3">
      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
        <RefreshCw size={17} className="text-blue-600" />
        Synchroniser entre appareils
      </h3>

      {!code && (
        <>
          <p className="text-sm text-gray-600 leading-relaxed">
            Obtenez un code, et retrouvez votre projet sur n'importe quel autre téléphone ou
            ordinateur en le saisissant. Aucun compte, aucun mot de passe.
          </p>
          <button
            onClick={() => doPush(generateCode())}
            disabled={busy}
            className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy === 'push' ? <Loader2 size={17} className="animate-spin" /> : <KeyRound size={17} />}
            Créer un code de synchronisation
          </button>
        </>
      )}

      {code && (
        <>
          <div className="bg-blue-50 rounded-2xl p-4 text-center">
            <p className="text-[11px] text-blue-600 uppercase tracking-wide font-semibold">Votre code</p>
            <p className="text-2xl font-bold text-blue-900 tracking-wider tabular-nums mt-1">{code}</p>
            <button
              onClick={copyCode}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700"
            >
              <Copy size={12} />
              {copied ? 'Copié' : 'Copier'}
            </button>
          </div>

          <p className="text-xs text-gray-500 leading-relaxed">
            {syncedAt
              ? `Dernier échange le ${syncedAt.toLocaleDateString('fr-FR')} à ${syncedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`
              : "Pas encore d'échange depuis cet appareil."}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => doPush(code)}
              disabled={busy}
              className="flex items-center justify-center gap-1.5 bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50"
            >
              {busy === 'push' ? <Loader2 size={15} className="animate-spin" /> : <CloudUpload size={15} />}
              Envoyer
            </button>
            <button
              onClick={() => doPull(code)}
              disabled={busy}
              className="flex items-center justify-center gap-1.5 bg-gray-100 text-gray-700 text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50"
            >
              {busy === 'pull' ? <Loader2 size={15} className="animate-spin" /> : <CloudDownload size={15} />}
              Récupérer
            </button>
          </div>

          <button
            onClick={() => { forgetCode(); setCode(null); setNote(null) }}
            className="w-full text-xs text-gray-500 py-1"
          >
            Oublier ce code sur cet appareil
          </button>
        </>
      )}

      {/* Reprendre un projet depuis un autre appareil */}
      <div className="pt-2 border-t border-gray-100 space-y-2">
        <label className="block text-xs font-semibold text-gray-700">
          Reprendre un projet depuis un code
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            placeholder="XXXX-XXXX-XXXX"
            value={entry}
            onChange={e => setEntry(formatCode(e.target.value))}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-center tracking-wider tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => doPull(entry)}
            disabled={busy || !CODE_PATTERN.test(entry)}
            className="px-4 rounded-xl bg-slate-800 text-white text-sm font-semibold disabled:opacity-35"
          >
            Ouvrir
          </button>
        </div>
      </div>

      {conflict && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 space-y-2">
          <p className="text-xs text-amber-800 leading-relaxed">
            Une version plus récente a été déposée sous ce code le{' '}
            {new Date(conflict.at).toLocaleDateString('fr-FR')} depuis un autre appareil.
            Récupérez-la d'abord, ou écrasez-la si vous êtes certain que celle-ci est la bonne.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => doPull(conflict.code)}
              className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold"
            >
              Récupérer d'abord
            </button>
            <button
              onClick={() => doPush(conflict.code, { force: true })}
              className="flex-1 py-2 rounded-xl bg-amber-100 text-amber-800 text-xs font-semibold"
            >
              Écraser quand même
            </button>
          </div>
        </div>
      )}

      {note && (
        <div className={`rounded-xl p-3 flex gap-2 ${note.kind === 'ok' ? 'bg-green-50' : 'bg-red-50'}`}>
          {note.kind === 'ok'
            ? <CheckCircle2 size={14} className="text-green-600 flex-shrink-0 mt-0.5" />
            : <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />}
          <p className={`text-xs leading-relaxed ${note.kind === 'ok' ? 'text-green-800' : 'text-red-700'}`}>
            {note.text}
          </p>
        </div>
      )}

      <div className="bg-slate-50 rounded-xl p-3 flex gap-2">
        <Info size={14} className="text-gray-500 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-600 leading-relaxed">
          Le code seul donne accès au projet, en lecture comme en modification : ne le publiez pas.
          Vos données sont alors déposées sur un serveur, et non plus seulement sur votre téléphone —
          y compris l'adresse du chantier si vous l'avez renseignée. La sauvegarde par fichier reste
          la protection qui ne dépend de personne.
        </p>
      </div>
    </div>
  )
}
