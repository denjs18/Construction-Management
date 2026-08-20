import { useMemo } from 'react'
import { useApp } from '../../contexts/AppContext'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, Circle, Clock, TrendingUp, ChevronRight, Plus, AlertCircle, Ruler, Box, Calculator } from 'lucide-react'
import { BUDGET_LOTS } from '../../data/templates'
import { computeBuildingSurfaces, computeEstimate } from '../../lib/metre'
import { formatEuroShort } from '../../data/prices'

/**
 * Raccourci vers le plan. Tant que rien n'est dessiné, la carte invite à
 * commencer ; ensuite elle affiche les chiffres clés du projet.
 */
function PlanCard() {
  const { activePlan } = useApp()
  const navigate = useNavigate()
  const hasPlan = (activePlan?.levels || []).some(l => (l.walls || []).length > 0)

  const summary = useMemo(() => {
    if (!hasPlan) return null
    const surfaces = computeBuildingSurfaces(activePlan)
    const estimate = computeEstimate(activePlan)
    return { surfaces, estimate }
  }, [activePlan, hasPlan])

  if (!hasPlan) {
    return (
      <button
        onClick={() => navigate('/plan')}
        className="w-full card flex items-center gap-3 text-left active:bg-gray-50"
      >
        <div className="w-11 h-11 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0">
          <Ruler size={20} className="text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900">Dessiner le plan</p>
          <p className="text-xs text-gray-500 leading-relaxed">
            Obtenez la maquette 3D, le chiffrage détaillé et les plans de réseaux
          </p>
        </div>
        <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
      </button>
    )
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Ruler size={18} className="text-blue-600" />
          Mon plan
        </h2>
        <Link to="/plan" className="text-blue-600 text-sm font-medium">Modifier →</Link>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MiniStat value={`${summary.surfaces.floorArea.toFixed(0)} m²`} label="Habitable" />
        <MiniStat
          value={summary.surfaces.levelCount > 1
            ? `${summary.surfaces.levelCount} niv.`
            : summary.surfaces.rooms.length}
          label={summary.surfaces.levelCount > 1 ? 'Niveaux' : 'Pièces'}
        />
        <MiniStat value={formatEuroShort(summary.estimate.total)} label="Estimé" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => navigate('/plan/3d')}
          className="flex items-center justify-center gap-1.5 bg-slate-800 text-white text-sm font-semibold py-2.5 rounded-xl active:bg-slate-900"
        >
          <Box size={15} />
          Vue 3D
        </button>
        <button
          onClick={() => navigate('/chiffrage')}
          className="flex items-center justify-center gap-1.5 bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl active:bg-blue-700"
        >
          <Calculator size={15} />
          Chiffrage
        </button>
      </div>
    </div>
  )
}

