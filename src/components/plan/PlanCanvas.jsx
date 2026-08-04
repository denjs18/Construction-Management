import { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import { wallsBoundingBox, dist, projectOnSegment, formatMeters, lerp, direction, normal } from '../../lib/geometry'

/**
 * Canvas de plan 2D.
 *
 * Repère monde en centimètres. La vue est décrite par le coin haut-gauche
 * (ox, oy) exprimé en cm et une échelle en pixels par centimètre.
 * Gestes : un doigt pour se déplacer, deux doigts pour zoomer, tap pour agir.
 */

const MIN_SCALE = 0.05
const MAX_SCALE = 3

/** Rayon de saisie d'une poignée, en pixels écran */
const HANDLE_TOUCH = 22

const PlanCanvas = forwardRef(function PlanCanvas({
  walls = [],
  rooms = [],
  openings = [],
  equipment = [],
  electrical = [],
  routes = [],
  reservations = [],
  draft = null,
  cursor = null,
  selectedWallId = null,
  selectedRoomId = null,
  showDimensions = true,
  handles = [],
  activeHandleId = null,
  guides = [],
  onPickHandle,
  onDragStart,
  onDragMove,
  onDragEnd,
  onTap,
  height = 420,
}, ref) {
  const svgRef = useRef(null)
  const [view, setView] = useState({ ox: -100, oy: -100, scale: 0.35 })
  const pointers = useRef(new Map())
  const gesture = useRef(null)
  const [size, setSize] = useState({ w: 360, h: height })

  /* --------------------------------------------------------- dimensionnement */
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setSize({ w: rect.width || 360, h: rect.height || height })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [height])

  /* ------------------------------------------------------------ recadrage */
  const fit = useCallback(() => {
    const points = []
    for (const w of walls) { points.push(w.a, w.b) }
    if (!points.length) {
      setView({ ox: -200, oy: -200, scale: 0.3 })
      return
    }
    const bb = wallsBoundingBox(walls)
    const margin = 120
    const worldW = Math.max(bb.width + margin * 2, 300)
    const worldH = Math.max(bb.height + margin * 2, 300)
    const scale = Math.min(size.w / worldW, size.h / worldH)
    const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale))
    setView({
      ox: bb.minX - margin - (size.w / clamped - worldW) / 2,
      oy: bb.minY - margin - (size.h / clamped - worldH) / 2,
      scale: clamped,
    })
  }, [walls, size.w, size.h])

  useImperativeHandle(ref, () => ({ fit, zoomBy }), [fit])

  const didFit = useRef(false)
  useEffect(() => {
    if (didFit.current) return
    if (walls.length && size.w > 10) { fit(); didFit.current = true }
  }, [walls.length, size.w, fit])

  /* ------------------------------------------------------- transformations */
  const toWorld = useCallback((clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect()
    return {
      x: (clientX - rect.left) / view.scale + view.ox,
      y: (clientY - rect.top) / view.scale + view.oy,
    }
  }, [view])

  function zoomBy(factor, centerClient) {
    setView(v => {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor))
      if (!centerClient) return { ...v, scale: next }
      const rect = svgRef.current.getBoundingClientRect()
      const cx = centerClient.x - rect.left
      const cy = centerClient.y - rect.top
      return {
        ox: v.ox + cx / v.scale - cx / next,
        oy: v.oy + cy / v.scale - cy / next,
        scale: next,
      }
    })
  }

  /* ------------------------------------------------------------- gestes */
  const handlePointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) {
      const world = toWorld(e.clientX, e.clientY)
      // Si le doigt se pose sur un élément saisissable, on le déplace au lieu
      // de faire glisser la vue.
      const handle = onPickHandle?.(world, HANDLE_TOUCH / view.scale)
      if (handle) {
        gesture.current = { type: 'drag', handle, startX: e.clientX, startY: e.clientY, moved: false }
        onDragStart?.(handle, world)
        return
      }
      gesture.current = { type: 'maybe-tap', startX: e.clientX, startY: e.clientY, moved: false, view: { ...view } }
    } else if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()]
      gesture.current = {
        type: 'pinch',
        startDist: Math.hypot(p2.x - p1.x, p2.y - p1.y),
        startView: { ...view },
        center: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
      }
    }
  }

  const handlePointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return

    if (g.type === 'drag') {
      if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < 3) return
      g.moved = true
      onDragMove?.(g.handle, toWorld(e.clientX, e.clientY))
      return
    }

    if (g.type === 'pinch' && pointers.current.size >= 2) {
      const [p1, p2] = [...pointers.current.values()]
      const d = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      if (g.startDist > 0) {
        const factor = d / g.startDist
        const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, g.startView.scale * factor))
        const rect = svgRef.current.getBoundingClientRect()
        const cx = g.center.x - rect.left
        const cy = g.center.y - rect.top
        setView({
          ox: g.startView.ox + cx / g.startView.scale - cx / next,
          oy: g.startView.oy + cy / g.startView.scale - cy / next,
          scale: next,
        })
      }
      return
    }

    if (g.type === 'maybe-tap' || g.type === 'pan') {
      const dx = e.clientX - g.startX
      const dy = e.clientY - g.startY
      if (!g.moved && Math.hypot(dx, dy) > 8) { g.moved = true; g.type = 'pan' }
      if (g.type === 'pan') {
        setView({
          ox: g.view.ox - dx / g.view.scale,
          oy: g.view.oy - dy / g.view.scale,
          scale: g.view.scale,
        })
      }
    }
  }

  const handlePointerUp = (e) => {
    const g = gesture.current
    pointers.current.delete(e.pointerId)
    if (g && g.type === 'drag') {
      onDragEnd?.(g.handle, toWorld(e.clientX, e.clientY), g.moved)
      if (pointers.current.size === 0) gesture.current = null
      return
    }
    if (g && g.type === 'maybe-tap' && !g.moved && onTap) {
      const world = toWorld(e.clientX, e.clientY)
      // On transmet l'échelle : l'aimantage doit se sentir identique au doigt
      // quel que soit le zoom, donc son rayon se raisonne en pixels écran.
      onTap(world, { ...pickAt(world), scale: view.scale })
    }
    if (pointers.current.size === 0) gesture.current = null
  }

  const handleWheel = (e) => {
    e.preventDefault()
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, { x: e.clientX, y: e.clientY })
  }

  /* -------------------------------------------------- sélection au doigt */
  const pickAt = (world) => {
    const tolerance = Math.max(18, 14 / view.scale)
    let bestWall = null
    for (const wall of walls) {
      const p = projectOnSegment(world, wall.a, wall.b)
      const reach = Math.max(tolerance, wall.thickness / 2 + 8)
      if (p.distance < reach && (!bestWall || p.distance < bestWall.distance)) {
        bestWall = { wall, t: p.t, distance: p.distance, point: p.point }
      }
    }
    const room = rooms.find(r => pointInPoly(world, r.points))
    return { wall: bestWall, room, world }
  }

  /* ----------------------------------------------------------- rendu */
  const gridStep = view.scale > 0.6 ? 10 : view.scale > 0.18 ? 50 : 100
  const px = (v) => v / view.scale // épaisseur constante à l'écran

  return (
    <svg
      ref={svgRef}
      className="w-full touch-none select-none bg-white"
      style={{ height }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
    >
      <defs>
        <pattern
          id="grid"
          width={gridStep * view.scale}
          height={gridStep * view.scale}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${gridStep * view.scale} 0 L 0 0 0 ${gridStep * view.scale}`}
            fill="none"
            stroke="#E2E8F0"
            strokeWidth="1"
          />
        </pattern>
        <pattern
          id="grid-major"
          width={100 * view.scale}
          height={100 * view.scale}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${100 * view.scale} 0 L 0 0 0 ${100 * view.scale}`}
            fill="none"
            stroke="#CBD5E1"
            strokeWidth="1"
          />
        </pattern>
      </defs>

      <rect width="100%" height="100%" fill="url(#grid)" />
      <rect width="100%" height="100%" fill="url(#grid-major)" />

      <g transform={`scale(${view.scale}) translate(${-view.ox} ${-view.oy})`}>
        {/* Pièces */}
        {rooms.map(room => (
          <g key={room.id}>
            <polygon
              points={room.points.map(p => `${p.x},${p.y}`).join(' ')}
              fill={room.id === selectedRoomId ? '#DBEAFE' : '#F8FAFC'}
              stroke={room.id === selectedRoomId ? '#3B82F6' : 'none'}
              strokeWidth={px(2)}
            />
            {view.scale > 0.12 && (
              <g transform={`translate(${room.centroid.x} ${room.centroid.y})`}>
                <text
                  textAnchor="middle"
                  y={px(-4)}
                  fontSize={px(13)}
                  fill="#334155"
                  fontWeight="600"
                >
                  {room.typeInfo?.icon} {room.name}
                </text>
                <text textAnchor="middle" y={px(12)} fontSize={px(11)} fill="#64748B">
                  {room.area.toFixed(1).replace('.', ',')} m²
                </text>
              </g>
            )}
          </g>
        ))}

        {/* Murs */}
        {walls.map(wall => (
          <line
            key={wall.id}
            x1={wall.a.x} y1={wall.a.y} x2={wall.b.x} y2={wall.b.y}
            stroke={wall.id === selectedWallId ? '#2563EB' : wall.kind === 'porteur' ? '#475569' : '#94A3B8'}
            strokeWidth={wall.thickness}
            strokeLinecap="round"
          />
        ))}

        {/* Ouvertures */}
        {openings.map(o => {
          const wall = walls.find(w => w.id === o.wallId)
          if (!wall) return null
          const len = dist(wall.a, wall.b)
          if (len === 0) return null
          const t0 = Math.max(0, (o.offset - o.width / 2) / len)
          const t1 = Math.min(1, (o.offset + o.width / 2) / len)
          const p0 = lerp(wall.a, wall.b, t0)
          const p1 = lerp(wall.a, wall.b, t1)
          const isDoor = o.kind === 'porte' || o.kind === 'porte-entree' || o.kind === 'porte-garage'
          return (
            <g key={o.id}>
              <line
                x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y}
                stroke="#FFFFFF"
                strokeWidth={wall.thickness + 1}
                strokeLinecap="butt"
              />
              <line
                x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y}
                stroke={isDoor ? '#F97316' : '#0EA5E9'}
                strokeWidth={isDoor ? px(3) : wall.thickness * 0.35}
                strokeLinecap="butt"
              />
              {isDoor && <DoorSwing wall={wall} opening={o} px={px} />}
            </g>
          )
        })}

        {/* Réservations dans la dalle.
            Les diamètres sont en millimètres, le plan en centimètres : on
            divise donc par 10, avec un minimum lisible au doigt. */}
        {reservations.map(r => {
          const radius = Math.max(r.diameter / 20, px(7))
          if (r.isExit) {
            const side = Math.max(radius * 1.8, px(14))
            return (
              <g key={r.id}>
                <rect
                  x={r.point.x - side} y={r.point.y - side}
                  width={side * 2} height={side * 2} rx={px(4)}
                  fill="#FEF3C7" stroke="#B45309" strokeWidth={px(2)}
                />
                <text
                  x={r.point.x} y={r.point.y}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={px(13)} fill="#B45309" fontWeight="700"
                >
                  ➜
                </text>
                <text
                  x={r.point.x} y={r.point.y - side - px(5)}
                  textAnchor="middle" fontSize={px(10)} fill="#B45309" fontWeight="700"
                >
                  Sortie Ø{r.pipe}
                </text>
              </g>
            )
          }
          return (
            <g key={r.id}>
              <circle
                cx={r.point.x} cy={r.point.y} r={radius}
                fill="#FEE2E2" stroke="#DC2626" strokeWidth={px(1.5)}
              />
              <text
                x={r.point.x} y={r.point.y - radius - px(5)}
                textAnchor="middle" fontSize={px(10)} fill="#DC2626" fontWeight="600"
              >
                Ø{r.diameter}
              </text>
            </g>
          )
        })}

        {/* Cheminements de gaines et canalisations */}
        {routes.map(route => (
          <polyline
            key={route.id}
            points={route.points.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={route.color || '#EAB308'}
            strokeWidth={px(2)}
            strokeDasharray={`${px(6)} ${px(4)}`}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Équipements de plomberie */}
        {equipment.map(eq => (
          <g key={eq.id} transform={`translate(${eq.point.x} ${eq.point.y})`}>
            <circle r={px(13)} fill="#DBEAFE" stroke="#2563EB" strokeWidth={px(1.5)} />
            <text textAnchor="middle" dominantBaseline="central" fontSize={px(14)}>{eq.icon}</text>
          </g>
        ))}

        {/* Appareillage électrique */}
        {electrical.map(item => (
          <g key={item.id} transform={`translate(${item.point.x} ${item.point.y})`}>
            <circle r={px(11)} fill="#FEF9C3" stroke="#CA8A04" strokeWidth={px(1.5)} />
            <text textAnchor="middle" dominantBaseline="central" fontSize={px(12)}>{item.icon}</text>
          </g>
        ))}

        {/* Cotes */}
        {showDimensions && view.scale > 0.1 && walls.map(wall => {
          const mid = lerp(wall.a, wall.b, 0.5)
          const n = normal(wall.a, wall.b)
          const offset = wall.thickness / 2 + px(11)
          const angle = (Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x) * 180) / Math.PI
          const flip = angle > 90 || angle < -90
          return (
            <text
              key={`dim-${wall.id}`}
              x={mid.x + n.x * offset}
              y={mid.y + n.y * offset}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={px(10)}
              fill="#1E40AF"
              fontWeight="600"
              transform={`rotate(${flip ? angle + 180 : angle} ${mid.x + n.x * offset} ${mid.y + n.y * offset})`}
            >
              {formatMeters(dist(wall.a, wall.b))}
            </text>
          )
        })}

        {/* Poignées de manipulation */}
        {handles.map(handle => {
          const active = handle.id === activeHandleId
          if (handle.kind === 'node') {
            return (
              <g key={handle.id}>
                <circle
                  cx={handle.point.x} cy={handle.point.y} r={px(active ? 11 : 8)}
                  fill="#FFFFFF" stroke="#2563EB" strokeWidth={px(2.5)}
                />
                <circle cx={handle.point.x} cy={handle.point.y} r={px(3)} fill="#2563EB" />
              </g>
            )
          }
          if (handle.kind === 'opening') {
            return (
              <circle
                key={handle.id}
                cx={handle.point.x} cy={handle.point.y} r={px(active ? 10 : 7)}
                fill="#FFFFFF" stroke="#F97316" strokeWidth={px(2.5)}
              />
            )
          }
          return (
            <circle
              key={handle.id}
              cx={handle.point.x} cy={handle.point.y} r={px(active ? 9 : 6)}
              fill="#FFFFFF" stroke="#64748B" strokeWidth={px(2)}
            />
          )
        })}

        {/* Repères d'alignement pendant un déplacement */}
        {guides.map((guide, i) => (
          <line
            key={i}
            x1={guide.x1} y1={guide.y1} x2={guide.x2} y2={guide.y2}
            stroke="#EC4899" strokeWidth={px(1)} strokeDasharray={`${px(6)} ${px(4)}`}
          />
        ))}

        {/* Tracé en cours */}
        {draft && draft.points.length > 0 && (
          <g>
            <polyline
              points={[...draft.points, ...(cursor ? [cursor] : [])].map(p => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#2563EB"
              strokeWidth={px(2)}
              strokeDasharray={`${px(8)} ${px(5)}`}
            />
            {draft.points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={px(5)} fill="#2563EB" />
            ))}
            {cursor && draft.points.length > 0 && (
              <g>
                <circle cx={cursor.x} cy={cursor.y} r={px(6)} fill="#FFFFFF" stroke="#2563EB" strokeWidth={px(2)} />
                <text
                  x={(draft.points[draft.points.length - 1].x + cursor.x) / 2}
                  y={(draft.points[draft.points.length - 1].y + cursor.y) / 2 - px(10)}
                  textAnchor="middle"
                  fontSize={px(12)}
                  fill="#2563EB"
                  fontWeight="700"
                >
                  {formatMeters(dist(draft.points[draft.points.length - 1], cursor))}
                </text>
              </g>
            )}
          </g>
        )}
      </g>

      {/* Échelle */}
      <g transform={`translate(12 ${size.h - 18})`}>
        <line x1="0" y1="0" x2={100 * view.scale} y2="0" stroke="#334155" strokeWidth="2" />
        <line x1="0" y1="-4" x2="0" y2="4" stroke="#334155" strokeWidth="2" />
        <line x1={100 * view.scale} y1="-4" x2={100 * view.scale} y2="4" stroke="#334155" strokeWidth="2" />
        <text x={100 * view.scale + 6} y="4" fontSize="11" fill="#334155">1 m</text>
      </g>
    </svg>
  )
})

