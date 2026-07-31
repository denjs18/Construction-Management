import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calculator, HardHat, Wrench, ChevronDown, ChevronRight, Info,
  TrendingDown, Clock, ArrowRightLeft, Pencil, RotateCcw,
} from 'lucide-react'
import Header from '../layout/Header'
import { useApp } from '../../contexts/AppContext'
import { computeEstimate, hoursToDays, STAGE_LABELS, isDiy } from '../../lib/metre'
import { PRICE_DISCLAIMER, formatEuro, formatEuroShort, PRICE_BY_ID } from '../../data/prices'
import { BUDGET_LOTS } from '../../data/templates'

const LOT_LABEL = Object.fromEntries(BUDGET_LOTS.map(l => [l.id, l.label]))
const LOT_COLOR = Object.fromEntries(BUDGET_LOTS.map(l => [l.id, l.color]))

const LEVELS = [
  { id: 'min', label: 'Économique', hint: 'Entrée de gamme, prix négociés' },
  { id: 'typ', label: 'Standard', hint: 'Le plus probable' },
  { id: 'max', label: 'Confortable', hint: 'Qualité supérieure, région chère' },
]

export default function Estimate() {
  const navigate = useNavigate()
  const { activeProject, activePlan, updatePlan, dispatch } = useApp()
  const [groupBy, setGroupBy] = useState('stage')
  const [openGroup, setOpenGroup] = useState(null)
  const [editing, setEditing] = useState(null)

  const plan = activePlan
  const estimate = useMemo(() => computeEstimate(plan), [plan])
  const hasPlan = (plan.walls || []).length > 0

  if (!hasPlan) {
    return (
      <div className="pb-24 min-h-screen bg-slate-50">
        <Header title="Chiffrage" back />
        <div className="p-6 text-center">
          <Calculator size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 mb-1 font-medium">Aucun plan dessiné</p>
          <p className="text-sm text-gray-400 mb-5 leading-relaxed">
            Le chiffrage se calcule automatiquement à partir des dimensions de votre plan.
          </p>
          <button onClick={() => navigate('/plan')} className="btn-primary">
            Dessiner mon plan
          </button>
        </div>
      </div>
    )
  }

  const groups = groupBy === 'stage' ? estimate.byStage : estimate.byLot
  const groupLabel = (key) => (groupBy === 'stage' ? STAGE_LABELS[key] || key : LOT_LABEL[key] || key)

  const toggleDiy = (itemId, value) => {
    updatePlan({ diy: { ...(plan.diy || {}), [itemId]: value } })
  }

  const setAllDiy = (value) => {
    updatePlan({ diyDefault: value, diy: {} })
  }

  const exportToBudget = () => {
    if (!activeProject) return
    for (const lot of estimate.byLot) {
      dispatch({
        type: 'UPDATE_BUDGET_LOT',
        payload: { projectId: activeProject.id, lotId: lot.key, field: 'allocated', value: Math.round(lot.total) },
      })
    }
    navigate('/budget')
  }

  return (
    <div className="pb-24 bg-slate-50 min-h-screen">
      <Header title="Chiffrage" back />

      {/* Total */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white px-4 py-5">
        <p className="text-blue-200 text-sm">Coût estimé du projet</p>
        <p className="text-4xl font-bold mt-1">{formatEuro(estimate.total)}</p>
        <p className="text-blue-200 text-sm mt-1">
          soit {formatEuro(estimate.pricePerM2)} / m² sur {estimate.surfaces.floorArea.toFixed(1).replace('.', ',')} m² habitables
        </p>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <div className="bg-white/10 rounded-2xl p-3">
            <div className="flex items-center gap-1.5 text-blue-200 text-xs mb-1">
              <HardHat size={13} /> Matériaux
            </div>
            <p className="font-bold text-lg">{formatEuroShort(estimate.totalMaterial)}</p>
          </div>
          <div className="bg-white/10 rounded-2xl p-3">
            <div className="flex items-center gap-1.5 text-blue-200 text-xs mb-1">
              <Wrench size={13} /> Main d'œuvre
            </div>
            <p className="font-bold text-lg">{formatEuroShort(estimate.totalLabor)}</p>
          </div>
        </div>
      </div>

      {/* Économie auto-construction */}
      {estimate.savings > 0 && (
        <div className="bg-green-600 text-white px-4 py-3.5">
          <div className="flex items-center gap-2">
            <TrendingDown size={20} className="flex-shrink-0" />
            <div className="flex-1">
              <p className="font-bold">
                {formatEuro(estimate.savings)} économisés en le faisant vous-même
              </p>
              <p className="text-green-100 text-xs mt-0.5">
                Tout confier à des entreprises coûterait {formatEuro(estimate.totalPro)}
              </p>
            </div>
          </div>
          {estimate.totalHours > 0 && (
            <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-white/20 text-sm">
              <Clock size={15} />
              <span>
                Environ <strong>{Math.round(estimate.totalHours)} heures</strong> de travail,
                soit {hoursToDays(estimate.totalHours)} journées de chantier à une personne
              </span>
            </div>
          )}
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* Qui fait quoi */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <ArrowRightLeft size={17} className="text-blue-600" />
            <h3 className="font-semibold text-gray-900">Qui réalise les travaux ?</h3>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setAllDiy(false)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 ${
                !plan.diyDefault ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-500'
              }`}
            >
              Des entreprises
            </button>
            <button
              onClick={() => setAllDiy(true)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 ${
                plan.diyDefault ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-100 text-gray-500'
              }`}
            >
              Moi-même
            </button>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            Ce réglage s'applique à tous les postes. Vous pouvez ensuite basculer chaque ligne
            individuellement en la dépliant ci-dessous. Les postes réglementés restent grisés :
            ils ne peuvent légalement pas être réalisés sans qualification.
          </p>
        </div>

        {/* Niveau de gamme */}
        <div className="card space-y-2">
          <h3 className="font-semibold text-gray-900 text-sm">Niveau de prix</h3>
          <div className="flex gap-2">
            {LEVELS.map(level => (
              <button
                key={level.id}
                onClick={() => updatePlan({ priceLevel: level.id })}
                className={`flex-1 py-2 px-1 rounded-xl border-2 ${
                  estimate.level === level.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100'
                }`}
              >
                <p className="text-xs font-semibold text-gray-900">{level.label}</p>
                <p className="text-[10px] text-gray-500 leading-tight mt-0.5">{level.hint}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Regroupement */}
        <div className="flex gap-2">
          {[
            { id: 'stage', label: 'Par étape du chantier' },
            { id: 'lot', label: 'Par corps de métier' },
          ].map(g => (
            <button
              key={g.id}
              onClick={() => { setGroupBy(g.id); setOpenGroup(null) }}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold ${
                groupBy === g.id ? 'bg-slate-800 text-white' : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* Détail */}
        <div className="space-y-2">
          {groups.map(group => {
            const open = openGroup === group.key
            const share = estimate.total > 0 ? (group.total / estimate.total) * 100 : 0
            return (
              <div key={group.key} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <button
                  onClick={() => setOpenGroup(open ? null : group.key)}
                  className="w-full flex items-center gap-3 p-4 text-left active:bg-gray-50"
                >
                  <div
                    className="w-1.5 h-10 rounded-full flex-shrink-0"
                    style={{ background: groupBy === 'lot' ? LOT_COLOR[group.key] || '#94A3B8' : '#3B82F6' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{groupLabel(group.key)}</p>
                    <p className="text-xs text-gray-500">
                      {group.lines.length} poste{group.lines.length > 1 ? 's' : ''} · {share.toFixed(0)} % du budget
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-gray-900">{formatEuroShort(group.total)}</p>
                    {group.hours > 0 && (
                      <p className="text-[11px] text-green-600">{Math.round(group.hours)} h de travail</p>
                    )}
                  </div>
                  {open ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                </button>

                {open && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {group.lines.map(line => (
                      <LineRow
                        key={line.itemId}
                        line={line}
                        editing={editing === line.itemId}
                        onToggleEdit={() => setEditing(editing === line.itemId ? null : line.itemId)}
                        onToggleDiy={() => toggleDiy(line.itemId, !line.diy)}
                        onPrice={(field, value) => updatePlan({
                          priceOverrides: {
                            ...(plan.priceOverrides || {}),
                            [line.itemId]: { ...(plan.priceOverrides?.[line.itemId] || {}), [field]: value },
                          },
                        })}
                        onResetPrice={() => {
                          const next = { ...(plan.priceOverrides || {}) }
                          delete next[line.itemId]
                          updatePlan({ priceOverrides: next })
                        }}
                        overridden={!!plan.priceOverrides?.[line.itemId]}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button onClick={exportToBudget} className="w-full btn-primary">
          Reporter dans le budget
        </button>

        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-2">
          <Info size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">{PRICE_DISCLAIMER}</p>
        </div>
      </div>
    </div>
  )
}

function LineRow({ line, editing, onToggleEdit, onToggleDiy, onPrice, onResetPrice, overridden }) {
  return (
    <div className="p-4 space-y-2">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 leading-snug">{line.label}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {line.qty.toLocaleString('fr-FR')} {line.unit} ×{' '}
            {(line.unitMaterial + (line.diy ? 0 : line.unitLabor)).toFixed(line.unit === 'forfait' ? 0 : 2).replace('.', ',')} €
          </p>
          {line.detail && <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{line.detail}</p>}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-semibold text-gray-900 text-sm">{formatEuroShort(line.total)}</p>
          {line.diy && line.hours > 0 && (
            <p className="text-[11px] text-green-600">{Math.round(line.hours)} h</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {line.canDiy ? (
          <button
            onClick={onToggleDiy}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
              line.diy ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {line.diy ? '✓ Je le fais' : 'Entreprise'}
          </button>
        ) : (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-50 text-red-600">
            Professionnel obligatoire
          </span>
        )}
        <button
          onClick={onToggleEdit}
          className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-600 flex items-center gap-1"
        >
          <Pencil size={10} />
          {overridden ? 'Prix modifié' : 'Ajuster le prix'}
        </button>
      </div>

      {editing && (
        <div className="bg-slate-50 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-gray-600">Fourniture €/{line.unit}</label>
              <input
                type="number"
                inputMode="decimal"
                value={line.unitMaterial}
                onChange={e => onPrice('material', parseFloat(e.target.value) || 0)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-2 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-600">Pose €/{line.unit}</label>
              <input
                type="number"
                inputMode="decimal"
                value={line.unitLabor}
                onChange={e => onPrice('labor', parseFloat(e.target.value) || 0)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-2 py-2 text-sm"
              />
            </div>
          </div>
          {overridden && (
            <button onClick={onResetPrice} className="text-[11px] text-gray-500 flex items-center gap-1">
              <RotateCcw size={10} /> Revenir au prix indicatif
            </button>
          )}
          {line.note && (
            <p className="text-[11px] text-gray-500 leading-relaxed pt-1 border-t border-gray-200">{line.note}</p>
          )}
        </div>
      )}
    </div>
  )
}
