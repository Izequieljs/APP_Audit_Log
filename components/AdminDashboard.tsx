import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

interface HistoryRecord {
  id: number;
  user_id: number;
  user_name: string;
  action: string;
  details: string;
  created_at: string;
}

export const AdminDashboard: React.FC = () => {
  const { token, user } = useAuth();
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'history' | 'summary'>('summary');

  useEffect(() => {
    if (user?.role === 'admin') {
      fetch('/api/history', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        setHistory(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching history:', err);
        setLoading(false);
      });
    }
  }, [token, user]);

  if (user?.role !== 'admin') {
    return <div className="p-8 text-center text-red-600 font-medium">Acesso Negado. Apenas administradores podem ver esta página.</div>;
  }

  const COST_PER_TOKEN_BRL = 0.000001; // Estimativa: R$ 1,00 por 1 milhão de tokens

  const tokenSummary = history.reduce((acc, record) => {
    if (record.action === 'EXTRACTION_END' && record.details.includes('Tokens used:')) {
      const tokensMatch = record.details.match(/Tokens used:\s*(\d+)/);
      if (tokensMatch) {
        const tokens = parseInt(tokensMatch[1], 10);
        const date = new Date(record.created_at).toLocaleDateString('pt-BR');
        const userName = record.user_name;
        const key = `${date}|${userName}`;
        
        if (!acc[key]) {
          acc[key] = { date, user: userName, tokens: 0, cost: 0 };
        }
        acc[key].tokens += tokens;
        acc[key].cost += tokens * COST_PER_TOKEN_BRL;
      }
    }
    return acc;
  }, {} as Record<string, { date: string; user: string; tokens: number; cost: number }>);

  const summaryArray = Object.values(tokenSummary).sort((a, b) => {
    const dateA = a.date.split('/').reverse().join('');
    const dateB = b.date.split('/').reverse().join('');
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    return a.user.localeCompare(b.user);
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Painel Administrativo</h2>
        <div className="flex space-x-2 bg-slate-200 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('summary')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'summary' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Resumo de Tokens
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Histórico Completo
          </button>
        </div>
      </div>
      
      {loading ? (
        <div className="text-center py-10">Carregando...</div>
      ) : activeTab === 'summary' ? (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Data</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Usuário</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Tokens Utilizados</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Custo Estimado</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {summaryArray.map((record, idx) => (
                <tr key={idx}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    {record.date}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                    {record.user}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-[#EA580C] font-semibold">
                    {record.tokens.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-semibold">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(record.cost)}
                  </td>
                </tr>
              ))}
              {summaryArray.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-sm text-slate-500">Nenhum uso de tokens registrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Data/Hora</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Usuário</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Ação</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Detalhes</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Custo Estimado</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {history.map((record) => {
                let cost = null;
                if (record.action === 'EXTRACTION_END' && record.details.includes('Tokens used:')) {
                  const tokensMatch = record.details.match(/Tokens used:\s*(\d+)/);
                  if (tokensMatch) {
                    cost = parseInt(tokensMatch[1], 10) * COST_PER_TOKEN_BRL;
                  }
                }
                return (
                  <tr key={record.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {new Date(record.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                      {record.user_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {record.action}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {record.details}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                      {cost !== null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cost) : '-'}
                    </td>
                  </tr>
                );
              })}
              {history.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-sm text-slate-500">Nenhum histórico encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
