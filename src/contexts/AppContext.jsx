import { createContext, useContext, useReducer, useEffect } from 'react'
import { PROJECT_TEMPLATES, BUDGET_LOTS } from '../data/templates'

const AppContext = createContext(null)

const initialState = {
  projects: [],
  activeProjectId: null,
}

function buildProjectFromTemplate(config) {
  const template = PROJECT_TEMPLATES[config.type] || PROJECT_TEMPLATES['custom']
  const lots = BUDGET_LOTS.map(lot => ({
    ...lot,
    allocated: 0,
    spent: 0,
  }))

  return {
    id: Date.now().toString(),
    name: config.name,
    type: config.type,
    address: config.address || '',
    totalBudget: parseFloat(config.totalBudget) || 0,
    startDate: config.startDate || new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
    phases: template.phases
      .filter(phase => !config.selectedPhaseIds || config.selectedPhaseIds.includes(phase.id))
      .map(phase => ({
        ...phase,
        tasks: phase.tasks.map(task => ({ ...task })),
      })),
    budget: {
      total: parseFloat(config.totalBudget) || 0,
      lots: lots,
      expenses: [],
    },
    journal: [],
  }
}

function countTasks(project) {
  let total = 0
  let done = 0
  project.phases.forEach(phase => {
    phase.tasks.forEach(task => {
      total++
      if (task.status === 'done') done++
    })
  })
  return { total, done }
}

function reducer(state, action) {
  switch (action.type) {
    case 'LOAD_STATE':
      return action.payload

    case 'CREATE_PROJECT': {
      const project = buildProjectFromTemplate(action.payload)
      return {
        ...state,
        projects: [...state.projects, project],
        activeProjectId: project.id,
      }
    }

    case 'DELETE_PROJECT': {
      const remaining = state.projects.filter(p => p.id !== action.payload)
      return {
        ...state,
        projects: remaining,
        activeProjectId: remaining.length > 0 ? remaining[0].id : null,
      }
    }

    case 'SET_ACTIVE_PROJECT':
      return { ...state, activeProjectId: action.payload }

    case 'UPDATE_TASK_STATUS': {
      const { projectId, phaseId, taskId, status } = action.payload
      return {
        ...state,
        projects: state.projects.map(p => {
          if (p.id !== projectId) return p
          return {
            ...p,
            phases: p.phases.map(phase => {
              if (phase.id !== phaseId) return phase
              return {
                ...phase,
                tasks: phase.tasks.map(task => {
                  if (task.id !== taskId) return task
                  return {
                    ...task,
                    status,
                    completedAt: status === 'done' ? new Date().toISOString() : null,
                  }
                }),
              }
            }),
          }
        }),
      }
    }

    case 'UPDATE_TASK_NOTES': {
      const { projectId, phaseId, taskId, notes } = action.payload
      return {
        ...state,
        projects: state.projects.map(p => {
          if (p.id !== projectId) return p
          return {
            ...p,
            phases: p.phases.map(phase => {
              if (phase.id !== phaseId) return phase
              return {
                ...phase,
                tasks: phase.tasks.map(task => {
                  if (task.id !== taskId) return task
                  return { ...task, notes }
                }),
              }
            }),
          }
        }),
      }
    }

    case 'ADD_TASK': {
      const { projectId, phaseId, task } = action.payload
      return {
        ...state,
        projects: state.projects.map(p => {
          if (p.id !== projectId) return p
          return {
            ...p,
            phases: p.phases.map(phase => {
              if (phase.id !== phaseId) return phase
              return { ...phase, tasks: [...phase.tasks, task] }
            }),
          }
        }),
      }
    }

    case 'ADD_PHASE': {
      const { projectId, phase } = action.payload
      return {
        ...state,
        projects: state.projects.map(p => {
          if (p.id !== projectId) return p
          return { ...p, phases: [...p.phases, phase] }
        }),
      }
    }

    case 'UPDATE_BUDGET_LOT': {
      const { projectId, lotId, field, value } = action.payload
      return {
        ...state,
        projects: state.projects.map(p => {
          if (p.id !== projectId) return p
          return {
            ...p,
            budget: {
              ...p.budget,
              lots: p.budget.lots.map(lot => {
                if (lot.id !== lotId) return lot
                return { ...lot, [field]: parseFloat(value) || 0 }
              }),
            },
          }
        }),
      }
    }

    case 'ADD_EXPENSE': {
      const { projectId, expense } = action.payload
      return {
        ...state,
        projects: state.projects.map(p => {
          if (p.id !== projectId) return p
          const newExpense = { ...expense, id: Date.now().toString(), date: new Date().toISOString() }
          const updatedLots = p.budget.lots.map(lot => {
            if (lot.id !== expense.lotId) return lot
            return { ...lot, spent: lot.spent + parseFloat(expense.amount) }
          })
          return {
            ...p,
            budget: {
              ...p.budget,
              expenses: [...p.budget.expenses, newExpense],
              lots: updatedLots,
            },
          }
        }),
      }
    }

    case 'DELETE_EXPENSE': {
      const { projectId, expenseId } = action.payload
      return {
        ...state,
        projects: state.projects.map(p => {
          if (p.id !== projectId) return p
          const expense = p.budget.expenses.find(e => e.id === expenseId)
          if (!expense) return p
          const updatedLots = p.budget.lots.map(lot => {
            if (lot.id !== expense.lotId) return lot
            return { ...lot, spent: Math.max(0, lot.spent - parseFloat(expense.amount)) }
          })
          return {
            ...p,
            budget: {
              ...p.budget,
              expenses: p.budget.expenses.filter(e => e.id !== expenseId),
              lots: updatedLots,
            },
          }
        }),
      }
    }

    case 'ADD_JOURNAL_ENTRY': {
      const { projectId, entry } = action.payload
      const newEntry = {
        ...entry,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
      }
      return {
        ...state,
        projects: state.projects.map(p => {
          if (p.id !== projectId) return p
          return { ...p, journal: [newEntry, ...p.journal] }
        }),
      }
    }

    case 'DELETE_JOURNAL_ENTRY': {
      const { projectId, entryId } = action.payload
      return {
        ...state,
        projects: state.projects.map(p => {
          if (p.id !== projectId) return p
          return { ...p, journal: p.journal.filter(e => e.id !== entryId) }
        }),
      }
    }

    default:
      return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    const saved = localStorage.getItem('monchantier-state')
    if (saved) {
      try {
        dispatch({ type: 'LOAD_STATE', payload: JSON.parse(saved) })
      } catch {
        // ignore corrupted state
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('monchantier-state', JSON.stringify(state))
  }, [state])

  const activeProject = state.projects.find(p => p.id === state.activeProjectId) || null

  const getProjectProgress = (project) => {
    if (!project) return 0
    const { total, done } = countTasks(project)
    return total === 0 ? 0 : Math.round((done / total) * 100)
  }

  const getTotalSpent = (project) => {
    if (!project) return 0
    return project.budget.lots.reduce((sum, lot) => sum + (lot.spent || 0), 0)
  }

  const getNextTasks = (project, limit = 5) => {
    if (!project) return []
    const tasks = []
    for (const phase of project.phases) {
      for (const task of phase.tasks) {
        if (task.status !== 'done') {
          tasks.push({ ...task, phaseName: phase.name, phaseId: phase.id })
        }
      }
      if (tasks.length >= limit) break
    }
    return tasks.slice(0, limit)
  }

  return (
    <AppContext.Provider value={{ state, dispatch, activeProject, getProjectProgress, getTotalSpent, getNextTasks }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
