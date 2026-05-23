import { Routes, Route, Navigate } from 'react-router-dom'
import { useApp } from './contexts/AppContext'
import BottomNav from './components/layout/BottomNav'
import Dashboard from './components/screens/Dashboard'
import Planning from './components/screens/Planning'
import Guides from './components/screens/Guides'
import GuideDetail from './components/screens/GuideDetail'
import Budget from './components/screens/Budget'
import Journal from './components/screens/Journal'
import ProjectSetup from './components/screens/ProjectSetup'

function AppShell() {
  const { state } = useApp()
  const hasProject = state.projects.length > 0

  if (!hasProject) {
    return <ProjectSetup />
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-lg mx-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/planning" element={<Planning />} />
          <Route path="/guides" element={<Guides />} />
          <Route path="/guides/:id" element={<GuideDetail />} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}

export default function App() {
  return <AppShell />
}
