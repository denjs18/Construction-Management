import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Clock, ChevronRight, ShieldCheck, Wrench } from 'lucide-react'
import Header from '../layout/Header'
import { GUIDES, GUIDE_CATEGORIES, DIFFICULTY_CONFIG } from '../../data/guides'

function GuideCard({ guide, onClick }) {
  const diff = DIFFICULTY_CONFIG[guide.difficulty] || DIFFICULTY_CONFIG.intermediaire
  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-2xl shadow-sm p-4 flex items-start gap-3 text-left active:bg-gray-50 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${diff.color}`}>
            {diff.label}
          </span>
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Clock size={11} />
            {guide.duration}
          </span>
          {guide.canDIY && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
              <ShieldCheck size={11} />
              Faisable soi-même
            </span>
          )}
        </div>
        <h3 className="font-semibold text-gray-900 text-sm leading-snug">{guide.title}</h3>
        <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{guide.description}</p>
        <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
          <Wrench size={11} />
          <span>{guide.steps.length} étapes</span>
        </div>
      </div>
      <ChevronRight size={18} className="text-gray-300 flex-shrink-0 mt-1" />
    </button>
  )
}

export default function Guides() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')

  const filtered = GUIDES.filter(g => {
    const matchCat = category === 'all' || g.category === category
    const matchSearch = !search || g.title.toLowerCase().includes(search.toLowerCase()) ||
      g.description.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  return (
    <div className="pb-24">
      <Header title="Guides travaux" subtitle="Étape par étape, avec les bons gestes" />

      {/* Search */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher un guide..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Category filter */}
      <div className="bg-white border-b border-gray-100 px-4 py-2">
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {GUIDE_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                category === cat.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Search size={48} className="mx-auto mb-3 opacity-30" />
            <p className="font-semibold text-gray-600">Aucun guide trouvé</p>
            <p className="text-sm mt-1">Modifiez votre recherche ou filtre.</p>
          </div>
        ) : (
          filtered.map(guide => (
            <GuideCard
              key={guide.id}
              guide={guide}
              onClick={() => navigate(`/guides/${guide.id}`)}
            />
          ))
        )}
      </div>
    </div>
  )
}
