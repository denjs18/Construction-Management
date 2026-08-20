import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MousePointer2, PenLine, DoorOpen, Home, Undo2, Trash2, Maximize2,
  Check, X, Calculator, Settings2, Box, Droplets, Zap, MoveVertical, RotateCw, AlertTriangle, Info,
} from 'lucide-react'
import Header from '../layout/Header'
import PlanCanvas from '../plan/PlanCanvas'
import { useApp } from '../../contexts/AppContext'
import {
  makeWall, smartSnap, orthoConstrain, dist, lerp, snap,
  rectanglePlan, setWallLength, projectOnSegment, healDanglingEnds,
  uniqueNodes, snapDrag, NODE_TOLERANCE,
} from '../../lib/geometry'
import { computeSurfaces, levelPlan, createEmptyLevel } from '../../lib/metre'
import { STRUCTURE_TYPES, STRUCTURE_BY_ID, ROOM_TYPES, ROOF_TYPES } from '../../data/prices'
import { stairGeometry, checkStair, STAIR_KINDS } from '../../lib/stairs'

const OPENING_KINDS = [
  { id: 'fenetre', label: 'Fenêtre', icon: '🪟', width: 120, height: 115, sill: 95 },
  { id: 'baie', label: 'Baie vitrée', icon: '🚪', width: 240, height: 215, sill: 0 },
  { id: 'porte', label: 'Porte intérieure', icon: '🚪', width: 83, height: 204, sill: 0 },
  { id: 'porte-entree', label: "Porte d'entrée", icon: '🏠', width: 93, height: 215, sill: 0 },
  { id: 'porte-garage', label: 'Porte de garage', icon: '🚗', width: 240, height: 200, sill: 0 },
]

const MODES = [
  { id: 'view', label: 'Modifier', icon: MousePointer2 },
  { id: 'draw', label: 'Murs', icon: PenLine },
  { id: 'opening', label: 'Ouvertures', icon: DoorOpen },
  { id: 'room', label: 'Pièces', icon: Home },
  { id: 'stair', label: 'Escalier', icon: MoveVertical },
]

