import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { RotateCcw, Home, Layers, Calculator, Ruler, Eye, EyeOff, Info } from 'lucide-react'
import Header from '../layout/Header'
import { useApp } from '../../contexts/AppContext'
import { computeSurfaces } from '../../lib/metre'
import { buildScene, projectScene, drawScene, defaultCamera, ridgeHeight } from '../../lib/render3d'
import { ROOF_TYPES } from '../../data/prices'

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

  const surfaces = useMemo(() => computeSurfaces(plan), [plan])
  const exteriorWallIds = useMemo(
    () => surfaces.exteriorWalls.map(w => w.id),
    [surfaces],
  )

  const scene = useMemo(
    () => buildScene(plan, { showRoof, exploded, exteriorWallIds, structure: showStructure }),
    [plan, showRoof, exploded, exteriorWallIds, showStructure],
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

  if (!(plan.walls || []).length) {
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
  const irregular = (scene.contour?.points?.length || 4) > 4

  return (
    <div className="pb-24 bg-slate-50 min-h-screen">
      <Header title="Vue 3D" back />

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
        </div>

        <div className="absolute bottom-2 left-2 bg-white/90 rounded-xl px-3 py-1.5">
          <p className="text-[11px] text-gray-600">
            Un doigt pour tourner · deux doigts pour zoomer
          </p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Stat value={`${surfaces.floorArea.toFixed(1).replace('.', ',')} m²`} label="Habitable" />
          <Stat value={`${(faitage / 100).toFixed(2).replace('.', ',')} m`} label="Hauteur faîtage" />
          <Stat value={`${surfaces.roofArea.toFixed(0)} m²`} label="Toiture" />
        </div>

        <div className="card space-y-2">
          <h3 className="font-semibold text-gray-900 text-sm">Volumétrie</h3>
          <Row label="Emprise au sol" value={`${surfaces.footprint.toFixed(1).replace('.', ',')} m²`} />
          <Row label="Hauteur sous plafond" value={`${plan.ceilingHeight} cm`} />
          <Row
            label="Toiture"
            value={plan.roof?.kind === 'plat' ? roofLabel : `${roofLabel}, pente ${plan.roof?.pitch ?? 35}°`}
          />
          <Row label="Débord de toit" value={`${plan.roof?.overhang ?? 40} cm`} />
          <Row label="Volume chauffé" value={`${surfaces.volume.toFixed(0)} m³`} />
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-2">
          <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800 leading-relaxed">
            La hauteur au faîtage est presque toujours limitée par le PLU de votre commune,
            souvent entre 7 et 9 m en zone pavillonnaire. Vérifiez-la avant de déposer votre
            permis de construire : c'est le motif de refus le plus fréquent.
          </p>
        </div>

        {irregular && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
            <p className="text-xs text-amber-800 leading-relaxed">
              Votre emprise n'est pas rectangulaire. Les murs et les surfaces sont exacts, mais la
              toiture est représentée de façon simplifiée sur le rectangle englobant : elle ne
              montre pas les noues ni les décrochés.
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
