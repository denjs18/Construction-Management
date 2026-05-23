import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Clock, AlertTriangle, Lightbulb, CheckCircle2, Circle, ShieldAlert, ShieldCheck, Wrench, Package, HardHat, Scale } from 'lucide-react'
import Header from '../layout/Header'
import { GUIDES, DIFFICULTY_CONFIG } from '../../data/guides'

function StepCard({ step, index, total, completed, onToggle }) {
  const [open, setOpen] = useState(false)

  return (
    <div className={`rounded-2xl border-2 overflow-hidden transition-colors ${completed ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-white'}`}>
      <button
        className="w-full flex items-start gap-3 p-4 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${completed ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
          {completed ? <CheckCircle2 size={18} /> : step.id}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-sm leading-snug ${completed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
            {step.title}
          </p>
          {!open && !completed && (
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{step.description}</p>
          )}
        </div>
        <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">{index}/{total}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="space-y-2">
            {step.description.split('\n\n').map((para, i) => (
              <p key={i} className="text-sm text-gray-700 leading-relaxed">{para}</p>
            ))}
          </div>

          {step.warning && (
            <div className="flex gap-2 bg-red-50 border border-red-100 rounded-xl p-3">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 leading-relaxed">{step.warning}</p>
            </div>
          )}

          {step.tip && (
            <div className="flex gap-2 bg-amber-50 border border-amber-100 rounded-xl p-3">
              <Lightbulb size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 leading-relaxed">{step.tip}</p>
            </div>
          )}

          <button
            onClick={onToggle}
            className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              completed
                ? 'bg-gray-100 text-gray-500 active:bg-gray-200'
                : 'bg-green-600 text-white active:bg-green-700'
            }`}
          >
            {completed ? '↩ Marquer à faire' : '✓ Étape terminée'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function GuideDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const guide = GUIDES.find(g => g.id === id)
  const [completedSteps, setCompletedSteps] = useState(new Set())
  const [activeTab, setActiveTab] = useState('steps')

  if (!guide) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">Guide introuvable</p>
          <button onClick={() => navigate('/guides')} className="mt-4 text-blue-600">← Retour aux guides</button>
        </div>
      </div>
    )
  }

  const diff = DIFFICULTY_CONFIG[guide.difficulty] || DIFFICULTY_CONFIG.intermediaire

  const toggleStep = (stepId) => {
    setCompletedSteps(prev => {
      const next = new Set(prev)
      if (next.has(stepId)) next.delete(stepId)
      else next.add(stepId)
      return next
    })
  }

  const progressPct = Math.round((completedSteps.size / guide.steps.length) * 100)

  return (
    <div className="pb-24 bg-slate-50">
      <Header title={guide.title} back />

      {/* Hero */}
      <div className="bg-white px-4 py-4 border-b border-gray-100">
        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${diff.color}`}>{diff.label}</span>
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Clock size={12} />
            {guide.duration} {guide.surface && <span className="text-gray-400">{guide.surface}</span>}
          </span>
          {guide.canDIY ? (
            <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full flex items-center gap-1">
              <ShieldCheck size={12} />
              Faisable soi-même
            </span>
          ) : (
            <span className="text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded-full flex items-center gap-1">
              <ShieldAlert size={12} />
              Pro recommandé
            </span>
          )}
        </div>

        <p className="text-sm text-gray-600 leading-relaxed">{guide.description}</p>

        {/* Progress */}
        {completedSteps.size > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Progression</span>
              <span>{completedSteps.size}/{guide.steps.length} étapes</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Norm */}
        {guide.norm && (
          <div className="mt-3 flex items-start gap-2 bg-blue-50 rounded-xl p-3">
            <Scale size={14} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700"><span className="font-semibold">Norme : </span>{guide.norm}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 px-4 py-2">
        <div className="flex gap-1">
          {[
            { id: 'steps', label: `Étapes (${guide.steps.length})` },
            { id: 'materials', label: 'Matériaux' },
            { id: 'tools', label: 'Outils' },
            { id: 'safety', label: 'Sécurité' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors flex-shrink-0 ${
                activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {activeTab === 'steps' && (
          <>
            {guide.steps.map((step, i) => (
              <StepCard
                key={step.id}
                step={step}
                index={i + 1}
                total={guide.steps.length}
                completed={completedSteps.has(step.id)}
                onToggle={() => toggleStep(step.id)}
              />
            ))}
            {progressPct === 100 && (
              <div className="bg-green-600 text-white rounded-2xl p-4 text-center">
                <CheckCircle2 size={32} className="mx-auto mb-2" />
                <p className="font-bold text-lg">Toutes les étapes sont faites !</p>
                <p className="text-green-100 text-sm mt-1">Félicitations pour ce travail !</p>
              </div>
            )}
          </>
        )}

        {activeTab === 'materials' && (
          <div className="card space-y-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Package size={18} className="text-blue-600" />
              Liste des matériaux
            </h3>
            <div className="space-y-2">
              {guide.materials.map((m, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <Circle size={8} className="text-blue-500 flex-shrink-0 mt-1.5 fill-current" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{m.name}</p>
                    {m.note && <p className="text-xs text-gray-500 mt-0.5">{m.note}</p>}
                  </div>
                  {m.unit && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{m.unit}</span>}
                </div>
              ))}
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">
              💡 Prévoir toujours 10% de matériaux supplémentaires pour les pertes et les imprévus.
            </div>
          </div>
        )}

        {activeTab === 'tools' && (
          <div className="card space-y-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Wrench size={18} className="text-blue-600" />
              Outils nécessaires
            </h3>
            <div className="space-y-2">
              {guide.tools.map((tool, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <Wrench size={14} className="text-gray-400 flex-shrink-0" />
                  <p className="text-sm text-gray-700">{tool}</p>
                </div>
              ))}
            </div>
            {guide.ppe && guide.ppe.length > 0 && (
              <>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2 pt-2 border-t border-gray-100">
                  <HardHat size={18} className="text-orange-500" />
                  Équipements de protection
                </h3>
                <div className="space-y-2">
                  {guide.ppe.map((item, i) => (
                    <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                      <HardHat size={14} className="text-orange-400 flex-shrink-0" />
                      <p className="text-sm text-gray-700">{item}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'safety' && (
          <div className="space-y-3">
            {guide.whenToPro && (
              <div className="bg-red-50 border-2 border-red-100 rounded-2xl p-4">
                <h3 className="font-semibold text-red-800 flex items-center gap-2 mb-2">
                  <ShieldAlert size={18} />
                  Quand appeler un professionnel
                </h3>
                <p className="text-sm text-red-700 leading-relaxed">{guide.whenToPro}</p>
              </div>
            )}

            {guide.norm && (
              <div className="bg-blue-50 border-2 border-blue-100 rounded-2xl p-4">
                <h3 className="font-semibold text-blue-800 flex items-center gap-2 mb-2">
                  <Scale size={18} />
                  Norme applicable
                </h3>
                <p className="text-sm text-blue-700">{guide.norm}</p>
              </div>
            )}

            {/* Warnings from steps */}
            {guide.steps.filter(s => s.warning).length > 0 && (
              <div className="card">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
                  <AlertTriangle size={18} className="text-amber-500" />
                  Points de vigilance
                </h3>
                <div className="space-y-3">
                  {guide.steps.filter(s => s.warning).map((step, i) => (
                    <div key={i} className="bg-amber-50 rounded-xl p-3">
                      <p className="text-xs font-semibold text-amber-800 mb-1">Étape {step.id} — {step.title}</p>
                      <p className="text-xs text-amber-700 leading-relaxed">{step.warning}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {guide.canDIY && (
              <div className="bg-green-50 border-2 border-green-100 rounded-2xl p-4">
                <h3 className="font-semibold text-green-800 flex items-center gap-2 mb-2">
                  <ShieldCheck size={18} />
                  Légalité pour les particuliers
                </h3>
                <p className="text-sm text-green-700">
                  Ce travail est légalement réalisable par un particulier en France pour son usage propre, sans obligation de faire appel à un professionnel.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
