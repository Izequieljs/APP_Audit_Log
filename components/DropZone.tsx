import React, { useCallback } from 'react';
import { FileData } from '../types';

interface DropZoneProps {
  title: string;
  description: string;
  files: FileData[];
  onFilesAdded: (files: File[]) => void;
  onRemoveFile: (id: string) => void;
  accept?: string;
  icon: React.ReactNode;
  colorClass?: string;
}

export const DropZone: React.FC<DropZoneProps> = ({ 
  title, 
  description, 
  files, 
  onFilesAdded, 
  onRemoveFile, 
  accept = "application/pdf",
  icon,
  colorClass = "text-[#EA580C] bg-orange-50"
}) => {
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesAdded(Array.from(e.dataTransfer.files));
    }
  }, [onFilesAdded]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesAdded(Array.from(e.target.files));
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div 
        className="flex-1 border-2 border-dashed border-slate-200 rounded-2xl m-4 p-8 flex flex-col items-center justify-center transition-all duration-300 hover:border-[#F97316] hover:bg-orange-50/30 cursor-pointer group"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => document.getElementById(`file-input-${title}`)?.click()}
      >
        <input 
          type="file" 
          id={`file-input-${title}`}
          className="hidden" 
          multiple 
          accept={accept}
          onChange={handleChange}
        />
        <div className={`mb-5 p-5 rounded-full transition-transform duration-300 group-hover:scale-110 shadow-sm ${colorClass}`}>
          {icon}
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-2">{title}</h3>
        <p className="text-sm text-slate-500 text-center max-w-sm leading-relaxed">{description}</p>
      </div>

      {/* File List */}
      <div className="px-4 pb-4 overflow-y-auto max-h-[160px] custom-scrollbar">
        {files.length > 0 ? (
          <div className="space-y-2">
            {files.map((file) => (
              <div key={file.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group hover:border-orange-200 transition-colors">
                <div className="flex items-center space-x-3 overflow-hidden">
                  <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold text-slate-700 truncate">{file.name}</span>
                    <span className="text-xs text-slate-400 font-mono">
                       ID: {file.shipmentId || '---'}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); onRemoveFile(file.id); }}
                  className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-all"
                  title="Remover arquivo"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
            ))}
          </div>
        ) : (
            <div className="h-full flex items-center justify-center text-slate-300 text-sm italic py-4">
                Nenhum arquivo selecionado
            </div>
        )}
      </div>
    </div>
  );
};