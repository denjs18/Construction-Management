import { useState } from 'react'
import { useApp } from '../../contexts/AppContext'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Circle, Clock, ChevronDown, ChevronUp, BookOpen, Plus, StickyNote } from 'lucide-react'
import Header from '../layout/Header'
import { GUIDES } from '../../data/guides'

const STATUS_CONFIG = {
  todo: { label: 'À faire', icon: Circle, color: 'text-gray-300', bg: 'bg-gray-50' },
  inprogress: { label: 'En cours', icon: Clock, color: 'text-blue-500', bg: 'bg-blue-50' },
  done: { label: 'Terminé', icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50' },
}

function TaskItem({ task, phaseId, onStatusChange, onGuideClick, onNoteEdit }) {
  const [showNote, setShowNote] = useState(false)
  const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.todo
  const Icon = cfg.icon
  const guide = task.guideId ? GUIDES.find(g => g.id === task.guideId) : null

  const cycleStatus = () => {
    const next = task.status === 'todo' ? 'inprogress' : task.status === 'inprogress' ? 'done' : 'todo'
    onStatusChange(phaseId, task.id, next)
  }

  return (
    <div className={`rounded-xl border transition-colors ${task.status === 'done' ? 'border-green-100 bg-green-50' : 'border-gray-100 bg-white'}`}>
      <div className="flex items-center gap-3 p-3">
        <button onClick={cycleStatus} className="flex-shrink-0 p-1 -m-1 active:scale-90 transition-transform">
          <Icon size={22} className={cfg.color} />
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium leading-snug ${task.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
            {task.title}
          </p>
          {task.durationDays > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">
              {task.durationDays} jour{task.durationDays > 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowNote(s => !s)}
            className={`p-1.5 rounded-lg transition-colors ${task.notes ? 'text-amber-500 bg-amber-50' : 'text-gray-300 active:bg-gray-100'}`}
          >
            <StickyNote size={16} />
          </button>
          {guide && (
            <button
              onClick={() => onGuideClick(task.guideId)}
              className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium active:bg-blue-200 transition-colors"
            >
              <BookOpen size={12} />
              Guide
            </button>
          )}
        </div>
      </div>
      {showNote && (
        <div className="px-3 pb-3">
          <textarea
            className="w-full text-sm bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="Ajouter une note, mesure, référence..."
            rows={3}
            value={task.notes || ''}
            onChange={e => onNoteEdit(phaseId, task.id, e.target.value)}
          />
        </div>
      )}
    </div>
  )
}

function PhaseSection({ phase, projectId, onStatusChange, onGuideClick, onNoteEdit, onAddTask }) {
  const [open, setOpen] = useState(true)
  const done = phase.tasks.filter(t => t.status === 'done').length
  const total = phase.tasks.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className={`rounded-2xl border-2 overflow-hidden ${phase.colorClass || 'bg-white border-gray-100'}`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-xl">{phase.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">{phase.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 bg-white/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 flex-shrink-0">{done}/{total}</span>
          </div>
        </div>
        {open ? <ChevronUp size={18} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={18} className="text-gray-400 flex-shrink-0" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          {phase.tasks.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              phaseId={phase.id}
              onStatusChange={onStatusChange}
              onGuideClick={onGuideClick}
              onNoteEdit={onNoteEdit}
            />
          ))}
          <button
            onClick={() => onAddTask(phase.id)}
            className="w-full flex items-center gap-2 py-2 text-gray-400 text-sm active:text-blue-500 transition-colors justify-center"
          >
            <Plus size={16} />
            Ajouter une tâche
          </button>
        </div>
      )}
    </div>
  )
}

export default function Planning() {
  const { activeProject, dispatch } = useApp()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')

  if (!activeProject) return null

  const handleStatusChange = (phaseId, taskId, status) => {
    dispatch({
      type: 'UPDATE_TASK_STATUS',
      payload: { projectId: activeProject.id, phaseId, taskId, status },
    })
  }

  const handleNoteEdit = (phaseId, taskId, notes) => {
    dispatch({
      type: 'UPDATE_TASK_NOTES',
      payload: { projectId: activeProject.id, phaseId, taskId, notes },
    })
  }

  const handleGuideClick = (guideId) => {
    navigate(`/guides/${guideId}`)
  }

  const handleAddTask = (phaseId) => {
    const title = prompt('Nom de la tâche :')
    if (!title?.trim()) return
    dispatch({
      type: 'ADD_TASK',
      payload: {
        projectId: activeProject.id,
        phaseId,
        task: {
          id: Date.now().toString(),
          title: title.trim(),
          guideId: null,
          durationDays: 1,
          lotId: 'autres',
          status: 'todo',
          notes: '',
          completedAt: null,
        },
      },
    })
  }

  const doneTasks = activeProject.phases.reduce((s, p) => s + p.tasks.filter(t => t.status === 'done').length, 0)
  const totalTasks = activeProject.phases.reduce((s, p) => s + p.tasks.length, 0)

  const filteredPhases = activeProject.phases.map(phase => ({
    ...phase,
    tasks: filter === 'all'
      ? phase.tasks
      : filter === 'todo'
        ? phase.tasks.filter(t => t.status !== 'done')
        : phase.tasks.filter(t => t.status === filter),
  })).filter(phase => phase.tasks.length > 0 || filter === 'all')

  return (
    <div className="pb-24">
      <Header
        title="Planning"
        subtitle={`${doneTasks}/${totalTasks} tâches terminées`}
      />

      {/* Filter bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-2">
        <div className="flex gap-2">
          {[
            { id: 'all', label: 'Tout' },
            { id: 'todo', label: 'À faire' },
            { id: 'inprogress', label: 'En cours' },
            { id: 'done', label: 'Terminé' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                filter === f.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {filteredPhases.map(phase => (
          <PhaseSection
            key={phase.id}
            phase={phase}
            projectId={activeProject.id}
            onStatusChange={handleStatusChange}
            onGuideClick={handleGuideClick}
            onNoteEdit={handleNoteEdit}
            onAddTask={handleAddTask}
          />
        ))}

        {filteredPhases.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <CheckCircle2 size={48} className="mx-auto mb-3 text-green-400" />
            <p className="font-semibold text-gray-600">Aucune tâche ici</p>
            <p className="text-sm mt-1">Changez le filtre pour voir d'autres tâches.</p>
          </div>
        )}
      </div>
    </div>
  )
}
