import { useState } from 'react'
import { useApp } from '../../contexts/AppContext'
import { Plus, Trash2, TrendingUp, AlertCircle } from 'lucide-react'
import Header from '../layout/Header'
import { BUDGET_LOTS } from '../../data/templates'

function LotRow({ lot, onUpdate }) {
  const pct = lot.allocated > 0 ? Math.min(Math.round((lot.spent / lot.allocated) * 100), 100) : 0
  const over = lot.allocated > 0 && lot.spent > lot.allocated

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: lot.color }} />
        <p className="font-semibold text-sm text-gray-900 flex-1">{lot.label}</p>
        {over && <AlertCircle size={16} className="text-red-500 flex-shrink-0" />}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Budget alloué (€)</label>
          <input
            type="number"
            value={lot.allocated || ''}
            onChange={e => onUpdate(lot.id, 'allocated', e.target.value)}
            placeholder="0"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Dépensé (€)</label>
          <div className="w-full border border-gray-100 rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-700">
            {lot.spent.toLocaleString('fr-FR')}
          </div>
        </div>
      </div>

      {lot.allocated > 0 && (
        <>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${over ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-green-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs">
            <span className={over ? 'text-red-600 font-semibold' : 'text-gray-400'}>
              {over ? `Dépassement : ${(lot.spent - lot.allocated).toLocaleString('fr-FR')} €` : `Reste : ${(lot.allocated - lot.spent).toLocaleString('fr-FR')} €`}
            </span>
            <span className="text-gray-400">{pct}%</span>
          </div>
        </>
      )}
    </div>
  )
}

export default function Budget() {
  const { activeProject, dispatch } = useApp()
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [expenseForm, setExpenseForm] = useState({ description: '', amount: '', lotId: BUDGET_LOTS[0].id })
  const [activeTab, setActiveTab] = useState('lots')

  if (!activeProject) return null

  const budget = activeProject.budget
  const totalAllocated = budget.lots.reduce((s, l) => s + (l.allocated || 0), 0)
  const totalSpent = budget.lots.reduce((s, l) => s + (l.spent || 0), 0)
  const totalBudget = activeProject.budget.total || 0
  const remainingBudget = totalBudget - totalSpent

  const handleUpdateLot = (lotId, field, value) => {
    dispatch({
      type: 'UPDATE_BUDGET_LOT',
      payload: { projectId: activeProject.id, lotId, field, value },
    })
  }

  const handleAddExpense = () => {
    if (!expenseForm.description.trim() || !expenseForm.amount) return
    dispatch({
      type: 'ADD_EXPENSE',
      payload: {
        projectId: activeProject.id,
        expense: {
          description: expenseForm.description.trim(),
          amount: parseFloat(expenseForm.amount),
          lotId: expenseForm.lotId,
        },
      },
    })
    setExpenseForm({ description: '', amount: '', lotId: BUDGET_LOTS[0].id })
    setShowAddExpense(false)
  }

  const handleDeleteExpense = (expenseId) => {
    if (!confirm('Supprimer cette dépense ?')) return
    dispatch({ type: 'DELETE_EXPENSE', payload: { projectId: activeProject.id, expenseId } })
  }

  return (
    <div className="pb-24">
      <Header title="Budget" subtitle={activeProject.name} />

      {/* Summary */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white px-5 py-5">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center">
            <p className="text-blue-200 text-xs mb-0.5">Budget total</p>
            <p className="font-bold text-lg">{totalBudget > 0 ? totalBudget.toLocaleString('fr-FR') + '€' : '—'}</p>
          </div>
          <div className="text-center border-x border-white/20">
            <p className="text-blue-200 text-xs mb-0.5">Dépensé</p>
            <p className="font-bold text-lg">{totalSpent.toLocaleString('fr-FR')}€</p>
          </div>
          <div className="text-center">
            <p className="text-blue-200 text-xs mb-0.5">Restant</p>
            <p className={`font-bold text-lg ${remainingBudget < 0 ? 'text-red-300' : ''}`}>
              {totalBudget > 0 ? remainingBudget.toLocaleString('fr-FR') + '€' : '—'}
            </p>
          </div>
        </div>
        {totalBudget > 0 && (
          <div className="h-3 bg-white/20 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${totalSpent / totalBudget > 0.9 ? 'bg-red-400' : totalSpent / totalBudget > 0.7 ? 'bg-amber-400' : 'bg-green-400'}`}
              style={{ width: `${Math.min((totalSpent / totalBudget) * 100, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 px-4 py-2">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('lots')}
            className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-colors ${activeTab === 'lots' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            Par lot
          </button>
          <button
            onClick={() => setActiveTab('expenses')}
            className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-colors ${activeTab === 'expenses' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            Dépenses ({budget.expenses.length})
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {activeTab === 'lots' && (
          <>
            {budget.lots.map(lot => (
              <LotRow key={lot.id} lot={lot} onUpdate={handleUpdateLot} />
            ))}
            <div className="bg-gray-100 rounded-2xl p-4 flex justify-between items-center">
              <p className="text-sm font-semibold text-gray-700">Total alloué par lot</p>
              <p className="font-bold text-gray-900">{totalAllocated.toLocaleString('fr-FR')} €</p>
            </div>
          </>
        )}

        {activeTab === 'expenses' && (
          <>
            {/* Add expense button */}
            <button
              onClick={() => setShowAddExpense(s => !s)}
              className="w-full btn-primary flex items-center justify-center gap-2"
            >
              <Plus size={18} />
              Ajouter une dépense
            </button>

            {showAddExpense && (
              <div className="card space-y-3">
                <h3 className="font-semibold text-gray-900">Nouvelle dépense</h3>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Description</label>
                  <input
                    type="text"
                    placeholder="Ex: Laine de verre Isover 40m²"
                    value={expenseForm.description}
                    onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Montant (€)</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={expenseForm.amount}
                      onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Lot</label>
                    <select
                      value={expenseForm.lotId}
                      onChange={e => setExpenseForm(f => ({ ...f, lotId: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {BUDGET_LOTS.map(lot => (
                        <option key={lot.id} value={lot.id}>{lot.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAddExpense} className="flex-1 btn-primary py-2.5 text-sm">
                    Ajouter
                  </button>
                  <button onClick={() => setShowAddExpense(false)} className="flex-1 btn-secondary py-2.5 text-sm">
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {budget.expenses.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <TrendingUp size={48} className="mx-auto mb-3 opacity-30" />
                <p className="font-semibold text-gray-600">Aucune dépense</p>
                <p className="text-sm mt-1">Ajoutez vos dépenses pour suivre votre budget.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {[...budget.expenses].reverse().map(expense => {
                  const lot = BUDGET_LOTS.find(l => l.id === expense.lotId)
                  return (
                    <div key={expense.id} className="bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: lot?.color || '#9CA3AF' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{expense.description}</p>
                        <p className="text-xs text-gray-400">
                          {lot?.label} · {new Date(expense.date).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                      <span className="font-semibold text-sm text-gray-900 flex-shrink-0">
                        {parseFloat(expense.amount).toLocaleString('fr-FR')} €
                      </span>
                      <button
                        onClick={() => handleDeleteExpense(expense.id)}
                        className="p-1.5 text-gray-300 active:text-red-500 transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
