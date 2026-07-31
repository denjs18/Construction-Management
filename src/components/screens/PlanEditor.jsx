import { useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MousePointer2, PenLine, DoorOpen, Home, Undo2, Trash2, Maximize2,
  Check, X, Calculator, Settings2, Box, Droplets, Zap,
} from 'lucide-react'
import Header from '../layout/Header'
import PlanCanvas from '../plan/PlanCanvas'
import { useApp } from '../../contexts/AppContext'
import {
  makeWall, smartSnap, orthoConstrain, dist,
  rectanglePlan, setWallLength, projectOnSegment, healDanglingEnds,
} from '../../lib/geometry'
import { computeSurfaces } from '../../lib/metre'
import { STRUCTURE_TYPES, STRUCTURE_BY_ID, ROOM_TYPES, ROOF_TYPES } from '../../data/prices'

const OPENING_KINDS = [
  { id: 'fenetre', label: 'Fenêtre', icon: '🪟', width: 120, height: 115, sill: 95 },
  { id: 'baie', label: 'Baie vitrée', icon: '🚪', width: 240, height: 215, sill: 0 },
  { id: 'porte', label: 'Porte intérieure', icon: '🚪', width: 83, height: 204, sill: 0 },
  { id: 'porte-entree', label: "Porte d'entrée", icon: '🏠', width: 93, height: 215, sill: 0 },
  { id: 'porte-garage', label: 'Porte de garage', icon: '🚗', width: 240, height: 200, sill: 0 },
]

const MODES = [
  { id: 'view', label: 'Voir', icon: MousePointer2 },
  { id: 'draw', label: 'Murs', icon: PenLine },
  { id: 'opening', label: 'Ouvertures', icon: DoorOpen },
  { id: 'room', label: 'Pièces', icon: Home },
]

