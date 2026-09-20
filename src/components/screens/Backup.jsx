import { useState, useRef, useMemo } from 'react'
import {
  Download, Upload, ShieldCheck, ShieldAlert, AlertTriangle, Info,
  HardDrive, Smartphone, CheckCircle2,
} from 'lucide-react'
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
