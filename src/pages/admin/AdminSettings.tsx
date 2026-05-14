import React, { useState, useEffect } from 'react';
import { Restaurant } from '../../types';
import { db, auth } from '../../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, Download, Printer, Copy, Check, Plus, Trash2, Hash, Type, Save, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

interface AdminSettingsProps {
  restaurant: Restaurant;
}

export default function AdminSettings({ restaurant }: AdminSettingsProps) {
  const [tables, setTables] = useState<string[]>(restaurant.tables || Array.from({ length: 10 }, (_, i) => (i + 1).toString().padStart(2, '0')));
  const [newTableName, setNewTableName] = useState('');
  const [autoRange, setAutoRange] = useState(5);
  const [copied, setCopied] = useState<string | null>(null);
  const [showPrintView, setShowPrintView] = useState(false);
  const [printTableId, setPrintTableId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeMode, setActiveMode] = useState<'manual' | 'auto'>('manual');

  const getMenuUrl = (table?: string) => {
    const baseUrl = `${window.location.origin}/menu/${restaurant.slug}`;
    return table ? `${baseUrl}?mesa=${encodeURIComponent(table)}` : baseUrl;
  };

  const handleAddManual = () => {
    if (!newTableName) return;
    if (tables.includes(newTableName)) return;
    setTables([...tables, newTableName]);
    setNewTableName('');
  };

  const handleAddAuto = () => {
    const startNum = tables.length > 0 ? Math.max(...tables.map(t => parseInt(t) || 0)) + 1 : 1;
    const newOnes = Array.from({ length: autoRange }, (_, i) => (startNum + i).toString().padStart(2, '0'));
    setTables([...tables, ...newOnes]);
  };

  const handleRemoveTable = (tableName: string) => {
    setTables(tables.filter(t => t !== tableName));
  };

  const handleSave = async () => {
    setIsSaving(true);
    const path = `restaurants/${restaurant.id}`;
    try {
      await updateDoc(doc(db, 'restaurants', restaurant.id), {
        tables: tables
      });
    } catch (error) {
      handleFirestoreError(auth, error, OperationType.UPDATE, path);
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handlePrint = (tableId: string | null = null) => {
    setPrintTableId(tableId);
    setShowPrintView(true);
    setTimeout(() => {
      window.print();
    }, 500);
  };

  if (showPrintView) {
    const tablesToPrint = printTableId ? [printTableId] : tables;
    return (
      <div className="fixed inset-0 bg-white z-[200] p-10 overflow-auto">
        <div className="max-w-4xl mx-auto grid grid-cols-2 gap-10">
          {tablesToPrint.map((tableId, i) => {
            const tableUrl = getMenuUrl(tableId);
            return (
              <div key={i} className="border-2 border-slate-900 p-8 rounded-[2rem] flex flex-col items-center justify-center text-center page-break-inside-avoid shadow-sm">
                <div className="mb-6 flex items-center space-x-3">
                  <div className="bg-slate-950 w-6 h-6 rounded flex items-center justify-center text-[10px] text-white font-black">N</div>
                  <span className="font-black text-[10px] uppercase tracking-[0.3em] text-slate-950">Nexus Admin</span>
                </div>
                <div className="bg-white p-4 border border-slate-100 rounded-2xl mb-6 shadow-inner">
                  <QRCodeSVG value={tableUrl} size={180} fgColor="#020617" />
                </div>
                <h2 className="text-2xl font-black text-slate-950 uppercase tracking-tighter mb-2">{tableId}</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">{restaurant.name}</p>
                <div className="text-[8px] font-mono text-slate-300 break-all max-w-[200px]">{tableUrl}</div>
              </div>
            );
          })}
        </div>
        <div className="fixed bottom-10 right-10 print:hidden flex space-x-4">
          <button 
            onClick={() => {
              setShowPrintView(false);
              setPrintTableId(null);
            }}
            className="bg-slate-950 text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-2xl"
          >
            Voltar ao Painel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-100">
        <div>
          <p className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.4em] mb-2 px-3 py-1 bg-indigo-50 inline-block rounded-lg">Identidade de Acesso</p>
          <h1 className="text-4xl font-black text-slate-900 leading-none uppercase tracking-tighter">QR & Localidades</h1>
        </div>
        <div className="flex items-center space-x-4">
           {restaurant.tables !== tables && (
             <button
               onClick={handleSave}
               disabled={isSaving}
               className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-[11px] tracking-widest flex items-center space-x-3 shadow-2xl shadow-indigo-900/20 hover:bg-slate-950 transition-all disabled:opacity-50 active:scale-95"
             >
               {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
               <span>Salvar Arquitetura</span>
             </button>
           )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-slate-950 p-8 rounded-3xl shadow-xl relative overflow-hidden group">
            <div className="relative z-10 text-center">
               <div className="bg-white p-4 rounded-2xl mb-8 w-fit mx-auto shadow-sm" style={{ border: `4px solid #6366f120` }}>
                  <QRCodeSVG value={getMenuUrl()} size={160} fgColor="#020617" />
               </div>
               <h3 className="text-xl font-black text-white mb-1 uppercase tracking-tight">Terminal Alpha</h3>
               <p className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] mb-8">Menu Universal Ativo</p>
               
               <div className="bg-white/5 border border-white/10 p-3 rounded-xl flex items-center justify-between mb-8 backdrop-blur-sm group/url">
                  <p className="text-[9px] font-mono font-medium text-indigo-400 truncate mr-4">{getMenuUrl()}</p>
                  <button 
                    onClick={() => copyToClipboard(getMenuUrl(), 'main')}
                    className="bg-indigo-600 text-white p-2.5 rounded-lg hover:bg-white hover:text-indigo-600 transition-all active:scale-95 shadow-lg"
                  >
                    {copied === 'main' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" /> }
                  </button>
               </div>

               <button 
                  onClick={() => handlePrint(null)}
                  className="w-full bg-white text-slate-950 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center space-x-3 hover:bg-indigo-50 transition-all shadow-xl active:scale-95"
               >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Painel</span>
               </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl space-y-5">
            <div className="flex items-center space-x-2 mb-1">
              <Plus className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-black text-slate-950 uppercase tracking-tight">Expandir Rede</h3>
            </div>
            
            <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
               <button 
                 onClick={() => setActiveMode('manual')}
                 className={cn(
                   "flex-1 py-2 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all",
                   activeMode === 'manual' ? "bg-white text-slate-950 shadow-sm" : "text-slate-400"
                 )}
               >
                 Individual
               </button>
               <button 
                 onClick={() => setActiveMode('auto')}
                 className={cn(
                   "flex-1 py-2 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all",
                   activeMode === 'auto' ? "bg-white text-slate-950 shadow-sm" : "text-slate-400"
                 )}
               >
                 Em Lote
               </button>
            </div>

            <div className="pt-1">
              {activeMode === 'manual' ? (
                <div className="space-y-3">
                  <input 
                    type="text" 
                    value={newTableName}
                    onChange={(e) => setNewTableName(e.target.value)}
                    placeholder="ID: Mesa 01"
                    className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:border-indigo-600 outline-none transition-all font-bold text-[10px] uppercase tracking-widest"
                  />
                  <button 
                    onClick={handleAddManual}
                    className="w-full bg-slate-900 text-white py-3.5 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all"
                  >
                    Adicionar Nodo
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <input 
                    type="number" 
                    value={autoRange}
                    onChange={(e) => setAutoRange(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:border-indigo-600 outline-none transition-all font-bold text-[10px]"
                  />
                  <button 
                    onClick={handleAddAuto}
                    className="w-full bg-indigo-600 text-white py-3.5 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all"
                  >
                    Gerar Sequência
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-6">
           <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl">
              <div className="flex justify-between items-center mb-8 border-b border-slate-50 pb-6">
                 <div>
                   <h3 className="text-lg font-black text-slate-950 uppercase tracking-tight">Arquitetura de Atendimento</h3>
                   <div className="flex items-center space-x-2 mt-1">
                     <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                     <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{tables.length} Nodos Ativos</p>
                   </div>
                 </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-4">
                 <AnimatePresence mode="popLayout">
                    {tables.map((tableId) => {
                       const tableUrl = getMenuUrl(tableId);
                       return (
                          <motion.div
                            key={tableId}
                            layout
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="bg-slate-50/50 p-3 rounded-2xl border border-slate-100 flex flex-col items-center group relative hover:border-indigo-200 hover:bg-white hover:shadow-xl transition-all duration-300"
                          >
                             <button
                               onClick={() => handleRemoveTable(tableId)}
                               className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-white text-slate-300 hover:text-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md border border-slate-50"
                             >
                               <X className="w-3 h-3" />
                             </button>
                             <div className="bg-white p-2 rounded-lg mb-3 border border-slate-100 shadow-sm relative">
                                <QRCodeSVG value={tableUrl} size={64} fgColor="#020617" />
                                <button 
                                   onClick={() => handlePrint(tableId)}
                                   className="absolute -top-1 -right-1 w-5 h-5 bg-slate-950 text-white rounded-lg flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                   <Printer className="w-2.5 h-2.5" />
                                </button>
                             </div>
                             <div className="text-center w-full">
                                <p className="text-[9px] font-black text-slate-950 uppercase tracking-tighter mb-0.5 truncate">{tableId}</p>
                                <button 
                                   onClick={() => copyToClipboard(tableUrl, tableId)}
                                   className="text-[7px] font-black uppercase text-indigo-500 hover:text-indigo-700 tracking-[0.2em] w-full"
                                >
                                   {copied === tableId ? 'SINC' : 'COPY'}
                                </button>
                             </div>
                          </motion.div>
                       );
                    })}
                 </AnimatePresence>

                 {tables.length === 0 && (
                   <div className="col-span-full py-20 text-center">
                      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Sem localizações configuradas.</p>
                   </div>
                 )}
              </div>
           </div>

           <div className="bg-slate-950 p-6 rounded-[2rem] flex items-start space-x-4 border border-slate-800">
              <div className="bg-white/10 p-3 rounded-xl">
                 <QrCode className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                 <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Manual de Operação</h4>
                 <p className="text-slate-500 text-[9px] font-bold leading-relaxed mt-2 uppercase tracking-tight">
                    Os QR gerados são sincronizados em tempo real com as mesas. Ao salvar as alterações, a topologia de rede é atualizada para todos os terminais ativos.
                 </p>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