export default function PlanEditor() {
  const navigate = useNavigate()
  const { activePlan, updatePlan } = useApp()
  const canvasRef = useRef(null)

  const [mode, setMode] = useState('view')
  const [ortho, setOrtho] = useState(true)
  const [wallKind, setWallKind] = useState('porteur')
  const [draft, setDraft] = useState(null)
  const [selectedWallId, setSelectedWallId] = useState(null)
  const [selectedRoomId, setSelectedRoomId] = useState(null)
  const [selectedOpeningId, setSelectedOpeningId] = useState(null)
  const [sheet, setSheet] = useState(null) // 'rect' | 'settings' | null

  const plan = activePlan
  const surfaces = useMemo(() => computeSurfaces(plan), [plan])
  const rooms = surfaces.rooms
  const walls = plan.walls || []

  const structure = STRUCTURE_BY_ID[plan.structure] || STRUCTURE_TYPES[0]
  const defaultThickness = wallKind === 'porteur' ? structure.thickness : 7

  const selectedWall = walls.find(w => w.id === selectedWallId) || null
  const selectedRoom = rooms.find(r => r.id === selectedRoomId) || null
  const selectedOpening = (plan.openings || []).find(o => o.id === selectedOpeningId) || null

  /* ------------------------------------------------------------ actions */

  const setWalls = (next) => updatePlan({ walls: next })

  /** Fin d'un tracé : on raccroche les extrémités restées en l'air */
  const finishDrawing = (currentWalls = walls) => {
    setWalls(healDanglingEnds(currentWalls))
    setDraft(null)
    setMode('view')
  }

  const handleTap = (world, pick) => {
    if (mode === 'draw') {
      // L'accroche sur un mur existant l'emporte sur la contrainte d'angle
      // droit : mieux vaut un raccord franc qu'un angle parfait mais ouvert.
      // Le rayon suit le zoom pour rester à portée de doigt constante.
      const radius = pick?.scale ? Math.max(25, 26 / pick.scale) : 25
      const snapped = smartSnap(world, walls, { radius })
      const anchored = snapped.snapped === 'node' || snapped.snapped === 'wall'
      let point = snapped
      if (!anchored && ortho && draft?.points?.length) {
        const last = draft.points[draft.points.length - 1]
        point = { ...orthoConstrain(last, snapped), snapped: snapped.snapped }
      }

      if (!draft || draft.points.length === 0) {
        setDraft({ points: [{ x: point.x, y: point.y }] })
        return
      }

      const last = draft.points[draft.points.length - 1]
      if (dist(last, point) < 15) return // double tap au même endroit

      const wall = makeWall(last, point, { thickness: defaultThickness, kind: wallKind })
      setWalls([...walls, wall])

      // Fermeture automatique du contour
      const first = draft.points[0]
      if (draft.points.length >= 2 && dist(point, first) < 20) {
        finishDrawing([...walls, wall])
        return
      }
      setDraft({ points: [...draft.points, { x: point.x, y: point.y }] })
      return
    }

    if (mode === 'opening') {
      if (!pick.wall) return
      const wall = pick.wall.wall
      const len = dist(wall.a, wall.b)
      const kind = OPENING_KINDS[0]
      const offset = Math.min(Math.max(pick.wall.t * len, kind.width / 2), len - kind.width / 2)
      if (len < kind.width + 10) return
      const opening = {
        id: `o${Date.now().toString(36)}`,
        wallId: wall.id,
        offset: Math.round(offset),
        width: kind.width,
        height: kind.height,
        sill: kind.sill,
        kind: kind.id,
      }
      updatePlan({ openings: [...(plan.openings || []), opening] })
      setSelectedOpeningId(opening.id)
      setSelectedWallId(null)
      setSelectedRoomId(null)
      return
    }

    if (mode === 'room') {
      setSelectedRoomId(pick.room ? pick.room.id : null)
      setSelectedWallId(null)
      setSelectedOpeningId(null)
      return
    }

    // mode view
    const openingHit = findOpeningAt(plan, walls, world)
    if (openingHit) {
      setSelectedOpeningId(openingHit.id)
      setSelectedWallId(null)
      setSelectedRoomId(null)
      return
    }
    setSelectedOpeningId(null)
    if (pick.wall) {
      setSelectedWallId(pick.wall.wall.id)
      setSelectedRoomId(null)
    } else {
      setSelectedWallId(null)
      setSelectedRoomId(pick.room ? pick.room.id : null)
    }
  }

  const undoLastWall = () => {
    if (!walls.length) return
    const next = walls.slice(0, -1)
    setWalls(next)
    if (draft && draft.points.length > 1) {
      setDraft({ points: draft.points.slice(0, -1) })
    } else {
      setDraft(null)
    }
  }

  const deleteWall = (id) => {
    setWalls(walls.filter(w => w.id !== id))
    updatePlan({
      walls: walls.filter(w => w.id !== id),
      openings: (plan.openings || []).filter(o => o.wallId !== id),
    })
    setSelectedWallId(null)
  }

  const createRectangle = (widthM, depthM) => {
    const w = Math.round(widthM * 100)
    const d = Math.round(depthM * 100)
    if (w < 200 || d < 200) return
    updatePlan({ walls: [...walls, ...rectanglePlan(w, d, structure.thickness)] })
    setSheet(null)
    setMode('view')
    setTimeout(() => canvasRef.current?.fit(), 60)
  }

  const setRoomMeta = (room, patch) => {
    const metas = plan.roomMeta || []
    const existing = metas.find(m => m.id === room.metaId)
    let next
    if (existing) {
      next = metas.map(m => (m.id === existing.id ? { ...m, ...patch } : m))
    } else {
      next = [...metas, {
        id: `rm${Date.now().toString(36)}`,
        point: { x: Math.round(room.centroid.x), y: Math.round(room.centroid.y) },
        type: room.type,
        name: room.name,
        ...patch,
      }]
    }
    updatePlan({ roomMeta: next })
  }

  const isEmpty = walls.length === 0

  /* ------------------------------------------------------------- rendu */

  return (
    <div className="pb-24 bg-slate-50 min-h-screen">
      <Header title="Plan de la maison" back />

      {/* Barre de modes */}
      <div className="bg-white border-b border-gray-100 px-3 py-2 sticky top-0 z-20">
        <div className="flex gap-1">
          {MODES.map(m => {
            const Icon = m.icon
            const active = mode === m.id
            return (
              <button
                key={m.id}
                onClick={() => { setMode(m.id); setDraft(null) }}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl text-[11px] font-medium transition-colors ${
                  active ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600'
                }`}
              >
                <Icon size={17} />
                {m.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Canvas */}
      <div className="relative bg-white border-b border-gray-100">
        <PlanCanvas
          ref={canvasRef}
          walls={walls}
          rooms={rooms}
          openings={plan.openings || []}
          draft={draft}
          selectedWallId={selectedWallId}
          selectedRoomId={selectedRoomId}
          onTap={handleTap}
          height={380}
        />

        <div className="absolute top-2 right-2 flex flex-col gap-2">
          <button
            onClick={() => canvasRef.current?.fit()}
            className="w-9 h-9 bg-white/95 border border-gray-200 rounded-xl flex items-center justify-center shadow-sm active:bg-gray-100"
            aria-label="Recadrer"
          >
            <Maximize2 size={16} className="text-gray-600" />
          </button>
          {walls.length > 0 && (
            <button
              onClick={undoLastWall}
              className="w-9 h-9 bg-white/95 border border-gray-200 rounded-xl flex items-center justify-center shadow-sm active:bg-gray-100"
              aria-label="Annuler"
            >
              <Undo2 size={16} className="text-gray-600" />
            </button>
          )}
        </div>

        {mode === 'draw' && (
          <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2">
            <button
              onClick={() => setOrtho(o => !o)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold shadow-sm border ${
                ortho ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              ⊾ Angles droits
            </button>
            <div className="flex rounded-xl overflow-hidden border border-gray-200 shadow-sm">
              {[
                { id: 'porteur', label: 'Porteur' },
                { id: 'cloison', label: 'Cloison' },
              ].map(k => (
                <button
                  key={k.id}
                  onClick={() => setWallKind(k.id)}
                  className={`px-3 py-2 text-xs font-semibold ${
                    wallKind === k.id ? 'bg-slate-700 text-white' : 'bg-white text-gray-600'
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
            {draft && (
              <button
                onClick={() => finishDrawing()}
                className="ml-auto px-3 py-2 bg-green-600 text-white rounded-xl text-xs font-semibold shadow-sm"
              >
                <Check size={14} className="inline mr-1" />
                Terminer
              </button>
            )}
          </div>
        )}
      </div>

      {/* Aide contextuelle */}
      <ModeHelp mode={mode} isEmpty={isEmpty} drafting={!!draft} />

      {/* Démarrage rapide */}
      {isEmpty && (
        <div className="p-4 space-y-3">
          <div className="card space-y-3">
            <h3 className="font-semibold text-gray-900">Par où commencer ?</h3>
            <button
              onClick={() => setSheet('rect')}
              className="w-full flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl text-left active:bg-blue-100"
            >
              <span className="text-2xl">▭</span>
              <div className="flex-1">
                <p className="font-semibold text-sm text-gray-900">Rectangle rapide</p>
                <p className="text-xs text-gray-500">Vous saisissez les dimensions, le plan se dessine tout seul</p>
              </div>
            </button>
            <button
              onClick={() => setMode('draw')}
              className="w-full flex items-center gap-3 p-3 bg-gray-50 border border-gray-100 rounded-xl text-left active:bg-gray-100"
            >
              <span className="text-2xl">✏️</span>
              <div className="flex-1">
                <p className="font-semibold text-sm text-gray-900">Dessiner librement</p>
                <p className="text-xs text-gray-500">Pour une maison en L, en U ou toute forme particulière</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Résumé */}
      {!isEmpty && (
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Habitable" value={`${surfaces.floorArea.toFixed(1).replace('.', ',')} m²`} tone="blue" />
            <Stat label="Emprise au sol" value={`${surfaces.footprint.toFixed(1).replace('.', ',')} m²`} tone="slate" />
            <Stat label="Pièces" value={rooms.length} tone="green" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => navigate('/plan/3d')}
              className="flex items-center justify-center gap-2 bg-slate-800 text-white font-semibold py-3 rounded-xl active:bg-slate-900"
            >
              <Box size={18} />
              Voir en 3D
            </button>
            <button
              onClick={() => navigate('/chiffrage')}
              className="flex items-center justify-center gap-2 bg-blue-600 text-white font-semibold py-3 rounded-xl active:bg-blue-700"
            >
              <Calculator size={18} />
              Chiffrage
            </button>
            <button
              onClick={() => navigate('/plan/plomberie')}
              className="flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 font-semibold py-3 rounded-xl active:bg-gray-50"
            >
              <Droplets size={18} className="text-blue-500" />
              Plomberie
            </button>
            <button
              onClick={() => navigate('/plan/electricite')}
              className="flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 font-semibold py-3 rounded-xl active:bg-gray-50"
            >
              <Zap size={18} className="text-amber-500" />
              Électricité
            </button>
          </div>

          <button
            onClick={() => setSheet('settings')}
            className="w-full card flex items-center gap-3 active:bg-gray-50"
          >
            <Settings2 size={18} className="text-gray-500" />
            <div className="flex-1 text-left">
              <p className="font-semibold text-sm text-gray-900">Caractéristiques du bâtiment</p>
              <p className="text-xs text-gray-500">
                {structure.label} · {plan.ceilingHeight} cm sous plafond · toit {ROOF_TYPES.find(r => r.id === plan.roof?.kind)?.label.toLowerCase()}
              </p>
            </div>
          </button>

          {rooms.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-2 text-sm">Pièces détectées</h3>
              <div className="space-y-1">
                {rooms.map(room => (
                  <button
                    key={room.id}
                    onClick={() => { setMode('room'); setSelectedRoomId(room.id) }}
                    className="w-full flex items-center gap-3 py-2 border-b border-gray-50 last:border-0 text-left active:bg-gray-50"
                  >
                    <span className="text-lg">{room.typeInfo.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{room.name}</p>
                      {room.autoTyped && (
                        <p className="text-[11px] text-amber-600">Type deviné, touchez pour corriger</p>
                      )}
                    </div>
                    <span className="text-sm text-gray-500">{room.area.toFixed(1).replace('.', ',')} m²</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {rooms.length === 0 && walls.length > 2 && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
              <p className="text-sm font-semibold text-amber-800 mb-1">Aucune pièce détectée</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                Les pièces apparaissent quand les murs forment un contour fermé. Vérifiez qu'il ne reste pas
                un angle ouvert : en mode Murs, les extrémités s'aimantent automatiquement quand vous
                approchez d'un mur existant.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Panneau mur sélectionné */}
      {selectedWall && (
        <WallSheet
          wall={selectedWall}
          onClose={() => setSelectedWallId(null)}
          onChange={(patch) => setWalls(walls.map(w => (w.id === selectedWall.id ? { ...w, ...patch } : w)))}
          onLength={(cm) => setWalls(setWallLength(walls, selectedWall.id, cm))}
          onDelete={() => deleteWall(selectedWall.id)}
        />
      )}

      {/* Panneau pièce sélectionnée */}
      {selectedRoom && (
        <RoomSheet
          room={selectedRoom}
          onClose={() => setSelectedRoomId(null)}
          onChange={(patch) => setRoomMeta(selectedRoom, patch)}
        />
      )}

      {/* Panneau ouverture sélectionnée */}
      {selectedOpening && (
        <OpeningSheet
          opening={selectedOpening}
          wall={walls.find(w => w.id === selectedOpening.wallId)}
          onClose={() => setSelectedOpeningId(null)}
          onChange={(patch) => updatePlan({
            openings: (plan.openings || []).map(o => (o.id === selectedOpening.id ? { ...o, ...patch } : o)),
          })}
          onDelete={() => {
            updatePlan({ openings: (plan.openings || []).filter(o => o.id !== selectedOpening.id) })
            setSelectedOpeningId(null)
          }}
        />
      )}

      {sheet === 'rect' && <RectangleSheet onClose={() => setSheet(null)} onCreate={createRectangle} />}
      {sheet === 'settings' && (
        <BuildingSheet plan={plan} onClose={() => setSheet(null)} onChange={updatePlan} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------ composants */

function Stat({ label, value, tone }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700',
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-green-50 text-green-700',
  }
  return (
    <div className={`rounded-2xl p-3 text-center ${tones[tone] || tones.slate}`}>
      <p className="text-lg font-bold leading-tight">{value}</p>
      <p className="text-[11px] opacity-80 mt-0.5">{label}</p>
    </div>
  )
}

function ModeHelp({ mode, isEmpty, drafting }) {
  const texts = {
    view: isEmpty ? null : 'Touchez un mur, une pièce ou une ouverture pour la modifier. Deux doigts pour zoomer.',
    draw: drafting
      ? "Continuez à toucher pour poser les murs. Revenez sur le point de départ pour fermer le contour."
      : "Touchez l'écran pour poser le premier point. Les extrémités s'aimantent aux murs existants.",
    opening: "Touchez un mur à l'endroit où vous voulez poser une fenêtre ou une porte.",
    room: 'Touchez une pièce pour lui donner un nom et un type.',
  }
  const text = texts[mode]
  if (!text) return null
  return (
    <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100">
      <p className="text-xs text-blue-800 leading-relaxed">{text}</p>
    </div>
  )
}

function Sheet({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-lg mx-auto bg-white rounded-t-3xl max-h-[85vh] overflow-y-auto safe-bottom"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white px-4 py-3 border-b border-gray-100 flex items-center justify-between rounded-t-3xl">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X size={16} className="text-gray-500" />
          </button>
        </div>
        <div className="p-4 space-y-4">{children}</div>
      </div>
    </div>
  )
}

function NumberField({ label, value, onChange, unit, step = 1, min, max, help }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={e => onChange(e.target.value)}
          className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {unit && <span className="text-sm text-gray-500 w-10">{unit}</span>}
      </div>
      {help && <p className="text-xs text-gray-500 mt-1">{help}</p>}
    </div>
  )
}

function WallSheet({ wall, onClose, onChange, onLength, onDelete }) {
  const [length, setLength] = useState((dist(wall.a, wall.b) / 100).toFixed(2))

  return (
    <Sheet title="Mur" onClose={onClose}>
      <div className="flex gap-2">
        {[
          { id: 'porteur', label: 'Mur porteur', desc: 'Structure' },
          { id: 'cloison', label: 'Cloison', desc: 'Distribution' },
        ].map(k => (
          <button
            key={k.id}
            onClick={() => onChange({ kind: k.id, thickness: k.id === 'porteur' ? 20 : 7 })}
            className={`flex-1 p-3 rounded-2xl border-2 text-left ${
              wall.kind === k.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-white'
            }`}
          >
            <p className="font-semibold text-sm text-gray-900">{k.label}</p>
            <p className="text-xs text-gray-500">{k.desc}</p>
          </button>
        ))}
      </div>

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <NumberField
            label="Longueur"
            value={length}
            step={0.05}
            unit="m"
            onChange={setLength}
            help="Modifie la position de l'extrémité, les murs connectés suivent."
          />
        </div>
        <button
          onClick={() => onLength(Math.round(parseFloat(length.toString().replace(',', '.')) * 100))}
          className="btn-primary mb-0.5 px-5"
        >
          OK
        </button>
      </div>

      <NumberField
        label="Épaisseur"
        value={wall.thickness}
        unit="cm"
        onChange={v => onChange({ thickness: Math.max(4, parseInt(v, 10) || 20) })}
        help="20 cm pour du parpaing, 7 cm pour une cloison BA13 sur rails de 48."
      />

      <button
        onClick={onDelete}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 text-red-600 font-semibold active:bg-red-100"
      >
        <Trash2 size={16} />
        Supprimer ce mur
      </button>
    </Sheet>
  )
}

function RoomSheet({ room, onClose, onChange }) {
  return (
    <Sheet title={`${room.name} — ${room.area.toFixed(1).replace('.', ',')} m²`} onClose={onClose}>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Type de pièce</label>
        <div className="grid grid-cols-3 gap-2">
          {ROOM_TYPES.map(type => (
            <button
              key={type.id}
              onClick={() => onChange({ type: type.id, name: type.label })}
              className={`p-3 rounded-2xl border-2 flex flex-col items-center gap-1 ${
                room.type === type.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-white'
              }`}
            >
              <span className="text-xl">{type.icon}</span>
              <span className="text-[11px] font-medium text-gray-700 text-center leading-tight">{type.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Nom personnalisé</label>
        <input
          type="text"
          value={room.name}
          onChange={e => onChange({ name: e.target.value })}
          placeholder="Chambre des enfants"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-slate-50 rounded-xl p-3 space-y-1">
        <Row label="Surface utile" value={`${room.area.toFixed(1).replace('.', ',')} m²`} />
        <Row label="Périmètre" value={`${room.perimeter.toFixed(2).replace('.', ',')} m`} />
        <Row label="Surface au sol (axes)" value={`${room.grossArea.toFixed(1).replace('.', ',')} m²`} />
      </div>
    </Sheet>
  )
}

function OpeningSheet({ opening, wall, onClose, onChange, onDelete }) {
  const maxOffset = wall ? dist(wall.a, wall.b) - opening.width / 2 : 500
  return (
    <Sheet title="Ouverture" onClose={onClose}>
      <div className="grid grid-cols-3 gap-2">
        {OPENING_KINDS.map(k => (
          <button
            key={k.id}
            onClick={() => onChange({ kind: k.id, width: k.width, height: k.height, sill: k.sill })}
            className={`p-3 rounded-2xl border-2 flex flex-col items-center gap-1 ${
              opening.kind === k.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-white'
            }`}
          >
            <span className="text-xl">{k.icon}</span>
            <span className="text-[11px] font-medium text-gray-700 text-center leading-tight">{k.label}</span>
          </button>
        ))}
      </div>

      <NumberField label="Largeur" value={opening.width} unit="cm"
        onChange={v => onChange({ width: Math.max(40, parseInt(v, 10) || 100) })} />
      <NumberField label="Hauteur" value={opening.height} unit="cm"
        onChange={v => onChange({ height: Math.max(40, parseInt(v, 10) || 100) })} />
      <NumberField
        label="Allège (hauteur sous la fenêtre)"
        value={opening.sill}
        unit="cm"
        onChange={v => onChange({ sill: Math.max(0, parseInt(v, 10) || 0) })}
        help="0 pour une porte ou une baie. 95 cm est la hauteur classique d'une fenêtre."
      />
      <NumberField
        label="Position depuis le début du mur"
        value={opening.offset}
        unit="cm"
        onChange={v => onChange({ offset: Math.min(maxOffset, Math.max(opening.width / 2, parseInt(v, 10) || 0)) })}
      />

      <button
        onClick={onDelete}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 text-red-600 font-semibold active:bg-red-100"
      >
        <Trash2 size={16} />
        Supprimer cette ouverture
      </button>
    </Sheet>
  )
}

function RectangleSheet({ onClose, onCreate }) {
  const [width, setWidth] = useState('10')
  const [depth, setDepth] = useState('8')
  const w = parseFloat(width.replace(',', '.')) || 0
  const d = parseFloat(depth.replace(',', '.')) || 0

  return (
    <Sheet title="Rectangle rapide" onClose={onClose}>
      <p className="text-sm text-gray-600 leading-relaxed">
        Saisissez les dimensions extérieures de votre maison. Vous pourrez ensuite ajouter les
        cloisons intérieures pour créer les pièces.
      </p>
      <NumberField label="Largeur (façade)" value={width} unit="m" step={0.1} onChange={setWidth} />
      <NumberField label="Profondeur" value={depth} unit="m" step={0.1} onChange={setDepth} />

      <div className="bg-blue-50 rounded-xl p-3">
        <p className="text-sm text-blue-800">
          Emprise au sol : <span className="font-bold">{(w * d).toFixed(1).replace('.', ',')} m²</span>
        </p>
        <p className="text-xs text-blue-600 mt-0.5">Périmètre : {((w + d) * 2).toFixed(1).replace('.', ',')} m</p>
      </div>

      <button
        onClick={() => onCreate(w, d)}
        disabled={w < 2 || d < 2}
        className="w-full btn-primary disabled:opacity-40"
      >
        Créer le plan
      </button>
    </Sheet>
  )
}

function BuildingSheet({ plan, onClose, onChange }) {
  return (
    <Sheet title="Caractéristiques du bâtiment" onClose={onClose}>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Système constructif</label>
        <div className="space-y-2">
          {STRUCTURE_TYPES.map(s => (
            <button
              key={s.id}
              onClick={() => onChange({ structure: s.id })}
              className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 text-left ${
                plan.structure === s.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-white'
              }`}
            >
              <span className="text-2xl">{s.icon}</span>
              <div className="flex-1">
                <p className="font-semibold text-sm text-gray-900">{s.label} — {s.thickness} cm</p>
                <p className="text-xs text-gray-500">{s.description}</p>
                <p className="text-[11px] text-green-600 mt-0.5">Auto-construction : {s.diyRating.toLowerCase()}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Toiture</label>
        <div className="grid grid-cols-2 gap-2">
          {ROOF_TYPES.map(r => (
            <button
              key={r.id}
              onClick={() => onChange({ roof: { ...plan.roof, kind: r.id, pitch: r.pitch } })}
              className={`p-3 rounded-2xl border-2 text-left ${
                plan.roof?.kind === r.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-white'
              }`}
            >
              <span className="text-xl">{r.icon}</span>
              <p className="font-semibold text-sm text-gray-900 mt-1">{r.label}</p>
              <p className="text-[11px] text-gray-500 leading-tight">{r.description}</p>
            </button>
          ))}
        </div>
      </div>

      <NumberField
        label="Pente de toit"
        value={plan.roof?.pitch ?? 35}
        unit="°"
        onChange={v => onChange({ roof: { ...plan.roof, pitch: Math.max(1, Math.min(60, parseInt(v, 10) || 35)) } })}
        help="30 à 40° pour des tuiles en France métropolitaine. Vérifiez le PLU de votre commune : la pente y est souvent imposée."
      />

      <NumberField
        label="Hauteur sous plafond"
        value={plan.ceilingHeight}
        unit="cm"
        onChange={v => onChange({ ceilingHeight: Math.max(200, Math.min(400, parseInt(v, 10) || 250)) })}
        help="250 cm est le standard. 220 cm est le minimum réglementaire pour une pièce habitable."
      />

      <NumberField
        label="Débord de toiture"
        value={plan.roof?.overhang ?? 40}
        unit="cm"
        onChange={v => onChange({ roof: { ...plan.roof, overhang: Math.max(0, parseInt(v, 10) || 40) } })}
        help="40 à 50 cm protègent efficacement les façades de la pluie."
      />
    </Sheet>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-gray-900">{value}</span>
    </div>
  )
}

function findOpeningAt(plan, walls, world) {
  for (const o of plan.openings || []) {
    const wall = walls.find(w => w.id === o.wallId)
    if (!wall) continue
    const p = projectOnSegment(world, wall.a, wall.b)
    const len = dist(wall.a, wall.b)
    const centre = o.offset / len
    if (p.distance < wall.thickness / 2 + 10 && Math.abs(p.t - centre) * len < o.width / 2) return o
  }
  return null
}
