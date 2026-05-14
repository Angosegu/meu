import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { Restaurant } from '../types';
import AdminOrders from './admin/AdminOrders';
import AdminOverview from './admin/AdminOverview';
import { motion, AnimatePresence } from 'motion/react';
import { ChefHat, LogOut, QrCode, ClipboardList, Printer, Copy, Check, BarChart3 } from 'lucide-react';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { QRCodeSVG } from 'qrcode.react';

export default function SellerDashboard() {
  const { slug } = useParams();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'orders' | 'qrcodes' | 'reports'>('orders');
  const [userProfile, setUserProfile] = useState<any>(null);
  
  // QR Code States
  const [tables, setTables] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [showPrintView, setShowPrintView] = useState(false);
  const [printTableId, setPrintTableId] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const restQ = query(collection(db, 'restaurants'), where('slug', '==', slug));
      const restSnapshot = await getDocs(restQ);
      let restId = '';
      if (!restSnapshot.empty) {
        const data = restSnapshot.docs[0].data() as Restaurant;
        restId = restSnapshot.docs[0].id;
        setRestaurant({ id: restId, ...data } as Restaurant);
        setTables(data.tables || []);
      }

      const currentUser = auth.currentUser;
      if (currentUser) {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          setUserProfile(userDoc.data());
        }
      }
      setLoading(false);
    };

    fetchData();
  }, [slug]);

  const handleLogout = () => signOut(auth);

  const canViewReports = userProfile?.role === 'admin' || userProfile?.permissions?.canViewReports;
  const canEditOrders = userProfile?.role === 'admin' || userProfile?.permissions?.canEditOrders;
  const canManageQR = userProfile?.role === 'admin' || userProfile?.permissions?.canManageMenu; // Simplified grouping

  const getMenuUrl = (table?: string) => {
    const baseUrl = `${window.location.origin}/menu/${restaurant?.slug}`;
    return table ? `${baseUrl}?mesa=${table}` : baseUrl;
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

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-50">
      <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest">Sincronizando Terminal Seller...</p>
    </div>
  );

  if (!restaurant) return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-50">
      <h1 className="text-xl font-bold text-slate-900 mb-4">Restaurante não encontrado</h1>
      <Link to="/" className="text-indigo-600 font-bold uppercase text-[10px] tracking-widest">Voltar para Início</Link>
    </div>
  );

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
                  <span className="font-black text-[10px] uppercase tracking-[0.3em] text-slate-950">Nexus Panel</span>
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
            onClick={() => setShowPrintView(false)}
            className="bg-slate-950 text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-2xl"
          >
            Voltar ao Painel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50">
      {/* Top Bar - More compact and surgical */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center space-x-12">
          <div className="flex items-center space-x-3">
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-sm overflow-hidden shrink-0"
              style={{ backgroundColor: userProfile?.storeColor || '#020617' }}
            >
              {userProfile?.storeLogo ? (
                <img src={userProfile.storeLogo} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <ChefHat className="w-5 h-5" />
              )}
            </div>
            <div className="hidden sm:block">
              <p className="text-[8px] font-black uppercase tracking-[0.3em] leading-none mb-1" style={{ color: userProfile?.storeColor || '#4f46e5' }}>
                {userProfile?.storeName || 'Terminal Digital'}
              </p>
              <h1 className="text-[12px] font-black text-slate-900 uppercase tracking-tight leading-none">{restaurant.name}</h1>
            </div>
          </div>

          <nav className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('orders')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === 'orders' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Pedidos</span>
            </button>
            {canViewReports && (
              <button
                onClick={() => setActiveTab('reports')}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === 'reports' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Relatórios</span>
              </button>
            )}
            {canManageQR && (
              <button
                onClick={() => setActiveTab('qrcodes')}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === 'qrcodes' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span className="hidden md:inline">QR</span>
              </button>
            )}
          </nav>
        </div>

        <button 
          onClick={handleLogout}
          className="flex items-center space-x-2 text-slate-400 hover:text-red-500 transition-colors bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="text-[10px] font-black uppercase tracking-widest">Sair</span>
        </button>
      </header>

      <main className="p-6">
        <div className="max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'orders' ? (
              <motion.div
                key="orders"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Fluxo Operacional</h2>
                  <div className="flex items-center space-x-2 px-3 py-1 rounded-full border border-slate-200 bg-white">
                     <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                     <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Live Feedback</span>
                  </div>
                </div>
                <AdminOrders restaurant={restaurant} readOnly={!canEditOrders} />
              </motion.div>
            ) : activeTab === 'reports' ? (
              <motion.div
                key="reports"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <AdminOverview restaurant={restaurant} />
              </motion.div>
            ) : (
              <motion.div
                key="qrcodes"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-8"
              >
                <div className="flex justify-between items-end border-b border-slate-100 pb-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] mb-1" style={{ color: userProfile?.storeColor || '#4f46e5' }}>Identidade de Acesso</p>
                    <h2 className="text-xl font-black text-slate-900 leading-none uppercase tracking-tighter">Topologia de Rede</h2>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                  {/* Universal QR */}
                  <div className="lg:col-span-1 bg-slate-950 p-6 rounded-3xl shadow-xl relative overflow-hidden group">
                    <div className="relative z-10">
                      <div className="bg-white p-4 rounded-2xl mb-6 w-fit mx-auto shadow-sm" style={{ border: `4px solid ${userProfile?.storeColor}20` }}>
                        <QRCodeSVG value={getMenuUrl()} size={140} fgColor="#020617" />
                      </div>
                      <h3 className="text-base font-black text-white text-center mb-1 uppercase tracking-tight">Terminal Alpha</h3>
                      <p className="text-slate-500 text-center text-[9px] font-black uppercase tracking-[0.2em] mb-6">Menu Universal</p>
                      
                      <button 
                        onClick={() => handlePrint(null)}
                        className="w-full text-white py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center space-x-3 transition-all"
                        style={{ backgroundColor: userProfile?.storeColor || '#4f46e5' }}
                      >
                        <Printer className="w-4 h-4" />
                        <span>Imprimir Tudo</span>
                      </button>
                    </div>
                  </div>

                  {/* Tables Grid */}
                  <div className="lg:col-span-3 bg-white p-6 rounded-3xl border border-slate-200">
                    <div className="flex justify-between items-center mb-8 border-b border-slate-50 pb-4">
                      <div>
                        <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Nodos de Atendimento</h3>
                      </div>
                      <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-lg">
                        Total: {tables.length}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                      {tables.map((tableId, i) => {
                        const tableUrl = getMenuUrl(tableId);
                        
                        return (
                          <motion.div
                            key={i}
                            whileHover={{ y: -2 }}
                            className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col items-center group cursor-pointer transition-all hover:bg-white hover:border-indigo-200"
                          >
                            <div className="bg-white p-2 rounded-lg mb-3 border border-slate-200 relative group-hover:shadow-md transition-all">
                              <QRCodeSVG value={tableUrl} size={48} fgColor="#020617" />
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePrint(tableId);
                                }}
                                className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-slate-950 text-white rounded-lg flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity scale-75"
                              >
                                <Printer className="w-3 h-3" />
                              </button>
                            </div>
                            <p className="text-[10px] font-black text-slate-950 uppercase tracking-tighter truncate w-full text-center">{tableId}</p>
                            <button 
                              onClick={() => copyToClipboard(tableUrl, tableId)}
                              className="mt-2 text-[8px] font-black uppercase text-slate-400 hover:text-indigo-600 transition-colors tracking-widest"
                            >
                              {copied === tableId ? 'Check!' : 'Copy'}
                            </button>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