function MiniStat({ value, label }) {
  return (
    <div className="bg-slate-50 rounded-xl py-2 text-center">
      <p className="text-sm font-bold text-gray-900 leading-tight">{value}</p>
      <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

function ProgressRing({ value, size = 80 }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (value / 100) * circ
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8F0" strokeWidth={6} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2563EB" strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <text x={size / 2} y={size / 2} textAnchor="middle" dy="0.35em"
        className="fill-gray-900 font-bold" fontSize={size * 0.22} transform={`rotate(90 ${size / 2} ${size / 2})`}>
        {value}%
      </text>
    </svg>
  )
}

function StatusBadge({ status }) {
  if (status === 'done') return <CheckCircle2 size={20} className="text-green-500 flex-shrink-0" />
  if (status === 'inprogress') return <Clock size={20} className="text-blue-500 flex-shrink-0" />
  return <Circle size={20} className="text-gray-300 flex-shrink-0" />
}

export default function Dashboard() {
  const { state, dispatch, activeProject, getProjectProgress, getTotalSpent, getNextTasks } = useApp()
  const navigate = useNavigate()

  if (!activeProject) return null

  const progress = getProjectProgress(activeProject)
  const totalSpent = getTotalSpent(activeProject)
  const budget = activeProject.budget.total
  const budgetPct = budget > 0 ? Math.round((totalSpent / budget) * 100) : 0
  const nextTasks = getNextTasks(activeProject, 4)

  const doneTasks = activeProject.phases.reduce((sum, ph) =>
    sum + ph.tasks.filter(t => t.status === 'done').length, 0)
  const totalTasks = activeProject.phases.reduce((sum, ph) => sum + ph.tasks.length, 0)

  const phaseProgress = activeProject.phases.map(phase => {
    const done = phase.tasks.filter(t => t.status === 'done').length
    return { ...phase, done, total: phase.tasks.length }
  })
  const currentPhase = phaseProgress.find(p => p.done < p.total)

  return (
    <div className="pb-24">
      {/* Header hero */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white px-5 pt-6 pb-8">
        {/* Project selector */}
        {state.projects.length > 1 && (
          <select
            value={activeProject.id}
            onChange={e => dispatch({ type: 'SET_ACTIVE_PROJECT', payload: e.target.value })}
            className="w-full bg-white/20 text-white rounded-xl px-3 py-2 text-sm mb-4 border border-white/30 focus:outline-none"
          >
            {state.projects.map(p => (
              <option key={p.id} value={p.id} className="text-gray-900">{p.name}</option>
            ))}
          </select>
        )}

        <div className="flex items-center gap-4">
          <ProgressRing value={progress} size={88} />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate">{activeProject.name}</h1>
            {activeProject.address && (
              <p className="text-blue-200 text-sm truncate">{activeProject.address}</p>
            )}
            <p className="text-blue-100 text-sm mt-2">
              {doneTasks} / {totalTasks} tâches terminées
            </p>
            {currentPhase && (
              <p className="text-blue-200 text-xs mt-1">
                Phase en cours : {currentPhase.name}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 -mt-4 space-y-4">
        {/* Plan et maquette */}
        <PlanCard />

        {/* Budget card */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp size={18} className="text-blue-600" />
              Budget
            </h2>
            <Link to="/budget" className="text-blue-600 text-sm font-medium">Détails →</Link>
          </div>
          {budget > 0 ? (
            <>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-500">Dépensé</span>
                <span className={`font-semibold ${budgetPct > 90 ? 'text-red-600' : 'text-gray-900'}`}>
                  {totalSpent.toLocaleString('fr-FR')} € / {budget.toLocaleString('fr-FR')} €
                </span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${budgetPct > 90 ? 'bg-red-500' : budgetPct > 70 ? 'bg-amber-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(budgetPct, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                {(budget - totalSpent).toLocaleString('fr-FR')} € restants ({100 - budgetPct}%)
              </p>
              {budgetPct > 85 && (
                <div className="mt-2 flex items-center gap-1.5 text-amber-600 text-xs">
                  <AlertCircle size={14} />
                  <span>Attention : budget presque atteint</span>
                </div>
              )}
            </>
          ) : (
            <Link to="/budget" className="text-sm text-blue-600">
              Définir les budgets par lot →
            </Link>
          )}
        </div>

        {/* Next tasks */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Prochaines tâches</h2>
            <Link to="/planning" className="text-blue-600 text-sm font-medium">Tout voir →</Link>
          </div>
          {nextTasks.length === 0 ? (
            <div className="text-center py-6">
              <CheckCircle2 size={40} className="text-green-400 mx-auto mb-2" />
              <p className="text-gray-600 font-semibold">Projet terminé !</p>
              <p className="text-gray-400 text-sm">Toutes les tâches sont complétées.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {nextTasks.map(task => (
                <button
                  key={task.id}
                  onClick={() => navigate('/planning')}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-50 active:bg-gray-100 text-left transition-colors"
                >
                  <StatusBadge status={task.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                    <p className="text-xs text-gray-400 truncate">{task.phaseName}</p>
                  </div>
                  {task.guideId && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex-shrink-0">
                      Guide
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Phases overview */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-3">Avancement par phase</h2>
          <div className="space-y-3">
            {phaseProgress.map(phase => (
              <div key={phase.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700 truncate flex-1 mr-2">
                    {phase.icon} {phase.name}
                  </span>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {phase.done}/{phase.total}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: phase.total > 0 ? `${(phase.done / phase.total) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Journal preview */}
        {activeProject.journal.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">Dernière note de chantier</h2>
              <Link to="/journal" className="text-blue-600 text-sm font-medium">Voir tout →</Link>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">
                {new Date(activeProject.journal[0].createdAt).toLocaleDateString('fr-FR', {
                  day: 'numeric', month: 'long', year: 'numeric'
                })}
              </p>
              <p className="text-sm text-gray-700 line-clamp-3">{activeProject.journal[0].note}</p>
            </div>
          </div>
        )}

        {/* New project button */}
        <button
          onClick={() => {
            const name = prompt('Nom du nouveau projet ?')
            if (name) navigate('/nouveau-projet')
          }}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 text-sm active:border-blue-300 active:text-blue-500 transition-colors"
        >
          <Plus size={18} />
          Nouveau projet
        </button>
      </div>
    </div>
  )
}
