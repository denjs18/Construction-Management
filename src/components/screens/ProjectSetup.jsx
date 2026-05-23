import { useState, useEffect } from 'react'
import { HardHat, ChevronRight, CheckSquare, Square } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { PROJECT_TYPES, PROJECT_TEMPLATES } from '../../data/templates'

export default function ProjectSetup() {
  const { dispatch } = useApp()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    name: '',
    type: '',
    address: '',
    totalBudget: '',
    startDate: new Date().toISOString().split('T')[0],
  })
  const [selectedPhaseIds, setSelectedPhaseIds] = useState([])

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  // When type is selected, pre-select all phases
  useEffect(() => {
    if (form.type && PROJECT_TEMPLATES[form.type]) {
      setSelectedPhaseIds(PROJECT_TEMPLATES[form.type].phases.map(p => p.id))
    }
  }, [form.type])

  const togglePhase = (id) => {
    setSelectedPhaseIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  const handleCreate = () => {
    dispatch({ type: 'CREATE_PROJECT', payload: { ...form, selectedPhaseIds } })
  }

  const templatePhases = form.type && PROJECT_TEMPLATES[form.type]
    ? PROJECT_TEMPLATES[form.type].phases
    : []

  // Step 1 — Welcome
  if (step === 1) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-6">
          <HardHat size={36} className="text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white text-center mb-2">MonChantier</h1>
        <p className="text-blue-200 text-center mb-10 text-sm leading-relaxed">
          Votre assistant pour l'autoconstruction<br />et l'autorénovation
        </p>
        <button
          onClick={() => setStep(2)}
          className="w-full bg-white text-blue-700 font-bold py-4 rounded-2xl text-lg shadow-lg active:scale-95 transition-transform"
        >
          Créer mon premier projet
        </button>
        <p className="text-blue-300 text-xs mt-6 text-center">
          Tout est sauvegardé sur votre appareil, sans compte requis.
        </p>
      </div>
    )
  }

  // Step 2 — Type de projet
  if (step === 2) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <div className="bg-blue-600 text-white px-6 py-8">
          <div className="flex items-center gap-2 mb-3">
            {[1,2,3,4].map(n => (
              <div key={n} className={`h-1.5 flex-1 rounded-full ${n <= 1 ? 'bg-white' : 'bg-white/30'}`} />
            ))}
          </div>
          <p className="text-blue-200 text-sm mb-1">Étape 1 sur 4</p>
          <h2 className="text-2xl font-bold">Type de projet</h2>
          <p className="text-blue-200 text-sm mt-1">Le planning sera généré automatiquement</p>
        </div>
        <div className="flex-1 p-4 space-y-3 pb-24">
          {PROJECT_TYPES.map(type => (
            <button
              key={type.id}
              onClick={() => { set('type', type.id); setStep(3) }}
              className="w-full bg-white rounded-2xl p-4 flex items-center gap-4 shadow-sm active:bg-blue-50 transition-colors text-left"
            >
              <span className="text-3xl">{type.icon}</span>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{type.label}</p>
                <p className="text-sm text-gray-500">{type.description}</p>
              </div>
              <ChevronRight size={20} className="text-gray-300" />
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Step 3 — Infos projet
  if (step === 3) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <div className="bg-blue-600 text-white px-6 py-8">
          <div className="flex items-center gap-2 mb-3">
            {[1,2,3,4].map(n => (
              <div key={n} className={`h-1.5 flex-1 rounded-full ${n <= 2 ? 'bg-white' : 'bg-white/30'}`} />
            ))}
          </div>
          <p className="text-blue-200 text-sm mb-1">Étape 2 sur 4</p>
          <h2 className="text-2xl font-bold">Votre projet</h2>
          <p className="text-blue-200 text-sm mt-1">Ces informations peuvent être modifiées plus tard</p>
        </div>
        <div className="flex-1 p-4 space-y-4 pb-8">
          <div className="card space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Nom du projet *</label>
              <input
                type="text"
                placeholder="Ex: Rénovation maison Bordeaux"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Adresse (optionnel)</label>
              <input
                type="text"
                placeholder="12 rue des Lilas, 33000 Bordeaux"
                value={form.address}
                onChange={e => set('address', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Budget total estimé (€)</label>
              <input
                type="number"
                placeholder="Ex: 35000"
                value={form.totalBudget}
                onChange={e => set('totalBudget', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Date de début prévue</label>
              <input
                type="date"
                value={form.startDate}
                onChange={e => set('startDate', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <button
            onClick={() => setStep(4)}
            disabled={!form.name.trim()}
            className="w-full btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Choisir les travaux →
          </button>
          <button onClick={() => setStep(2)} className="w-full text-gray-500 py-2 text-sm">
            ← Retour
          </button>
        </div>
      </div>
    )
  }

  // Step 4 — Sélection des phases/travaux
  if (step === 4) {
    const allSelected = selectedPhaseIds.length === templatePhases.length
    const toggleAll = () => {
      if (allSelected) setSelectedPhaseIds([])
      else setSelectedPhaseIds(templatePhases.map(p => p.id))
    }

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <div className="bg-blue-600 text-white px-6 py-8">
          <div className="flex items-center gap-2 mb-3">
            {[1,2,3,4].map(n => (
              <div key={n} className={`h-1.5 flex-1 rounded-full ${n <= 3 ? 'bg-white' : 'bg-white/30'}`} />
            ))}
          </div>
          <p className="text-blue-200 text-sm mb-1">Étape 3 sur 4</p>
          <h2 className="text-2xl font-bold">Quels travaux ?</h2>
          <p className="text-blue-200 text-sm mt-1">
            Décochez les phases que vous n'avez pas à faire
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Sélectionner tout */}
          <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">
              {selectedPhaseIds.length} phase{selectedPhaseIds.length > 1 ? 's' : ''} sélectionnée{selectedPhaseIds.length > 1 ? 's' : ''}
            </span>
            <button onClick={toggleAll} className="text-sm text-blue-600 font-medium">
              {allSelected ? 'Tout décocher' : 'Tout cocher'}
            </button>
          </div>

          <div className="p-4 space-y-2 pb-40">
            {templatePhases.map(phase => {
              const selected = selectedPhaseIds.includes(phase.id)
              return (
                <button
                  key={phase.id}
                  onClick={() => togglePhase(phase.id)}
                  className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
                    selected
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-white border-gray-100 opacity-50'
                  }`}
                >
                  <span className="text-2xl">{phase.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
                      {phase.name}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {phase.tasks.length} tâche{phase.tasks.length > 1 ? 's' : ''}
                    </p>
                  </div>
                  {selected
                    ? <CheckSquare size={22} className="text-blue-600 flex-shrink-0" />
                    : <Square size={22} className="text-gray-300 flex-shrink-0" />
                  }
                </button>
              )
            })}

            <div className="bg-amber-50 rounded-2xl p-4 text-sm text-amber-700 mt-2">
              <p className="font-semibold mb-1">💡 Bon à savoir</p>
              <p className="text-amber-600 text-xs leading-relaxed">
                Vous pouvez ajouter ou supprimer des phases après la création du projet depuis l'écran Planning.
              </p>
            </div>
          </div>
        </div>

        {/* Bouton fixe en bas */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 space-y-2">
          <button
            onClick={handleCreate}
            disabled={selectedPhaseIds.length === 0}
            className="w-full btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Créer le projet ({selectedPhaseIds.length} phase{selectedPhaseIds.length > 1 ? 's' : ''}) →
          </button>
          <button onClick={() => setStep(3)} className="w-full text-gray-500 py-2 text-sm">
            ← Retour
          </button>
        </div>
      </div>
    )
  }

  return null
}