function DoorSwing({ wall, opening, px }) {
  const len = dist(wall.a, wall.b)
  if (len === 0) return null
  const t0 = Math.max(0, (opening.offset - opening.width / 2) / len)
  const hinge = lerp(wall.a, wall.b, t0)
  const d = direction(wall.a, wall.b)
  const n = normal(wall.a, wall.b)
  const w = opening.width
  const end = { x: hinge.x + n.x * w, y: hinge.y + n.y * w }
  const arcEnd = { x: hinge.x + d.x * w, y: hinge.y + d.y * w }
  return (
    <g>
      <line x1={hinge.x} y1={hinge.y} x2={end.x} y2={end.y} stroke="#FDBA74" strokeWidth={px(1.5)} />
      <path
        d={`M ${end.x} ${end.y} A ${w} ${w} 0 0 1 ${arcEnd.x} ${arcEnd.y}`}
        fill="none"
        stroke="#FDBA74"
        strokeWidth={px(1)}
        strokeDasharray={`${px(4)} ${px(3)}`}
      />
    </g>
  )
}

function pointInPoly(p, points) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const pi = points[i]
    const pj = points[j]
    if ((pi.y > p.y) !== (pj.y > p.y) && p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x) {
      inside = !inside
    }
  }
  return inside
}

export default PlanCanvas
