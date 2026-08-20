import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RotateCcw, Home, Layers, Calculator, Ruler, Eye, EyeOff, Info,
  HardHat, ChevronLeft, ChevronRight, BookOpen, Clock, AlertTriangle, Cable,
} from 'lucide-react'
import Header from '../layout/Header'
import { useApp } from '../../contexts/AppContext'
import {
  computeSurfaces, computeBuildingSurfaces, computeEstimate, hoursToDays, levelPlan,
} from '../../lib/metre'
import { computeElectrical } from '../../lib/electrical'
import { computePlumbing } from '../../lib/plumbing'
import { buildScene, projectScene, drawScene, defaultCamera, ridgeHeight } from '../../lib/render3d'
import { ROOF_TYPES, formatEuro } from '../../data/prices'
import { BUILD_STAGES, stageTotals } from '../../data/buildStages'

const MIN_ELEVATION = -0.12
const MAX_ELEVATION = 1.45

export default function View3D() {
  const navigate = useNavigate()
  const { activePlan } = useApp()
  const plan = activePlan

  const canvasRef = useRef(null)
  const pointers = useRef(new Map())
  const gesture = useRef(null)

  const [showRoof, setShowRoof] = useState(true)
  const [exploded, setExploded] = useState(false)
  const [showStructure, setShowStructure] = useState(true)
  const [interacting, setInteracting] = useState(false)
  const [size, setSize] = useState({ w: 360, h: 420 })
  const [stats, setStats] = useState({ faces: 0, drawn: 0, ms: 0 })
  const [stageIndex, setStageIndex] = useState(null) // null = maison terminée
  const [showNetworks, setShowNetworks] = useState(false)

  const [onlyLevel, setOnlyLevel] = useState(null) // null = tous les niveaux
  const building = useMemo(() => computeBuildingSurfaces(plan), [plan])
  const surfaces = building.ground
  // Les murs extérieurs se déterminent niveau par niveau : un mur du premier
  // étage peut être extérieur alors que celui qui le porte ne l'est pas.
  const exteriorWallIds = useMemo(
    () => building.levels.flatMap(l => l.surfaces.exteriorWalls.map(w => w.id)),
    [building],
  )

  const estimate = useMemo(() => computeEstimate(plan), [plan])
  const stage = stageIndex === null ? null : BUILD_STAGES[stageIndex]

  const groundView = useMemo(() => levelPlan(plan, 0), [plan])
  const networks = useMemo(() => ({
    electrical: computeElectrical(groundView, building.ground),
    plumbing: computePlumbing(groundView, building.ground),
  }), [groundView, building])

  const hasNetworks = networks.electrical.routes.length > 0 || networks.plumbing.routes.length > 0

  const scene = useMemo(
    () => buildScene(plan, {
      showRoof: showNetworks ? false : showRoof,
      exploded,
      exteriorWallIds,
      structure: showStructure,
      stage: stage?.id,
      networks,
      showNetworks,
      onlyLevel,
      terraces: building.top.outdoorRooms.map(r => r.points),
    }),
    [plan, showRoof, exploded, exteriorWallIds, showStructure, stage, networks, showNetworks, onlyLevel, building],
  )

  const [camera, setCamera] = useState(() => defaultCamera(scene.bbox))
  const cameraRef = useRef(camera)
  cameraRef.current = camera

  const resetCamera = useCallback(() => setCamera(defaultCamera(scene.bbox)), [scene.bbox])

  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current || !scene.bbox) return
    didInit.current = true
    setCamera(defaultCamera(scene.bbox))
  }, [scene.bbox])

  /* ------------------------------------------------------------ rendu */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    const update = () => {
      const rect = parent.getBoundingClientRect()
      setSize({ w: rect.width, h: rect.height })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.w) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size.w * dpr
    canvas.height = size.h * dpr
    canvas.style.width = `${size.w}px`
    canvas.style.height = `${size.h}px`
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const started = performance.now()
    const polygons = projectScene(scene.faces, camera, size.w, size.h, {
      maxLod: interacting ? 0 : 1,
    })
    drawScene(ctx, polygons, size.w, size.h)
    const elapsed = performance.now() - started
    setStats(previous => (
      Math.abs(previous.ms - elapsed) < 0.6 && previous.drawn === polygons.length
        ? previous
        : { faces: scene.faces.length, drawn: polygons.length, ms: elapsed }
    ))
  }, [scene, camera, size, interacting])

  /* ------------------------------------------------------------ gestes */
  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    setInteracting(true)
    if (pointers.current.size === 1) {
      gesture.current = { type: 'orbit', x: e.clientX, y: e.clientY, cam: { ...cameraRef.current } }
    } else if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()]
      gesture.current = {
        type: 'zoom',
        startDist: Math.hypot(p2.x - p1.x, p2.y - p1.y),
        cam: { ...cameraRef.current },
      }
    }
  }

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return

    if (g.type === 'zoom' && pointers.current.size >= 2) {
      const [p1, p2] = [...pointers.current.values()]
      const d = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      if (g.startDist > 0) {
        const factor = g.startDist / d
        setCamera(c => ({ ...c, distance: clamp(g.cam.distance * factor, 200, 20000) }))
      }
      return
    }

    if (g.type === 'orbit') {
      const dx = e.clientX - g.x
      const dy = e.clientY - g.y
      setCamera(c => ({
        ...c,
        azimuth: g.cam.azimuth + dx * 0.008,
        elevation: clamp(g.cam.elevation - dy * 0.006, MIN_ELEVATION, MAX_ELEVATION),
      }))
    }
  }

  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) { gesture.current = null; setInteracting(false) }
  }

  const onWheel = (e) => {
    e.preventDefault()
    setCamera(c => ({ ...c, distance: clamp(c.distance * (e.deltaY > 0 ? 1.12 : 1 / 1.12), 200, 20000) }))
  }

  /* ------------------------------------------------------------ écran */

  if (!(plan.levels || []).some(l => (l.walls || []).length)) {
    return (
      <div className="pb-24 min-h-screen bg-slate-50">
        <Header title="Vue 3D" back />
        <div className="p-6 text-center">
          <Home size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium mb-1">Aucun plan dessiné</p>
          <p className="text-sm text-gray-400 mb-5 leading-relaxed">
            La maquette 3D se construit automatiquement à partir de votre plan.
          </p>
          <button onClick={() => navigate('/plan')} className="btn-primary">Dessiner mon plan</button>
        </div>
      </div>
    )
  }

  const faitage = ridgeHeight(plan)
  const roofLabel = ROOF_TYPES.find(r => r.id === plan.roof?.kind)?.label || '2 pans'
  const boxArea = scene.bbox ? (scene.bbox.width * scene.bbox.height) / 10000 : 0
  const irregular = boxArea > 0 && (scene.contour?.area || 0) < boxArea * 0.97

  return (
    <div className="pb-24 bg-slate-50 min-h-screen">
      <Header title="Vue 3D" back />

      {plan.levels.length > 1 && (
        <div className="bg-slate-800 px-3 py-2 flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => { setOnlyLevel(null); resetCamera() }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex-shrink-0 ${
              onlyLevel === null ? 'bg-white text-slate-900' : 'bg-white/10 text-white/70'
            }`}
          >
            Tout le bâtiment
          </button>
          {plan.levels.map((lvl, i) => (
            <button
              key={lvl.id || i}
              onClick={() => {
                setOnlyLevel(i)
                // On plonge la caméra pour regarder dans le niveau isolé
                setCamera(c => ({ ...c, elevation: Math.max(c.elevation, 0.95) }))
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex-shrink-0 ${
                onlyLevel === i ? 'bg-white text-slate-900' : 'bg-white/10 text-white/70'
              }`}
            >
              {i === 0 ? 'RDC seul' : `Étage ${i} seul`}
            </button>
          ))}
        </div>
      )}

      <div className="relative bg-slate-200" style={{ height: 420 }}>
        <canvas
          ref={canvasRef}
          className="touch-none block"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        />

        <div className="absolute top-2 right-2 flex flex-col gap-2">
          <IconButton onClick={resetCamera} label="Recadrer"><RotateCcw size={16} /></IconButton>
          <IconButton onClick={() => setShowRoof(s => !s)} label="Toiture" active={!showRoof}>
            {showRoof ? <Eye size={16} /> : <EyeOff size={16} />}
          </IconButton>
          <IconButton onClick={() => setExploded(e => !e)} label="Éclaté" active={exploded}>
            <Layers size={16} />
          </IconButton>
          {hasNetworks && (
            <IconButton
              onClick={() => {
                setShowNetworks(next => {
                  if (!next) setCamera(c => ({ ...c, elevation: Math.max(c.elevation, 1.05) }))
                  return !next
                })
              }}
              label="Réseaux"
              active={showNetworks}
            >
              <Cable size={16} />
            </IconButton>
          )}
        </div>

        {onlyLevel !== null && (
          <div className="absolute bottom-2 left-2 right-2 bg-white/95 rounded-xl px-3 py-2 shadow-sm">
            <p className="text-[11px] text-gray-700 leading-relaxed">
              <span className="font-semibold">
                {onlyLevel === 0 ? 'Rez-de-chaussée' : `Étage ${onlyLevel}`} isolé
              </span>
              {' — '}toiture et autres niveaux retirés pour voir l'aménagement.
            </p>
          </div>
        )}

        {stage ? (
          <div className="absolute top-2 left-2 bg-white/95 rounded-xl px-3 py-2 shadow-sm max-w-[62%]">
            <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">
              Étape {stageIndex + 1} sur {BUILD_STAGES.length}
            </p>
            <p className="text-sm font-bold text-gray-900 leading-tight">
              {stage.icon} {stage.label}
            </p>
          </div>
        ) : onlyLevel === null ? (
          <div className="absolute bottom-2 left-2 bg-white/90 rounded-xl px-3 py-1.5">
            <p className="text-[11px] text-gray-600">
              Un doigt pour tourner · deux doigts pour zoomer
            </p>
          </div>
        ) : null}
      </div>

      {showNetworks && (
        <div className="px-4 pt-4">
          <div className="card space-y-2">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
              <Cable size={16} className="text-amber-500" />
              Réseaux avant fermeture
            </h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              La dalle et les cloisons sont retirées pour laisser voir ce qu'elles recouvriront.
              C'est exactement l'état du chantier au moment où il faut tout vérifier : une fois
              la chape coulée et les plaques posées, plus rien n'est accessible.
            </p>
            <div className="flex gap-4 pt-1">
              <span className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="w-3 h-3 rounded-full" style={{ background: '#E0A422' }} />
                Gaines électriques
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="w-3 h-3 rounded-full" style={{ background: '#3F7FA6' }} />
                Évacuations
              </span>
            </div>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Les diamètres d'évacuation sont à l'échelle. Les gaines ICTA sont grossies :
              un Ø20 réel serait invisible à l'échelle d'une maison.
            </p>
          </div>
        </div>
      )}

      {/* Curseur de chantier */}
      <ConstructionTimeline
        stageIndex={stageIndex}
        onChange={setStageIndex}
        estimate={estimate}
      />

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Stat value={`${building.floorArea.toFixed(1).replace('.', ',')} m²`} label="Habitable" />
          <Stat value={`${(faitage / 100).toFixed(2).replace('.', ',')} m`} label="Hauteur faîtage" />
          <Stat value={`${building.top.roofArea.toFixed(0)} m²`} label="Toiture" />
        </div>

        <div className="card space-y-2">
          <h3 className="font-semibold text-gray-900 text-sm">Volumétrie</h3>
          <Row label="Emprise au sol" value={`${building.footprint.toFixed(1).replace('.', ',')} m²`} />
          <Row label="Niveaux" value={plan.levels.map((l, i) => `${i === 0 ? 'RDC' : `Étage ${i}`} ${l.ceilingHeight} cm`).join(' · ')} />
          {building.terraceArea > 0 && (
            <Row label="Terrasses" value={`${building.terraceArea.toFixed(1).replace('.', ',')} m²`} />
          )}
          <Row
            label="Toiture"
            value={plan.roof?.kind === 'plat' ? roofLabel : `${roofLabel}, pente ${plan.roof?.pitch ?? 35}°`}
          />
          <Row label="Débord de toit" value={`${plan.roof?.overhang ?? 40} cm`} />
          <Row label="Volume chauffé" value={`${building.volume.toFixed(0)} m³`} />
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-2">
          <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800 leading-relaxed">
            La hauteur au faîtage est presque toujours limitée par le PLU de votre commune,
            souvent entre 7 et 9 m en zone pavillonnaire. Vérifiez-la avant de déposer votre
            permis de construire : c'est le motif de refus le plus fréquent.
          </p>
        </div>

        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex gap-2">
          <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 leading-relaxed">
            Les poteaux, chaînages, linteaux et fermes sont représentés avec des sections
            courantes, à titre indicatif. Ce n'est pas un calcul de structure : le
            dimensionnement des fondations, des armatures et des portées relève d'un bureau
            d'études, et lui seul engage sa responsabilité.
          </p>
        </div>

        {irregular && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
            <p className="text-xs text-blue-800 leading-relaxed">
              Votre emprise n'est pas rectangulaire : elle est découpée en corps de bâtiment, et
              chaque aile reçoit sa propre toiture. Les noues, ces lignes de rencontre entre deux
              pans où l'eau se concentre, apparaissent là où les corps se rejoignent. Soignez-les
              particulièrement : c'est le point d'entrée d'eau le plus fréquent d'une toiture.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => navigate('/plan')}
            className="flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 font-semibold py-3 rounded-xl active:bg-gray-50"
          >
            <Ruler size={17} />
            Modifier le plan
          </button>
          <button
            onClick={() => navigate('/chiffrage')}
            className="flex items-center justify-center gap-2 bg-blue-600 text-white font-semibold py-3 rounded-xl active:bg-blue-700"
          >
            <Calculator size={17} />
            Chiffrage
          </button>
        </div>
      </div>
    </div>
  )
}

