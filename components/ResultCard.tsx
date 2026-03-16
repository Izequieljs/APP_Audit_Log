import React, { useState } from 'react';
import { FileExtractionResult } from '../types';

interface ResultCardProps {
  result: FileExtractionResult;
}

export const ResultCard: React.FC<ResultCardProps> = ({ result }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300 hover:shadow-md hover:border-orange-200">
      <div 
        className="p-5 flex items-center justify-between cursor-pointer bg-white group"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center space-x-4 overflow-hidden">
          <div className="w-12 h-12 rounded-full bg-orange-50 text-[#EA580C] flex items-center justify-center shrink-0 transition-colors group-hover:bg-[#EA580C] group-hover:text-white">
             <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          </div>
          <div className="min-w-0">
            <h4 className="text-base font-bold text-slate-800 truncate pr-4">{result.fileName}</h4>
            <p className="text-sm text-slate-500 flex items-center gap-2">
                <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 text-xs">ID</span>
                {result.shipmentId}
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-6 shrink-0">
            <div className="text-right hidden sm:block">
                <span className="block text-lg font-bold text-[#EA580C]">{result.fields.length}</span>
                <span className="text-xs text-slate-400 uppercase tracking-wide font-medium">Campos</span>
            </div>
            <div className={`transition-transform duration-300 ${expanded ? 'rotate-180 text-[#EA580C]' : 'text-slate-300'} `}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 p-4 animate-in slide-in-from-top-2 duration-200">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100/80 sticky top-0">
                <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-2 pl-3 rounded-l-lg">Campo</th>
                  <th className="py-2 pr-3 rounded-r-lg">Valor Extraído</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.fields.length > 0 ? (
                  result.fields.map((field, idx) => (
                    <tr key={idx} className="hover:bg-white transition-colors">
                      <td className="py-2.5 pl-3 font-medium text-slate-700">{field.key}</td>
                      <td className="py-2.5 pr-3 text-slate-600 font-mono text-xs md:text-sm break-all">{field.value}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} className="py-6 text-center text-slate-400 italic">
                      Nenhum campo identificado automaticamente.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};