export default function PlanEditor() {
  const navigate = useNavigate()
  const { activePlan, updatePlan, updateLevel } = useApp()
  const canvasRef = useRef(null)

  const [mode, setMode] = useState('view')
  const [ortho, setOrtho] = useState(true)
  const [wallKind, setWallKind] = useState('porteur')
  const [draft, setDraft] = useState(null)
  const [selectedWallId, setSelectedWallId] = useState(null)
  const [selectedRoomId, setSelectedRoomId] = useState(null)
  const [selectedOpeningId, setSelectedOpeningId] = useState(null)
  const [sheet, setSheet] = useState(null) // 'rect' | 'settings' | null
  const [activeHandleId, setActiveHandleId] = useState(null)
  const [guides, setGuides] = useState([])
  const [historyDepth, setHistoryDepth] = useState(0)
  const [activeLevel, setActiveLevel] = useState(0)
  const dragRef = useRef(null)
  const historyRef = useRef([])
  const sheetTouchedRef = useRef(false)

  const plan = activePlan
  const levelIndex = Math.min(activeLevel, plan.levels.length - 1)
  const level = plan.levels[levelIndex]
  const view = useMemo(() => levelPlan(plan, levelIndex), [plan, levelIndex])
  const surfaces = useMemo(() => computeSurfaces(view), [view])
  const rooms = surfaces.rooms
  const walls = level.walls || []
  // Le niveau inférieur sert de calque de report : sans lui, impossible
  // d'aligner les murs d'un étage sur ceux qui le portent.
  const ghostWalls = levelIndex > 0 ? (plan.levels[levelIndex - 1].walls || []) : []
  const setLevelData = (patch) => updateLevel(levelIndex, patch)

  const structure = STRUCTURE_BY_ID[plan.structure] || STRUCTURE_TYPES[0]
  const defaultThickness = wallKind === 'porteur' ? structure.thickness : 7

  // Chaque ouverture de panneau redémarre un nouveau point d'annulation
  useEffect(() => {
    sheetTouchedRef.current = false
  }, [selectedWallId, selectedOpeningId])

  const selectedWall = walls.find(w => w.id === selectedWallId) || null
  const selectedRoom = rooms.find(r => r.id === selectedRoomId) || null
  const selectedOpening = (level.openings || []).find(o => o.id === selectedOpeningId) || null

  /* ------------------------------------------------------------ actions */

  const setWalls = (next) => setLevelData({ walls: next })

  /* ------------------------------------------------------------ annulation */

  /**
   * Historique local des états du plan. Avec la manipulation directe, un geste
   * malheureux arrive vite : on empile un instantané avant chaque modification
   * pour pouvoir revenir en arrière. L'historique n'est pas persisté, il ne
   * vaut que pour la session d'édition en cours.
   */
  const pushHistory = () => {
    historyRef.current.push({
      walls: level.walls,
      openings: level.openings,
      roomMeta: level.roomMeta,
    })
    if (historyRef.current.length > 40) historyRef.current.shift()
    setHistoryDepth(historyRef.current.length)
  }

  /**
   * Les panneaux de réglage appliquent en direct, souvent à chaque frappe.
   * On n'empile donc qu'un seul instantané par ouverture de panneau, sinon
   * annuler reviendrait à défaire caractère par caractère.
   */
  const pushHistoryOnce = () => {
    if (sheetTouchedRef.current) return
    sheetTouchedRef.current = true
    pushHistory()
  }

  const undo = () => {
    const previous = historyRef.current.pop()
    setHistoryDepth(historyRef.current.length)
    if (!previous) return
    setLevelData(previous)
    setSelectedWallId(null)
    setSelectedOpeningId(null)
    setDraft(null)
  }

  /** Fin d'un tracé : on raccroche les extrémités restées en l'air */
  const finishDrawing = (currentWalls = walls) => {
    setWalls(healDanglingEnds(currentWalls))
    setDraft(null)
    setMode('view')
  }

  /* ------------------------------------------------ manipulation directe */

  const handles = useMemo(() => {
    if (mode !== 'view') return []
    const list = uniqueNodes(walls).map(node => ({
      id: `n:${node.key}`,
      kind: 'node',
      point: { x: node.x, y: node.y },
    }))
    for (const opening of level.openings || []) {
      const wall = walls.find(w => w.id === opening.wallId)
      if (!wall) continue
      const len = dist(wall.a, wall.b)
      if (len < 1) continue
      list.push({
        id: `o:${opening.id}`,
        kind: 'opening',
        openingId: opening.id,
        point: lerp(wall.a, wall.b, Math.min(1, opening.offset / len)),
      })
    }
    return list
  }, [walls, level.openings, mode])

  const pickHandle = (world, tolerance) => {
    if (mode !== 'view') return null

    let best = null
    for (const handle of handles) {
      const d = dist(world, handle.point)
      if (d <= tolerance && (!best || d < best.d)) best = { d, handle }
    }
    if (best) return best.handle

    // À défaut, le corps du mur lui-même se saisit
    for (const wall of walls) {
      const p = projectOnSegment(world, wall.a, wall.b)
      if (p.distance <= Math.max(tolerance * 0.65, wall.thickness / 2 + 4)) {
        return { id: `w:${wall.id}`, kind: 'wall', wallId: wall.id, point: p.point }
      }
    }
    return null
  }

  const beginDrag = (handle) => {
    setActiveHandleId(handle.id)
    pushHistory()
    const originals = new Map(walls.map(w => [w.id, { a: { ...w.a }, b: { ...w.b } }]))

    if (handle.kind === 'node') {
      const affected = []
      for (const wall of walls) {
        if (dist(wall.a, handle.point) <= NODE_TOLERANCE) affected.push({ id: wall.id, key: 'a' })
        if (dist(wall.b, handle.point) <= NODE_TOLERANCE) affected.push({ id: wall.id, key: 'b' })
      }
      dragRef.current = { kind: 'node', affected, originals, origin: { ...handle.point } }
      return
    }

    if (handle.kind === 'wall') {
      const wall = walls.find(w => w.id === handle.wallId)
      if (!wall) return
      const affected = []
      for (const end of ['a', 'b']) {
        for (const other of walls) {
          if (dist(other.a, wall[end]) <= NODE_TOLERANCE) affected.push({ id: other.id, key: 'a' })
          if (dist(other.b, wall[end]) <= NODE_TOLERANCE) affected.push({ id: other.id, key: 'b' })
        }
      }
      dragRef.current = { kind: 'wall', wallId: wall.id, affected, originals, origin: { ...handle.point } }
      return
    }

    if (handle.kind === 'opening') {
      dragRef.current = { kind: 'opening', openingId: handle.openingId }
    }
  }

  const applyDrag = (handle, world) => {
    const drag = dragRef.current
    if (!drag) return

    if (drag.kind === 'node') {
      const movingIds = [...new Set(drag.affected.map(a => a.id))]
      const result = snapDrag(world, walls, {
        excludeWallIds: movingIds,
        ignoreNear: drag.origin,
        radius: 25,
      })
      setGuides(result.guides)
      setWalls(walls.map(w => {
        const patches = drag.affected.filter(a => a.id === w.id)
        if (!patches.length) return w
        const next = { ...w }
        for (const p of patches) next[p.key] = { x: result.point.x, y: result.point.y }
        return next
      }))
      return
    }

    if (drag.kind === 'wall') {
      const dx = snap(world.x - drag.origin.x)
      const dy = snap(world.y - drag.origin.y)
      setGuides([])
      setWalls(walls.map(w => {
        const patches = drag.affected.filter(a => a.id === w.id)
        if (!patches.length) return w
        const base = drag.originals.get(w.id)
        const next = { ...w }
        for (const p of patches) {
          next[p.key] = { x: base[p.key].x + dx, y: base[p.key].y + dy }
        }
        return next
      }))
      return
    }

    if (drag.kind === 'opening') {
      const opening = (level.openings || []).find(o => o.id === drag.openingId)
      if (!opening) return
      // On autorise le passage d'un mur à l'autre : on cherche le mur le plus
      // proche du doigt, puis on borne la position pour que l'ouverture y tienne.
      let target = null
      for (const wall of walls) {
        const p = projectOnSegment(world, wall.a, wall.b)
        const len = dist(wall.a, wall.b)
        if (len < opening.width + 20) continue
        if (!target || p.distance < target.distance) target = { wall, ...p, len }
      }
      if (!target) return
      const half = opening.width / 2
      const offset = Math.round(Math.min(target.len - half, Math.max(half, target.t * target.len)))
      setLevelData({
        openings: (level.openings || []).map(o =>
          (o.id === opening.id ? { ...o, wallId: target.wall.id, offset } : o)),
      })
    }
  }

  const endDrag = (handle, world, moved) => {
    setActiveHandleId(null)
    setGuides([])
    const drag = dragRef.current
    dragRef.current = null

    if (!moved) {
      // Un appui sans déplacement reste une sélection
      if (handle.kind === 'wall') { setSelectedWallId(handle.wallId); setSelectedRoomId(null); setSelectedOpeningId(null) }
      else if (handle.kind === 'opening') { setSelectedOpeningId(handle.openingId); setSelectedWallId(null); setSelectedRoomId(null) }
      return
    }

    // Après un déplacement de mur entier, on rattrape les extrémités laissées
    // à quelques centimètres d'un autre mur.
    if (drag?.kind === 'wall') setWalls(healDanglingEnds(walls))
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

      pushHistory()
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
      pushHistory()
      const opening = {
        id: `o${Date.now().toString(36)}`,
        wallId: wall.id,
        offset: Math.round(offset),
        width: kind.width,
        height: kind.height,
        sill: kind.sill,
        kind: kind.id,
      }
      setLevelData({ openings: [...(level.openings || []), opening] })
      setSelectedOpeningId(opening.id)
      setSelectedWallId(null)
      setSelectedRoomId(null)
      return
    }

    if (mode === 'stair') {
      if (levelIndex >= plan.levels.length - 1) return
      updatePlan({
        stairs: [...(plan.stairs || []), {
          id: `st${Date.now().toString(36)}`,
          levelFrom: levelIndex,
          point: { x: Math.round(world.x / 10) * 10, y: Math.round(world.y / 10) * 10 },
          rotation: 0,
          width: 90,
          kind: 'droit',
        }],
      })
      setMode('view')
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

  const deleteWall = (id) => {
    pushHistory()
    setLevelData({
      walls: walls.filter(w => w.id !== id),
      openings: (level.openings || []).filter(o => o.wallId !== id),
    })
    setSelectedWallId(null)
  }

  const createRectangle = (widthM, depthM) => {
    const w = Math.round(widthM * 100)
    const d = Math.round(depthM * 100)
    if (w < 200 || d < 200) return
    pushHistory()
    setLevelData({ walls: [...walls, ...rectanglePlan(w, d, structure.thickness)] })
    setSheet(null)
    setMode('view')
    setTimeout(() => canvasRef.current?.fit(), 60)
  }

  const setRoomMeta = (room, patch) => {
    const metas = level.roomMeta || []
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
    setLevelData({ roomMeta: next })
  }

  const isEmpty = walls.length === 0

  /* ------------------------------------------------------------- rendu */

  return (
    <div className="pb-24 bg-slate-50 min-h-screen">
      <Header title="Plan de la maison" back />

      {/* Niveaux */}
      <LevelBar
        levels={plan.levels}
        activeIndex={levelIndex}
        onSelect={(i) => { setActiveLevel(i); setDraft(null); setMode('view'); setSelectedWallId(null); setSelectedRoomId(null) }}
        onAdd={() => {
          const next = createEmptyLevel(plan.levels.length)
          updatePlan({ levels: [...plan.levels, next] })
          setActiveLevel(plan.levels.length)
        }}
        onRemove={() => {
          if (plan.levels.length < 2) return
          updatePlan({
            levels: plan.levels.filter((_, i) => i !== levelIndex),
            stairs: (plan.stairs || []).filter(st => st.levelFrom !== levelIndex),
          })
          setActiveLevel(Math.max(0, levelIndex - 1))
        }}
      />

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
          ghostWalls={ghostWalls}
          rooms={rooms}
          openings={level.openings || []}
          draft={draft}
          selectedWallId={selectedWallId}
          selectedRoomId={selectedRoomId}
          stairs={(plan.stairs || [])
            .filter(st => st.levelFrom === levelIndex || st.levelFrom === levelIndex - 1)
            .map(st => ({
              ...st,
              arriving: st.levelFrom === levelIndex - 1,
              geometry: stairGeometry(
                (plan.levels[st.levelFrom]?.ceilingHeight || 250) + plan.floorThickness,
                st.kind, st.width,
              ),
            }))}
          handles={handles}
          activeHandleId={activeHandleId}
          guides={guides}
          onPickHandle={pickHandle}
          onDragStart={beginDrag}
          onDragMove={applyDrag}
          onDragEnd={endDrag}
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
          <button
            onClick={undo}
            disabled={historyDepth === 0}
            className="w-9 h-9 bg-white/95 border border-gray-200 rounded-xl flex items-center justify-center shadow-sm active:bg-gray-100 disabled:opacity-35"
            aria-label="Annuler"
          >
            <Undo2 size={16} className="text-gray-600" />
          </button>
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
                {structure.label} · {level.ceilingHeight} cm sous plafond · toit {ROOF_TYPES.find(r => r.id === plan.roof?.kind)?.label.toLowerCase()}
              </p>
            </div>
          </button>

          <StairList
            plan={plan}
            levelIndex={levelIndex}
            onChange={(id, patch) => updatePlan({
              stairs: (plan.stairs || []).map(st => (st.id === id ? { ...st, ...patch } : st)),
            })}
            onRemove={(id) => updatePlan({ stairs: (plan.stairs || []).filter(st => st.id !== id) })}
            onAdd={() => setMode('stair')}
          />

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
          onChange={(patch) => {
            pushHistoryOnce()
            setWalls(walls.map(w => (w.id === selectedWall.id ? { ...w, ...patch } : w)))
          }}
          onLength={(cm) => {
            pushHistoryOnce()
            setWalls(setWallLength(walls, selectedWall.id, cm))
          }}
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
          onChange={(patch) => {
            pushHistoryOnce()
            setLevelData({
              openings: (level.openings || []).map(o => (o.id === selectedOpening.id ? { ...o, ...patch } : o)),
            })
          }}
          onDelete={() => {
            pushHistory()
            setLevelData({ openings: (level.openings || []).filter(o => o.id !== selectedOpening.id) })
            setSelectedOpeningId(null)
          }}
        />
      )}

      {sheet === 'rect' && <RectangleSheet onClose={() => setSheet(null)} onCreate={createRectangle} />}
      {sheet === 'settings' && (
        <BuildingSheet
          plan={plan}
          level={level}
          onClose={() => setSheet(null)}
          onChange={updatePlan}
          onLevelChange={setLevelData}
        />
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
    view: isEmpty
      ? null
      : "Faites glisser les ronds bleus pour déformer la maison, un mur pour le déplacer, un rond orange pour faire coulisser une ouverture. Touchez sans glisser pour ouvrir les réglages.",
    draw: drafting
      ? "Continuez à toucher pour poser les murs. Revenez sur le point de départ pour fermer le contour."
      : "Touchez l'écran pour poser le premier point. Les extrémités s'aimantent aux murs existants.",
    opening: "Touchez un mur à l'endroit où vous voulez poser une fenêtre ou une porte.",
    room: 'Touchez une pièce pour lui donner un nom et un type.',
    stair: "Touchez le départ de l'escalier, en bas de la volée. Il monte vers le niveau du dessus.",
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

const THICKNESS_PRESETS = [
  { value: 7, label: '7', hint: 'Cloison BA13' },
  { value: 10, label: '10', hint: 'Cloison 98' },
  { value: 20, label: '20', hint: 'Parpaing' },
  { value: 30, label: '30', hint: 'Béton cell.' },
  { value: 37, label: '37', hint: 'Monomur' },
]

function WallSheet({ wall, onClose, onChange, onLength, onDelete }) {
  const currentCm = Math.round(dist(wall.a, wall.b))
  const [text, setText] = useState((currentCm / 100).toFixed(2))

  // Le mur peut aussi bouger au doigt pendant que le panneau est ouvert :
  // on resynchronise le champ pour qu'il reflète toujours la réalité.
  useEffect(() => {
    setText((currentCm / 100).toFixed(2))
  }, [currentCm])

  const apply = (cm) => onLength(Math.max(20, Math.round(cm)))

  return (
    <Sheet title="Mur" onClose={onClose}>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Longueur</label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => apply(currentCm - 10)}
            className="w-12 h-12 rounded-xl bg-gray-100 text-xl font-bold text-gray-700 active:bg-gray-200 flex-shrink-0"
          >
            −
          </button>
          <div className="flex-1 relative">
            <input
              type="text"
              inputMode="decimal"
              value={text}
              onChange={e => {
                setText(e.target.value)
                const v = parseFloat(e.target.value.replace(',', '.'))
                if (Number.isFinite(v) && v >= 0.2) apply(v * 100)
              }}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-center text-lg font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">m</span>
          </div>
          <button
            onClick={() => apply(currentCm + 10)}
            className="w-12 h-12 rounded-xl bg-gray-100 text-xl font-bold text-gray-700 active:bg-gray-200 flex-shrink-0"
          >
            +
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
          La modification s'applique tout de suite : l'extrémité se déplace et les murs
          qui y sont raccordés suivent.
        </p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Type</label>
        <div className="flex gap-2">
          {[
            { id: 'porteur', label: 'Mur porteur', desc: 'Structure' },
            { id: 'cloison', label: 'Cloison', desc: 'Distribution' },
            { id: 'garde-corps', label: 'Garde-corps', desc: 'Terrasse' },
          ].map(k => (
            <button
              key={k.id}
              onClick={() => onChange({ kind: k.id, thickness: k.id === 'porteur' ? 20 : k.id === 'garde-corps' ? 10 : 7 })}
              className={`flex-1 p-3 rounded-2xl border-2 text-left ${
                wall.kind === k.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-white'
              }`}
            >
              <p className="font-semibold text-[13px] text-gray-900 leading-tight">{k.label}</p>
              <p className="text-[11px] text-gray-500">{k.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Épaisseur</label>
        <div className="flex gap-1.5">
          {THICKNESS_PRESETS.map(p => (
            <button
              key={p.value}
              onClick={() => onChange({ thickness: p.value })}
              className={`flex-1 py-2 rounded-xl border-2 ${
                wall.thickness === p.value ? 'border-blue-500 bg-blue-50' : 'border-gray-100'
              }`}
            >
              <p className="text-sm font-bold text-gray-900">{p.label}</p>
              <p className="text-[9px] text-gray-500 leading-tight">{p.hint}</p>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1.5">Épaisseur actuelle : {wall.thickness} cm</p>
      </div>

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

function BuildingSheet({ plan, level, onClose, onChange, onLevelChange }) {
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
        label={`Hauteur sous plafond — ${level.name}`}
        value={level.ceilingHeight}
        unit="cm"
        onChange={v => onLevelChange({ ceilingHeight: Math.max(200, Math.min(400, parseInt(v, 10) || 250)) })}
        help="250 cm est le standard, et chaque niveau peut avoir la sienne. 180 cm est la hauteur en dessous de laquelle une surface ne compte plus comme habitable."
      />

      <NumberField
        label="Épaisseur du plancher entre niveaux"
        value={plan.floorThickness}
        unit="cm"
        onChange={v => onChange({ floorThickness: Math.max(15, Math.min(50, parseInt(v, 10) || 25)) })}
        help="Poutrelles, hourdis, dalle de compression et chape. 25 cm est courant. Cette épaisseur s'ajoute à la hauteur sous plafond pour donner la hauteur d'étage, et donc le nombre de marches de l'escalier."
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
  for (const o of (plan.openings || plan.levels?.[0]?.openings || [])) {
    const wall = walls.find(w => w.id === o.wallId)
    if (!wall) continue
    const p = projectOnSegment(world, wall.a, wall.b)
    const len = dist(wall.a, wall.b)
    const centre = o.offset / len
    if (p.distance < wall.thickness / 2 + 10 && Math.abs(p.t - centre) * len < o.width / 2) return o
  }
  return null
}


/* ------------------------------------------------------ barre de niveaux */

/**
 * Sélecteur d'étage. Chaque niveau porte ses propres murs, ouvertures et
 * équipements ; le plan complet n'est que leur empilement.
 */
function LevelBar({ levels, activeIndex, onSelect, onAdd, onRemove }) {
  return (
    <div className="bg-slate-800 px-3 py-2">
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {levels.map((level, i) => (
          <button
            key={level.id || i}
            onClick={() => onSelect(i)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex-shrink-0 ${
              i === activeIndex ? 'bg-white text-slate-900' : 'bg-white/10 text-white/70'
            }`}
          >
            {i === 0 ? 'RDC' : `Étage ${i}`}
          </button>
        ))}
        <button
          onClick={onAdd}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 text-white flex-shrink-0"
        >
          + Étage
        </button>
        {levels.length > 1 && activeIndex > 0 && (
          <button
            onClick={onRemove}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-500/20 text-red-200 flex-shrink-0"
          >
            Supprimer
          </button>
        )}
      </div>
    </div>
  )
}


/* ---------------------------------------------------------- escaliers */

/**
 * Escaliers partant du niveau affiché.
 *
 * Le nombre de marches découle de la hauteur d'étage : on ne le saisit pas, on
 * le constate. Ce qui se règle, c'est la forme, l'emmarchement et l'orientation.
 */
function StairList({ plan, levelIndex, onChange, onRemove, onAdd }) {
  const floorThickness = plan.floorThickness ?? 25
  const stairs = (plan.stairs || []).filter(st => st.levelFrom === levelIndex)
  const isTop = levelIndex >= plan.levels.length - 1

  if (isTop && !stairs.length) return null

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
          <MoveVertical size={16} className="text-blue-600" />
          Escalier vers le niveau du dessus
        </h3>
        {!isTop && !stairs.length && (
          <button onClick={onAdd} className="text-xs font-semibold text-blue-600">Ajouter</button>
        )}
      </div>

      {!stairs.length && (
        <p className="text-xs text-gray-500 leading-relaxed">
          Aucun escalier depuis ce niveau. Sans lui, l'étage n'est pas accessible.
        </p>
      )}

      {stairs.map(stair => {
        const rise = (plan.levels[levelIndex]?.ceilingHeight || 250) + floorThickness
        const geometry = stairGeometry(rise, stair.kind, stair.width)
        const issues = checkStair(geometry)
        return (
          <div key={stair.id} className="space-y-3 pt-1">
            <div className="grid grid-cols-3 gap-2">
              <MiniFigure value={geometry.steps} label="marches" />
              <MiniFigure value={`${geometry.riser} cm`} label="hauteur" />
              <MiniFigure value={`${geometry.tread} cm`} label="giron" />
            </div>

            <div className="bg-slate-50 rounded-xl p-3 space-y-1">
              <Row label="Hauteur à monter" value={`${(rise / 100).toFixed(2).replace('.', ',')} m`} />
              <Row label="Longueur au sol" value={`${(geometry.run / 100).toFixed(2).replace('.', ',')} m`} />
              <Row label="Trémie à réserver" value={`${(geometry.wellLength / 100).toFixed(2).replace('.', ',')} × ${(geometry.wellWidth / 100).toFixed(2).replace('.', ',')} m`} />
              <Row label="Surface au sol perdue" value={`${geometry.footprint.toFixed(1).replace('.', ',')} m²`} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Forme</label>
              <div className="grid grid-cols-3 gap-2">
                {STAIR_KINDS.map(kind => (
                  <button
                    key={kind.id}
                    onClick={() => onChange(stair.id, { kind: kind.id })}
                    className={`p-2 rounded-xl border-2 ${
                      stair.kind === kind.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100'
                    }`}
                  >
                    <p className="text-base">{kind.icon}</p>
                    <p className="text-[10px] font-medium text-gray-700 leading-tight">{kind.label}</p>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
                {STAIR_KINDS.find(k => k.id === stair.kind)?.note}
              </p>
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <NumberField
                  label="Emmarchement"
                  value={stair.width}
                  unit="cm"
                  onChange={v => onChange(stair.id, { width: Math.max(60, Math.min(160, parseInt(v, 10) || 90)) })}
                />
              </div>
              <button
                onClick={() => onChange(stair.id, { rotation: ((stair.rotation || 0) + 90) % 360 })}
                className="h-12 px-4 rounded-xl bg-gray-100 flex items-center gap-1.5 text-sm font-semibold text-gray-700"
              >
                <RotateCw size={15} />
                Pivoter
              </button>
            </div>

            {issues.map((issue, i) => (
              <div
                key={i}
                className={`rounded-xl p-3 flex gap-2 ${
                  issue.level === 'error' ? 'bg-red-50' : issue.level === 'warning' ? 'bg-amber-50' : 'bg-blue-50'
                }`}
              >
                {issue.level === 'info'
                  ? <Info size={14} className="text-blue-600 flex-shrink-0 mt-0.5" />
                  : <AlertTriangle size={14} className={`flex-shrink-0 mt-0.5 ${issue.level === 'error' ? 'text-red-500' : 'text-amber-500'}`} />}
                <p className={`text-[11px] leading-relaxed ${
                  issue.level === 'error' ? 'text-red-700' : issue.level === 'warning' ? 'text-amber-800' : 'text-blue-800'
                }`}>
                  {issue.text}
                </p>
              </div>
            ))}

            <button
              onClick={() => onRemove(stair.id)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-semibold"
            >
              <Trash2 size={15} />
              Supprimer l'escalier
            </button>
          </div>
        )
      })}
    </div>
  )
}

function MiniFigure({ value, label }) {
  return (
    <div className="bg-blue-50 rounded-xl py-2 text-center">
      <p className="text-base font-bold text-blue-800 leading-tight">{value}</p>
      <p className="text-[10px] text-blue-600">{label}</p>
    </div>
  )
}
