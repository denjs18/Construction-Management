import { useState } from 'react'
import { useApp } from '../../contexts/AppContext'
import { Plus, Trash2, Camera, ChevronDown } from 'lucide-react'
import Header from '../layout/Header'

const PHASE_LABELS = [
  'Démolition', 'Gros œuvre', 'Isolation', 'Plomberie brute',
  'Électricité brute', 'Cloisons', 'Menuiseries', 'Sols',
  'Peinture', 'Plomberie finition', 'Électricité finition', 'Finitions', 'Autre',
]

function JournalEntry({ entry, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const date = new Date(entry.createdAt)

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <button
        className="w-full flex items-start gap-3 p-4 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="bg-blue-100 rounded-xl p-2 flex-shrink-0">
          <Camera size={18} className="text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-xs font-semibold text-blue-600">{entry.phase}</p>
            <span className="text-gray-200">·</span>
            <p className="text-xs text-gray-400">
              {date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <p className={`text-sm text-gray-700 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
            {entry.note}
          </p>
          {entry.note.length > 100 && (
            <p className="text-xs text-blue-500 mt-1">{expanded ? '▲ Réduire' : '▼ Voir plus'}</p>
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-3 flex justify-end">
          <button
            onClick={() => onDelete(entry.id)}
            className="flex items-center gap-1.5 text-red-400 text-xs active:text-red-600 transition-colors"
          >
            <Trash2 size={13} />
            Supprimer
          </button>
        </div>
      )}
    </div>
  )
}

export default function Journal() {
  const { activeProject, dispatch } = useApp()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ phase: PHASE_LABELS[0], note: '' })
  const [filterPhase, setFilterPhase] = useState('all')

  if (!activeProject) return null

  const handleAdd = () => {
    if (!form.note.trim()) return
    dispatch({
      type: 'ADD_JOURNAL_ENTRY',
      payload: {
        projectId: activeProject.id,
        entry: { phase: form.phase, note: form.note.trim() },
      },
    })
    setForm({ phase: form.phase, note: '' })
    setShowForm(false)
  }

  const handleDelete = (entryId) => {
    if (!confirm('Supprimer cette note ?')) return
    dispatch({ type: 'DELETE_JOURNAL_ENTRY', payload: { projectId: activeProject.id, entryId } })
  }

  const phases = ['all', ...new Set(activeProject.journal.map(e => e.phase))]

  const filtered = filterPhase === 'all'
    ? activeProject.journal
    : activeProject.journal.filter(e => e.phase === filterPhase)

  // Group by month
  const grouped = filtered.reduce((acc, entry) => {
    const d = new Date(entry.createdAt)
    const key = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    if (!acc[key]) acc[key] = []
    acc[key].push(entry)
    return acc
  }, {})

  return (
    <div className="pb-24">
      <Header title="Journal de chantier" subtitle={`${activeProject.journal.length} notes`} />

      {/* Add button */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <button
          onClick={() => setShowForm(s => !s)}
          className="w-full btn-primary flex items-center justify-center gap-2"
        >
          <Plus size={18} />
          Ajouter une note
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white border-b border-gray-100 px-4 py-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">Phase de chantier</label>
            <div className="relative">
              <select
                value={form.phase}
                onChange={e => setForm(f => ({ ...f, phase: e.target.value }))}
                className="w-full appearance-none border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
              >
                {PHASE_LABELS.map(p => <option key={p}>{p}</option>)}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">Note de chantier</label>
            <textarea
              rows={5}
              placeholder="Décrivez ce que vous avez fait, les mesures prises, les matériaux utilisés, les problèmes rencontrés..."
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={!form.note.trim()} className="flex-1 btn-primary py-2.5 text-sm disabled:opacity-40">
              Enregistrer
            </button>
            <button onClick={() => setShowForm(false)} className="flex-1 btn-secondary py-2.5 text-sm">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Phase filter */}
      {phases.length > 2 && (
        <div className="bg-white border-b border-gray-100 px-4 py-2">
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {phases.map(p => (
              <button
                key={p}
                onClick={() => setFilterPhase(p)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                  filterPhase === p ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {p === 'all' ? 'Toutes' : p}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="p-4 space-y-6">
        {Object.keys(grouped).length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Camera size={56} className="mx-auto mb-4 opacity-20" />
            <p className="font-semibold text-gray-600 text-lg">Aucune note</p>
            <p className="text-sm mt-2 leading-relaxed">
              Documentez votre chantier au fur et à mesure.<br />
              Indispensable pour l'assurance et la revente.
            </p>
          </div>
        ) : (
          Object.entries(grouped).map(([month, entries]) => (
            <div key={month}>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{month}</p>
              <div className="space-y-2">
                {entries.map(entry => (
                  <JournalEntry key={entry.id} entry={entry} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
