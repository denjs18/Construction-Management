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
import PlanEditor from './components/screens/PlanEditor'
import Estimate from './components/screens/Estimate'
import View3D from './components/screens/View3D'
import Plumbing from './components/screens/Plumbing'

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
          <Route path="/plan" element={<PlanEditor />} />
          <Route path="/plan/3d" element={<View3D />} />
          <Route path="/plan/plomberie" element={<Plumbing />} />
          <Route path="/chiffrage" element={<Estimate />} />
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
