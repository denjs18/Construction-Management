import { useState } from 'react'
import { HardHat, ChevronRight } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { PROJECT_TYPES } from '../../data/templates'

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

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleCreate = () => {
    dispatch({ type: 'CREATE_PROJECT', payload: form })
  }

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

  if (step === 2) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <div className="bg-blue-600 text-white px-6 py-8">
          <p className="text-blue-200 text-sm mb-1">Étape 1 sur 3</p>
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-blue-600 text-white px-6 py-8">
        <p className="text-blue-200 text-sm mb-1">Étape 2 sur 3</p>
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

        <div className="bg-blue-50 rounded-2xl p-4 text-sm text-blue-700">
          <p className="font-semibold mb-1">✅ Planning automatique inclus</p>
          <p className="text-blue-600">Le planning sera généré avec toutes les phases et tâches dans le bon ordre selon votre type de projet.</p>
        </div>

        <button
          onClick={handleCreate}
          disabled={!form.name.trim()}
          className="w-full btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Créer mon projet →
        </button>
        <button
          onClick={() => setStep(2)}
          className="w-full text-gray-500 py-2 text-sm"
        >
          ← Retour
        </button>
      </div>
    </div>
  )
}