function IconButton({ children, onClick, label, active }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm border ${
        active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white/95 text-gray-600 border-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

function Stat({ value, label }) {
  return (
    <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
      <p className="text-base font-bold text-gray-900 leading-tight">{value}</p>
      <p className="text-[11px] text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-gray-900">{value}</span>
    </div>
  )
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

/* ------------------------------------------------- curseur de chantier */

/**
 * Rejoue la construction du terrain nu jusqu'aux cloisons.
 *
 * Chaque étape affiche ce qu'elle coûte d'après le chiffrage du projet, le
 * temps de travail si l'utilisateur la réalise lui-même, le point de vigilance
 * qui compte, et le guide correspondant quand il existe.
 */
function ConstructionTimeline({ stageIndex, onChange, estimate }) {
  const navigate = useNavigate()
  const active = stageIndex !== null
  const stage = active ? BUILD_STAGES[stageIndex] : null
  const totals = useMemo(
    () => (stage ? stageTotals(estimate, stage.id) : null),
    [estimate, stage],
  )

  return (
    <div className="px-4 pt-4">
      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <HardHat size={17} className="text-blue-600" />
            Suivre le chantier
          </h3>
          <button
            onClick={() => onChange(active ? null : 0)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
              active ? 'bg-gray-100 text-gray-700' : 'bg-blue-600 text-white'
            }`}
          >
            {active ? 'Voir terminé' : 'Rejouer'}
          </button>
        </div>

        {!active && (
          <p className="text-xs text-gray-500 leading-relaxed">
            Faites défiler les étapes pour voir votre maison se construire, du terrain nu
            aux cloisons, avec le coût et le temps de chaque phase.
          </p>
        )}

        {active && (
          <>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onChange(Math.max(0, stageIndex - 1))}
                disabled={stageIndex === 0}
                className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center disabled:opacity-35 flex-shrink-0"
                aria-label="Étape précédente"
              >
                <ChevronLeft size={18} className="text-gray-700" />
              </button>

              <input
                type="range"
                min={0}
                max={BUILD_STAGES.length - 1}
                value={stageIndex}
                onChange={e => onChange(parseInt(e.target.value, 10))}
                className="flex-1 accent-blue-600"
                aria-label="Étape du chantier"
              />

              <button
                onClick={() => onChange(Math.min(BUILD_STAGES.length - 1, stageIndex + 1))}
                disabled={stageIndex === BUILD_STAGES.length - 1}
                className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center disabled:opacity-35 flex-shrink-0"
                aria-label="Étape suivante"
              >
                <ChevronRight size={18} className="text-gray-700" />
              </button>
            </div>

            <div>
              <p className="font-bold text-gray-900">{stage.icon} {stage.label}</p>
              <p className="text-sm text-gray-600 leading-relaxed mt-1">{stage.detail}</p>
            </div>

            {totals.lines.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-blue-50 rounded-xl p-3">
                  <p className="text-[11px] text-blue-600">Coût de l'étape</p>
                  <p className="font-bold text-blue-800">{formatEuro(totals.total)}</p>
                </div>
                <div className="bg-green-50 rounded-xl p-3">
                  <p className="text-[11px] text-green-600 flex items-center gap-1">
                    <Clock size={11} /> Si vous le faites
                  </p>
                  <p className="font-bold text-green-800">
                    {totals.hours > 0 ? `${hoursToDays(totals.hours)} jours` : 'Pro requis'}
                  </p>
                </div>
              </div>
            )}

            {totals.lines.length > 0 && (
              <div className="space-y-1">
                {totals.lines.map(line => (
                  <div key={line.itemId} className="flex justify-between text-xs py-1 border-b border-gray-50 last:border-0">
                    <span className="text-gray-600 truncate pr-2">{line.label}</span>
                    <span className="text-gray-900 font-medium flex-shrink-0">
                      {line.qty.toLocaleString('fr-FR')} {line.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-2">
              <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">{stage.watch}</p>
            </div>

            {stage.guide && (
              <button
                onClick={() => navigate(`/guides/${stage.guide}`)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold"
              >
                <BookOpen size={15} />
                Lire le guide de cette étape
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
