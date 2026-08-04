import { useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Droplets, Plus, Trash2, Maximize2, AlertTriangle, Info, X,
  CircleDot, Ruler, ArrowRightCircle, Waves,
} from 'lucide-react'
import Header from '../layout/Header'
import PlanCanvas from '../plan/PlanCanvas'
import { useApp } from '../../contexts/AppContext'
import { computeSurfaces } from '../../lib/metre'
import {
  computePlumbing, EQUIPMENT_TYPES, EQUIPMENT_BY_ID, suggestedEquipment,
  DEFAULT_SLOPE, SLOPE_LIMITS, formatRun,
} from '../../lib/plumbing'
import { pointInPolygon } from '../../lib/geometry'

export default function Plumbing() {
  const navigate = useNavigate()
  const { activePlan, updatePlan } = useApp()
  const canvasRef = useRef(null)
  const plan = activePlan

  const [mode, setMode] = useState('view') // view | add | exit
  const [pendingType, setPendingType] = useState(null)
  const [selected, setSelected] = useState(null)
  const [activeHandleId, setActiveHandleId] = useState(null)

  const surfaces = useMemo(() => computeSurfaces(plan), [plan])
  const network = useMemo(() => computePlumbing(plan, surfaces), [plan, surfaces])

  const hasPlan = (plan.walls || []).length > 0

  if (!hasPlan) {
    return (
      <div className="pb-24 min-h-screen bg-slate-50">
        <Header title="Plomberie" back />
        <div className="p-6 text-center">
          <Droplets size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium mb-1">Aucun plan dessiné</p>
          <p className="text-sm text-gray-400 mb-5 leading-relaxed">
            Les réservations se calculent à partir de la position des appareils dans vos pièces.
          </p>
          <button onClick={() => navigate('/plan')} className="btn-primary">Dessiner mon plan</button>
        </div>
      </div>
    )
  }

  const handleTap = (world) => {
    if (mode === 'exit') {
      updatePlan({ plumbing: { ...(plan.plumbing || {}), exit: { x: Math.round(world.x), y: Math.round(world.y) } } })
      setMode('view')
      return
    }

    if (mode === 'add' && pendingType) {
      const room = surfaces.rooms.find(r => pointInPolygon(world, r.points))
      const item = {
        id: `eq${Date.now().toString(36)}`,
        type: pendingType,
        point: { x: Math.round(world.x), y: Math.round(world.y) },
        roomId: room?.id || null,
      }
      updatePlan({ equipment: [...(plan.equipment || []), item] })
      setMode('view')
      setPendingType(null)
      return
    }

    // sélection d'un appareil existant
    const hit = (plan.equipment || []).find(e => Math.hypot(e.point.x - world.x, e.point.y - world.y) < 45)
    setSelected(hit || null)
  }

  /* ------------------------------------ déplacement des appareils au doigt */

  const handles = useMemo(() => {
    if (mode !== 'view') return []
    const list = (plan.equipment || []).map(e => ({
      id: `eq:${e.id}`, kind: 'equipment', equipmentId: e.id, point: e.point,
    }))
    if (network.exit) {
      list.push({ id: 'exit', kind: 'exit', point: network.exit })
    }
    return list
  }, [plan.equipment, network.exit, mode])

  const pickHandle = (world, tolerance) => {
    if (mode !== 'view') return null
    let best = null
    for (const handle of handles) {
      const d = Math.hypot(handle.point.x - world.x, handle.point.y - world.y)
      if (d <= tolerance && (!best || d < best.d)) best = { d, handle }
    }
    return best?.handle || null
  }

  const applyDrag = (handle, world) => {
    const point = { x: Math.round(world.x / 5) * 5, y: Math.round(world.y / 5) * 5 }
    if (handle.kind === 'exit') {
      updatePlan({ plumbing: { ...(plan.plumbing || {}), exit: point } })
      return
    }
    updatePlan({
      equipment: (plan.equipment || []).map(e => (e.id === handle.equipmentId ? { ...e, point } : e)),
    })
  }

  const endDrag = (handle, world, moved) => {
    setActiveHandleId(null)
    if (moved || handle.kind === 'exit') return
    setSelected((plan.equipment || []).find(e => e.id === handle.equipmentId) || null)
  }

  const removeEquipment = (id) => {
    updatePlan({ equipment: (plan.equipment || []).filter(e => e.id !== id) })
    setSelected(null)
  }

  /** Oublie le placement manuel et laisse l'app repositionner la sortie */
  const resetExit = () => {
    const next = { ...(plan.plumbing || {}) }
    delete next.exit
    updatePlan({ plumbing: next })
  }

  const canvasEquipment = network.equipment.map(e => ({
    id: e.id, point: e.point, icon: e.spec.icon,
  }))

  const errors = network.warnings.filter(w => w.level === 'error')
  const cautions = network.warnings.filter(w => w.level === 'warning')
  const infos = network.warnings.filter(w => w.level === 'info')

  return (
    <div className="pb-24 bg-slate-50 min-h-screen">
      <Header title="Plomberie" back />

      <div className="relative bg-white border-b border-gray-100">
        <PlanCanvas
          ref={canvasRef}
          walls={plan.walls}
          rooms={surfaces.rooms}
          openings={plan.openings || []}
          equipment={canvasEquipment}
          routes={network.routes}
          reservations={network.reservations}
          showDimensions={false}
          handles={handles}
          activeHandleId={activeHandleId}
          onPickHandle={pickHandle}
          onDragStart={h => setActiveHandleId(h.id)}
          onDragMove={applyDrag}
          onDragEnd={endDrag}
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

      <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100">
        <p className="text-xs text-blue-800 leading-relaxed">
          {mode === 'add' && pendingType
            ? `Touchez l'endroit exact où poser ${EQUIPMENT_BY_ID[pendingType].label.toLowerCase()}.`
            : mode === 'exit'
              ? "Touchez le point où le collecteur sort du bâtiment vers l'égout ou la fosse."
              : "Faites glisser un appareil pour le déplacer : les réservations et les longueurs se recalculent en direct. Les cercles rouges sont les percements à prévoir dans la dalle."}
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* Ajouter un appareil */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Plus size={17} className="text-blue-600" />
              Ajouter un appareil
            </h3>
            {mode !== 'view' && (
              <button onClick={() => { setMode('view'); setPendingType(null) }} className="text-xs text-gray-500">
                Annuler
              </button>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2">
            {EQUIPMENT_TYPES.map(type => (
              <button
                key={type.id}
                onClick={() => { setPendingType(type.id); setMode('add') }}
                className={`p-2.5 rounded-2xl border-2 flex flex-col items-center gap-1 ${
                  pendingType === type.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100'
                }`}
              >
                <span className="text-xl">{type.icon}</span>
                <span className="text-[10px] font-medium text-gray-700 text-center leading-tight">{type.label}</span>
              </button>
            ))}
          </div>

          {surfaces.rooms.some(r => ['sdb', 'wc', 'cuisine', 'buanderie'].includes(r.type)) && (
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[11px] font-semibold text-gray-600 mb-1.5">Suggestions par pièce</p>
              <div className="space-y-1">
                {surfaces.rooms
                  .filter(r => suggestedEquipment(r.type).length > 0)
                  .map(room => (
                    <p key={room.id} className="text-[11px] text-gray-500">
                      <span className="font-medium text-gray-700">{room.name}</span> :{' '}
                      {suggestedEquipment(room.type).map(e => e.label).join(', ')}
                    </p>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Appareils placés */}
        {network.equipment.length > 0 && (
          <div className="card">
            <h3 className="font-semibold text-gray-900 text-sm mb-2">
              {network.equipment.length} appareil{network.equipment.length > 1 ? 's' : ''} placé{network.equipment.length > 1 ? 's' : ''}
            </h3>
            <div className="space-y-1">
              {network.equipment.map(item => {
                const room = surfaces.rooms.find(r => pointInPolygon(item.point, r.points))
                return (
                  <div key={item.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                    <span className="text-lg">{item.spec.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{item.spec.label}</p>
                      <p className="text-[11px] text-gray-500">
                        {room ? room.name : 'Hors pièce'} · évacuation Ø{item.spec.drain}
                      </p>
                    </div>
                    <button
                      onClick={() => removeEquipment(item.id)}
                      className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center"
                      aria-label="Supprimer"
                    >
                      <Trash2 size={14} className="text-red-500" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Réservations */}
        {network.reservations.length > 0 && (
          <div className="card">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-1">
              <CircleDot size={17} className="text-red-500" />
              Réservations dans la dalle
            </h3>
            <p className="text-xs text-gray-500 mb-3 leading-relaxed">
              Cotes prises depuis l'angle haut-gauche du bâtiment, mesurées sur l'axe des murs.
              Placez les fourreaux avant de couler : percer une dalle après coup coûte un carottage
              et fragilise le ferraillage.
            </p>
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-gray-500 border-b border-gray-100">
                    <th className="pb-2 font-semibold">Appareil</th>
                    <th className="pb-2 font-semibold text-right">X</th>
                    <th className="pb-2 font-semibold text-right">Y</th>
                    <th className="pb-2 font-semibold text-right">Tube</th>
                    <th className="pb-2 font-semibold text-right">Réserv.</th>
                  </tr>
                </thead>
                <tbody>
                  {network.reservations.map(res => (
                    <tr key={res.id} className={`border-b border-gray-50 last:border-0 ${res.isExit ? 'bg-amber-50' : ''}`}>
                      <td className="py-2">
                        <span className="mr-1">{res.icon}</span>
                        <span className="text-[13px] text-gray-800">{res.label}</span>
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-700">{(res.x / 100).toFixed(2).replace('.', ',')} m</td>
                      <td className="py-2 text-right tabular-nums text-gray-700">{(res.y / 100).toFixed(2).replace('.', ',')} m</td>
                      <td className="py-2 text-right tabular-nums text-gray-500">Ø{res.pipe}</td>
                      <td className="py-2 text-right tabular-nums font-semibold text-red-600">Ø{res.diameter}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* La sortie vers le réseau */}
        {network.equipment.length > 0 && (
          <div className="card space-y-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <ArrowRightCircle size={17} className="text-amber-600" />
              La sortie vers le réseau
            </h3>

            <p className="text-sm text-gray-600 leading-relaxed">
              C'est le point unique par lequel toutes les eaux usées quittent la maison pour
              rejoindre le tout-à-l'égout ou votre fosse. Tout le réseau descend vers elle :
              c'est le point le plus bas de l'installation.
            </p>
            <p className="text-xs text-gray-500 leading-relaxed">
              Elle ne peut pas être supprimée — un réseau d'évacuation doit forcément sortir
              quelque part — mais vous la déplacez librement en la faisant glisser sur le plan.
              Posez-la sur le mur par lequel votre branchement arrive réellement : c'est elle
              qui fixe la longueur du collecteur, donc sa profondeur.
            </p>

            <div className="bg-amber-50 rounded-xl p-3 space-y-1">
              <Row
                label="Position"
                value={`X ${((network.exit.x - network.origin.x) / 100).toFixed(2).replace('.', ',')} m · Y ${((network.exit.y - network.origin.y) / 100).toFixed(2).replace('.', ',')} m`}
              />
              <Row label="Traversée de fondation" value={`Ø${network.reservations.find(r => r.isExit)?.diameter || 150} mm`} />
              <Row label="Profondeur au passage" value={`${Math.round(network.depthAtExit)} cm sous le sol fini`} />
              <Row
                label="Placement"
                value={network.exit?.auto ? 'Automatique' : 'Choisi par vous'}
              />
            </div>

            {network.exit?.auto && (
              <p className="text-[11px] text-amber-700 bg-amber-50 rounded-xl p-2.5 leading-relaxed">
                Pour l'instant elle est posée automatiquement au plus court depuis vos appareils.
                Placez-la vous-même dès que vous savez de quel côté arrive votre branchement.
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setMode('exit')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold ${
                  mode === 'exit' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                <ArrowRightCircle size={16} />
                {mode === 'exit' ? 'Touchez le plan…' : 'Placer sur le plan'}
              </button>
              {!network.exit?.auto && (
                <button
                  onClick={resetExit}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600"
                >
                  Auto
                </button>
              )}
            </div>
          </div>
        )}

        {/* Pente et profondeur */}
        <div className="card space-y-3">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Waves size={17} className="text-blue-600" />
            Pente et profondeur
          </h3>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Pente des évacuations
            </label>
            <div className="flex gap-2">
              {[1, 1.5, 2, 2.5, 3].map(value => (
                <button
                  key={value}
                  onClick={() => updatePlan({ plumbing: { ...(plan.plumbing || {}), slope: value } })}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 ${
                    network.slope === value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-500'
                  }`}
                >
                  {value.toString().replace('.', ',')}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{SLOPE_LIMITS.note}</p>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
            <Row label="Profondeur à la sortie" value={`${Math.round(network.depthAtExit)} cm sous le sol fini`} strong />
            <Row label="Longueur totale d'évacuation" value={`${network.totals.drainTotal.toFixed(1).replace('.', ',')} m`} />
            <Row label="Raccords et coudes estimés" value={network.totals.fittings} />
          </div>

        </div>

        {/* Quantitatif */}
        {network.totals.drainTotal > 0 && (
          <div className="card space-y-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Ruler size={17} className="text-blue-600" />
              Quantitatif
            </h3>
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Évacuation PVC</p>
              {Object.entries(network.totals.drainByDiameter)
                .sort((a, b) => Number(b[0]) - Number(a[0]))
                .map(([diameter, metres]) => (
                  <Row key={diameter} label={`Tube Ø${diameter}`} value={`${metres.toFixed(1).replace('.', ',')} m`} />
                ))}
            </div>
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Alimentation PER ou multicouche
              </p>
              {Object.entries(network.totals.supplyByDiameter)
                .sort((a, b) => Number(b[0]) - Number(a[0]))
                .map(([diameter, metres]) => (
                  <Row key={diameter} label={`Tube Ø${diameter}`} value={`${metres.toFixed(1).replace('.', ',')} m`} />
                ))}
              <Row label="Points d'eau" value={network.totals.waterPoints} />
            </div>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Prévoyez 15 % de longueur supplémentaire pour les chutes, les remontées dans les
              cloisons et les inévitables reprises.
            </p>
          </div>
        )}

        {/* Contrôles */}
        {(errors.length > 0 || cautions.length > 0) && (
          <div className="space-y-2">
            {[...errors, ...cautions].map((w, i) => (
              <div
                key={i}
                className={`rounded-2xl p-4 flex gap-2 border ${
                  w.level === 'error' ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'
                }`}
              >
                <AlertTriangle
                  size={16}
                  className={`flex-shrink-0 mt-0.5 ${w.level === 'error' ? 'text-red-500' : 'text-amber-500'}`}
                />
                <p className={`text-xs leading-relaxed ${w.level === 'error' ? 'text-red-700' : 'text-amber-800'}`}>
                  {w.text}
                </p>
              </div>
            ))}
          </div>
        )}

        {infos.length > 0 && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-2">
            {infos.map((w, i) => (
              <div key={i} className="flex gap-2">
                <Info size={15} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-800 leading-relaxed">{w.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <EquipmentSheet
          item={selected}
          onClose={() => setSelected(null)}
          onDelete={() => removeEquipment(selected.id)}
        />
      )}
    </div>
  )
}

function EquipmentSheet({ item, onClose, onDelete }) {
  const spec = EQUIPMENT_BY_ID[item.type]
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
            <Row label="Évacuation" value={`Ø${spec.drain} mm`} />
            <Row label="Eau froide" value={spec.supplyCold ? `Ø${spec.supplyCold} mm` : '—'} />
            <Row label="Eau chaude" value={spec.supplyHot ? `Ø${spec.supplyHot} mm` : '—'} />
            <Row label="Distance max au collecteur" value={formatRun(spec.maxToStack)} />
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">{spec.note}</p>
          <button
            onClick={onDelete}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 text-red-600 font-semibold"
          >
            <Trash2 size={16} />
            Retirer cet appareil
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
