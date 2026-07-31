import { useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Zap, Plus, Trash2, Maximize2, AlertTriangle, Info, X, CheckCircle2,
  Ruler, ShieldCheck, ArrowUpDown,
} from 'lucide-react'
import Header from '../layout/Header'
import PlanCanvas from '../plan/PlanCanvas'
import { useApp } from '../../contexts/AppContext'
import { computeSurfaces } from '../../lib/metre'
import {
  computeElectrical, ELECTRICAL_ITEMS, ITEM_BY_ID, suggestedItems,
  MOUNTING_HEIGHTS, CABLE_SECTIONS,
} from '../../lib/electrical'
import { pointInPolygon } from '../../lib/geometry'

export default function Electrical() {
  const navigate = useNavigate()
  const { activePlan, updatePlan } = useApp()
  const canvasRef = useRef(null)
  const plan = activePlan

  const [pendingType, setPendingType] = useState(null)
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState('conformite')

  const surfaces = useMemo(() => computeSurfaces(plan), [plan])
  const install = useMemo(() => computeElectrical(plan, surfaces), [plan, surfaces])

  if (!(plan.walls || []).length) {
    return (
      <div className="pb-24 min-h-screen bg-slate-50">
        <Header title="Électricité" back />
        <div className="p-6 text-center">
          <Zap size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium mb-1">Aucun plan dessiné</p>
          <p className="text-sm text-gray-400 mb-5 leading-relaxed">
            Le contrôle de conformité s'appuie sur le type et la surface de chaque pièce.
          </p>
          <button onClick={() => navigate('/plan')} className="btn-primary">Dessiner mon plan</button>
        </div>
      </div>
    )
  }

  const handleTap = (world) => {
    if (pendingType) {
      const room = surfaces.rooms.find(r => pointInPolygon(world, r.points))
      const existing = plan.electrical || []
      const next = pendingType === 'tableau'
        ? existing.filter(d => d.type !== 'tableau') // un seul tableau
        : existing
      updatePlan({
        electrical: [...next, {
          id: `el${Date.now().toString(36)}`,
          type: pendingType,
          point: { x: Math.round(world.x), y: Math.round(world.y) },
          roomId: room?.id || null,
        }],
      })
      setPendingType(null)
      return
    }
    const hit = (plan.electrical || []).find(d => Math.hypot(d.point.x - world.x, d.point.y - world.y) < 40)
    setSelected(hit || null)
  }

  const removeDevice = (id) => {
    updatePlan({ electrical: (plan.electrical || []).filter(d => d.id !== id) })
    setSelected(null)
  }

  const canvasItems = install.devices.map(d => ({
    id: d.id, point: d.point, icon: ITEM_BY_ID[d.type]?.icon || '•',
  }))

  const errors = install.warnings.filter(w => w.level === 'error')
  const cautions = install.warnings.filter(w => w.level === 'warning')
  const infos = install.warnings.filter(w => w.level === 'info')
  const compliantCount = install.compliance.filter(c => c.compliant).length

  return (
    <div className="pb-24 bg-slate-50 min-h-screen">
      <Header title="Électricité" back />

      <div className="relative bg-white border-b border-gray-100">
        <PlanCanvas
          ref={canvasRef}
          walls={plan.walls}
          rooms={surfaces.rooms}
          openings={plan.openings || []}
          electrical={canvasItems}
          routes={install.routes}
          showDimensions={false}
          onTap={handleTap}
          height={360}
        />
        <button
          onClick={() => canvasRef.current?.fit()}
          className="absolute top-2 right-2 w-9 h-9 bg-white/95 border border-gray-200 rounded-xl flex items-center justify-center shadow-sm"
          aria-label="Recadrer"
        >
          <Maximize2 size={16} className="text-gray-600" />
        </button>
      </div>

      <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100">
        <p className="text-xs text-amber-800 leading-relaxed">
          {pendingType
            ? `Touchez l'emplacement de ${ITEM_BY_ID[pendingType].label.toLowerCase()}.`
            : "Les traits pointillés sont les gaines, tracées uniquement à l'horizontale et à la verticale comme l'exige la norme."}
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* Ajouter */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Plus size={17} className="text-amber-500" />
              Poser un appareillage
            </h3>
            {pendingType && (
              <button onClick={() => setPendingType(null)} className="text-xs text-gray-500">Annuler</button>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {ELECTRICAL_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => setPendingType(item.id)}
                className={`p-2 rounded-2xl border-2 flex flex-col items-center gap-1 ${
                  pendingType === item.id ? 'border-amber-500 bg-amber-50' : 'border-gray-100'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="text-[9.5px] font-medium text-gray-700 text-center leading-tight">{item.label}</span>
              </button>
            ))}
          </div>
          {!install.panelPlaced && (
            <p className="text-[11px] text-amber-600 leading-relaxed">
              Commencez par poser le tableau électrique : c'est le point de départ de toutes les gaines.
            </p>
          )}
        </div>

        {/* Onglets */}
        <div className="flex gap-1">
          {[
            { id: 'conformite', label: 'Conformité' },
            { id: 'circuits', label: 'Circuits' },
            { id: 'quantites', label: 'Quantités' },
            { id: 'hauteurs', label: 'Hauteurs' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2 rounded-xl text-[11px] font-semibold ${
                tab === t.id ? 'bg-slate-800 text-white' : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'conformite' && (
          <div className="space-y-3">
            <div className={`rounded-2xl p-4 ${
              compliantCount === install.compliance.length && install.compliance.length > 0
                ? 'bg-green-600 text-white' : 'bg-white shadow-sm'
            }`}>
              <p className="font-bold text-lg">
                {compliantCount} / {install.compliance.length} pièces conformes
              </p>
              <p className={`text-sm mt-0.5 ${
                compliantCount === install.compliance.length && install.compliance.length > 0
                  ? 'text-green-100' : 'text-gray-500'
              }`}>
                {install.powered.length} appareillages posés · {install.circuits.length} circuits
              </p>
            </div>

            {install.compliance.map(item => (
              <div
                key={item.room.id}
                className={`rounded-2xl p-4 border ${
                  item.compliant ? 'bg-green-50 border-green-100' : 'bg-white border-gray-100 shadow-sm'
                }`}
              >
                <div className="flex items-start gap-2">
                  {item.compliant
                    ? <CheckCircle2 size={17} className="text-green-600 flex-shrink-0 mt-0.5" />
                    : <AlertTriangle size={17} className="text-amber-500 flex-shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900">
                      {item.room.typeInfo.icon} {item.room.name}
                      <span className="font-normal text-gray-500"> · {item.room.area.toFixed(1).replace('.', ',')} m²</span>
                    </p>
                    <div className="flex gap-3 mt-1.5 text-xs">
                      <Counter label="Prises" placed={item.placedSockets} required={item.need.sockets} />
                      <Counter label="Lumières" placed={item.placedLights} required={item.need.lights} />
                      {item.need.network > 0 && (
                        <Counter label="RJ45" placed={item.placedNetwork} required={item.need.network} />
                      )}
                    </div>
                    {item.issues.length > 0 && (
                      <p className="text-xs text-amber-700 mt-1.5">{item.issues.join(' · ')}</p>
                    )}
                    <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">{item.need.rule}</p>
                  </div>
                </div>
              </div>
            ))}

            {install.compliance.length === 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                <p className="text-xs text-amber-800 leading-relaxed">
                  Aucune pièce détectée. Fermez le contour de vos murs et typez vos pièces dans l'onglet
                  Plan pour que le contrôle de conformité fonctionne.
                </p>
              </div>
            )}
          </div>
        )}

        {tab === 'circuits' && (
          <div className="space-y-3">
            {install.circuits.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-6">
                Posez des prises et des points lumineux pour voir apparaître les circuits.
              </p>
            )}
            {install.circuits.map(circuit => {
              const route = install.routes.find(r => r.circuitId === circuit.id)
              return (
                <div key={circuit.id} className="card">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-9 rounded-full flex-shrink-0" style={{ background: route?.color || '#94A3B8' }} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900">{circuit.label}</p>
                      <p className="text-xs text-gray-500">
                        {circuit.devices.length} point{circuit.devices.length > 1 ? 's' : ''}
                        {circuit.section > 0 && ` · ${circuit.section.toString().replace('.', ',')} mm²`}
                        {route && ` · ${(route.length / 100).toFixed(1).replace('.', ',')} m de gaine`}
                      </p>
                    </div>
                    {circuit.breaker > 0 && (
                      <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full flex-shrink-0">
                        {circuit.breaker} A
                      </span>
                    )}
                  </div>
                </div>
              )
            })}

            {install.circuits.length > 0 && (
              <div className="card">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-2 text-sm">
                  <ShieldCheck size={16} className="text-blue-600" />
                  Protections différentielles
                </h3>
                {install.differentials.map(d => (
                  <div key={d.id} className="py-2 border-b border-gray-50 last:border-0">
                    <p className="text-sm font-medium text-gray-900">{d.label}</p>
                    <p className="text-[11px] text-gray-500 leading-relaxed mt-0.5">{d.note}</p>
                  </div>
                ))}
                {install.needsTypeA && (
                  <p className="text-[11px] text-blue-700 bg-blue-50 rounded-xl p-2.5 mt-2 leading-relaxed">
                    Votre installation comporte une plaque de cuisson ou un lave-linge : au moins un
                    interrupteur différentiel de type A est obligatoire pour ces circuits.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'quantites' && (
          <div className="card space-y-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Ruler size={17} className="text-amber-500" />
              Quantitatif
            </h3>
            <Row label="Gaine ICTA" value={`${install.totals.conduitLength.toFixed(1).replace('.', ',')} m`} strong />
            <Row label="Conducteurs (3 par circuit)" value={`${install.totals.cableLength.toFixed(0)} m`} />
            <Row label="Boîtes d'encastrement" value={install.totals.boxes} />
            <Row label="Disjoncteurs" value={install.totals.breakers} />
            <Row label="Interrupteurs différentiels" value={install.differentials.length} />

            {Object.keys(install.totals.bySection).length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Gaine par section de câble
                </p>
                {Object.entries(install.totals.bySection).map(([section, metres]) => (
                  <Row
                    key={section}
                    label={section === 'courant-faible' ? 'Courant faible' : `${section.replace('.', ',')} mm²`}
                    value={`${metres.toFixed(1).replace('.', ',')} m`}
                  />
                ))}
              </div>
            )}

            <p className="text-[11px] text-gray-500 leading-relaxed pt-2 border-t border-gray-100">
              Ajoutez 20 % de gaine pour les cintrages et les réserves au tableau. Les gaines de
              courant faible doivent rester séparées des courants forts sur tout leur parcours.
            </p>
          </div>
        )}

        {tab === 'hauteurs' && (
          <div className="card space-y-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <ArrowUpDown size={17} className="text-amber-500" />
              Hauteurs réglementaires
            </h3>
            {Object.entries(MOUNTING_HEIGHTS).map(([key, h]) => (
              <div key={key} className="py-2 border-b border-gray-50 last:border-0">
                <div className="flex justify-between items-baseline">
                  <p className="text-sm font-medium text-gray-900">{h.label}</p>
                  <p className="text-sm font-bold text-amber-600">
                    {h.min === h.max ? `${h.typical} cm` : `${h.typical} cm`}
                  </p>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed mt-0.5">{h.note}</p>
              </div>
            ))}

            <div className="pt-2 border-t border-gray-100">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Sections et calibres
              </p>
              {CABLE_SECTIONS.map(c => (
                <div key={c.section} className="flex items-baseline gap-2 py-1">
                  <span className="text-sm font-bold text-gray-900 w-14">{c.section.toString().replace('.', ',')} mm²</span>
                  <span className="text-xs font-semibold text-slate-600 w-12">{c.breaker} A</span>
                  <span className="text-[11px] text-gray-500 flex-1">{c.usage}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contrôles — les manques par pièce sont déjà détaillés dans l'onglet
            Conformité, on ne les répète que depuis les autres onglets. */}
        {(errors.length > 0 || (tab !== 'conformite' && cautions.length > 0)) && (
          <div className="space-y-2">
            {[...errors, ...(tab === 'conformite' ? [] : cautions)].map((w, i) => (
              <div
                key={i}
                className={`rounded-2xl p-4 flex gap-2 border ${
                  w.level === 'error' ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'
                }`}
              >
                <AlertTriangle size={16} className={`flex-shrink-0 mt-0.5 ${w.level === 'error' ? 'text-red-500' : 'text-amber-500'}`} />
                <p className={`text-xs leading-relaxed ${w.level === 'error' ? 'text-red-700' : 'text-amber-800'}`}>{w.text}</p>
              </div>
            ))}
          </div>
        )}

        {infos.map((w, i) => (
          <div key={i} className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-2">
            <Info size={15} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800 leading-relaxed">{w.text}</p>
          </div>
        ))}
      </div>

      {selected && (
        <DeviceSheet item={selected} onClose={() => setSelected(null)} onDelete={() => removeDevice(selected.id)} />
      )}
    </div>
  )
}

function Counter({ label, placed, required }) {
  const ok = placed >= required
  return (
    <span className={ok ? 'text-green-700' : 'text-amber-700'}>
      {label} <span className="font-bold">{placed}/{required}</span>
    </span>
  )
}

function DeviceSheet({ item, onClose, onDelete }) {
  const spec = ITEM_BY_ID[item.type]
  if (!spec) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-lg mx-auto bg-white rounded-t-3xl safe-bottom" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">{spec.icon} {spec.label}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X size={16} className="text-gray-500" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="bg-slate-50 rounded-xl p-3 space-y-1">
            <Row label="Hauteur de pose" value={`${spec.height} cm`} />
            {spec.section > 0 && <Row label="Section" value={`${spec.section.toString().replace('.', ',')} mm²`} />}
            {spec.breaker > 0 && <Row label="Protection" value={`${spec.breaker} A`} />}
            <Row label="Cheminement" value={spec.layer === 'plafond' ? 'Par le plafond' : 'Par le sol'} />
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">{spec.note}</p>
          <button
            onClick={onDelete}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 text-red-600 font-semibold"
          >
            <Trash2 size={16} />
            Retirer cet appareillage
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, strong }) {
  return (
    <div className="flex justify-between text-sm py-0.5">
      <span className="text-gray-500">{label}</span>
      <span className={strong ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'}>{value}</span>
    </div>
  )
}
