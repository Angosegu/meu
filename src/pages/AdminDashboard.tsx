import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Link } from 'react-router-dom';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, limit, onSnapshot, orderBy } from 'firebase/firestore';
import { Restaurant, Category, Product, Order } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutDashboard, ShoppingBag, Menu as MenuIcon, Settings as SettingsIcon, QrCode as QrIcon, Plus, Loader2, Users, X } from 'lucide-react';
import { cn } from '../lib/utils';

// Admin Tabs
import AdminOverview from './admin/AdminOverview';
import AdminOrders from './admin/AdminOrders';
import AdminMenu from './admin/AdminMenu';
import AdminSettings from './admin/AdminSettings';
import AdminUsers from './admin/AdminUsers';

interface AdminDashboardProps {
  user: User;
}

export default function AdminDashboard({ user }: AdminDashboardProps) {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [allRestaurants, setAllRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'menu' | 'users' | 'settings'>('overview');
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isSuspended, setIsSuspended] = useState(false);

  useEffect(() => {
    const initDashboard = async () => {
      const userDocSnapshot = await getDocs(query(collection(db, 'users'), where('uid', '==', user.uid), limit(1)));
      
      if (!userDocSnapshot.empty) {
        const userData = userDocSnapshot.docs[0].data();
        if (userData.status === 'suspended') {
          setIsSuspended(true);
          setLoading(false);
          return;
        }
      }

      const role = !userDocSnapshot.empty ? userDocSnapshot.docs[0].data().role : 'client';
      
      if (role === 'admin') {
        setIsSuperAdmin(true);
        // Admin: Load all restaurants
        const q = query(collection(db, 'restaurants'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const rests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Restaurant));
          setAllRestaurants(rests);
          // Only select first one if none selected
          setRestaurant(prev => {
            if (prev) {
              const updated = rests.find(r => r.id === prev.id);
              return updated || rests[0];
            }
            return rests[0];
          });
          setLoading(false);
        });
        return unsubscribe;
      } else {
        // Seller: Load their specific restaurant
        const q = query(collection(db, 'restaurants'), where('ownerId', '==', user.uid), limit(1));
        const unsubscribe = onSnapshot(q, (snapshot) => {
          if (!snapshot.empty) {
            setRestaurant({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Restaurant);
          }
          setLoading(false);
        });
        return unsubscribe;
      }
    };

    const unsubscribePromise = initDashboard();
    return () => {
      unsubscribePromise.then(unsub => unsub && unsub());
    };
  }, [user.uid]);

  useEffect(() => {
    if (!restaurant) return;

    // Listen for pending orders for notification badge
    const q = query(collection(db, `restaurants/${restaurant.id}/orders`), where('status', 'in', ['pending', 'preparing']));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingOrdersCount(snapshot.size);
    });

    return unsubscribe;
  }, [restaurant]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)]">
      <Loader2 className="animate-spin h-10 w-10 text-indigo-600 mb-4" />
      <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Acessando Terminal...</p>
    </div>
  );

  if (isSuspended) return (
    <div className="flex flex-col items-center justify-center min-h-screen p-10 text-center bg-slate-950">
      <div className="bg-slate-900 p-10 rounded-[3rem] border border-slate-800 max-w-md shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl" />
        <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-indigo-500/5 rounded-full blur-3xl" />
        
        <div className="relative z-10">
          <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-red-500/20">
            <X className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter">Acesso Suspenso</h2>
          <p className="text-sm text-slate-500 font-bold mb-8 uppercase tracking-widest leading-relaxed">
            Seu terminal foi temporariamente desativado. Por favor, regularize sua licença para retomar as operações.
          </p>
          <div className="pt-6 border-t border-slate-800">
            <Link 
              to="/" 
              onClick={() => auth.signOut()}
              className="inline-block bg-white text-slate-950 px-8 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all"
            >
              Sair da Conta
            </Link>
          </div>
        </div>
      </div>
    </div>
  );

  if (!restaurant && !isSuperAdmin) return (
    <div className="flex flex-col items-center justify-center min-h-screen p-10 text-center">
      <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 max-w-md">
        <h2 className="text-xl font-bold text-slate-900 mb-2 uppercase tracking-tighter">Terminal Inativo</h2>
        <p className="text-sm text-slate-500 font-bold mb-6">Você não possui uma unidade vinculada ao seu perfil.</p>
        <Link to="/" className="text-indigo-600 font-black uppercase text-[10px] tracking-widest hover:underline">Voltar para Início</Link>
      </div>
    </div>
  );

  // If no restaurant but super admin, we should only allow the 'users' tab
  const actualTab = (!restaurant && isSuperAdmin) ? 'users' : activeTab;

  const tabs = [
    ...(restaurant ? [
      { id: 'overview', label: 'Monitor', icon: <LayoutDashboard className="w-5 h-5" /> },
      { id: 'orders', label: 'Pedidos', icon: <ShoppingBag className="w-5 h-5" />, badge: pendingOrdersCount },
      { id: 'menu', label: 'Cardápio', icon: <MenuIcon className="w-5 h-5" /> },
    ] : []),
    ...(isSuperAdmin ? [{ id: 'users', label: 'Vendedores', icon: <Users className="w-5 h-5" /> }] : []),
    ...(restaurant ? [
      { id: 'settings', label: 'QR', icon: <QrIcon className="w-5 h-5" /> }
    ] : []),
  ];

  return (
    <div className="flex h-[calc(100vh-128px)] md:h-[calc(100vh-64px)] overflow-hidden bg-white">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-900 p-6 space-y-1.5 border-r border-slate-800 relative">
        <div className="mb-12 px-2">
          <Link to="/" className="flex items-center space-x-2.5 mb-8 group">
            <div className="bg-indigo-600 w-7 h-7 rounded-lg flex items-center justify-center text-[10px] text-white font-black group-hover:rotate-12 transition-transform">ML</div>
            <span className="font-bold text-sm tracking-tight text-white uppercase tracking-[0.2em]">Meu <span className="text-indigo-500 font-extrabold">Lugar</span></span>
          </Link>
          <div className="py-3 px-4 bg-slate-800/50 rounded-xl border border-slate-800">
            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-1">
              {isSuperAdmin ? 'Selecionar Unidade' : 'Terminal ID'}
            </p>
            {isSuperAdmin && allRestaurants.length > 1 ? (
              <select 
                value={restaurant.id}
                onChange={(e) => setRestaurant(allRestaurants.find(r => r.id === e.target.value) || restaurant)}
                className="w-full bg-transparent text-sm font-bold text-white outline-none cursor-pointer appearance-none"
              >
                {allRestaurants.map(r => (
                  <option key={r.id} value={r.id} className="bg-slate-900 text-white">
                    {r.name}
                  </option>
                ))}
              </select>
            ) : (
              <h2 className="text-sm font-bold text-white truncate tracking-tight">{restaurant.name}</h2>
            )}
          </div>
        </div>
        
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex items-center justify-between px-4 py-3.5 rounded-xl transition-all font-bold uppercase tracking-widest text-[11px]",
              actualTab === tab.id 
                ? "bg-indigo-600 text-white shadow-xl shadow-indigo-900/40" 
                : "text-slate-500 hover:bg-slate-800/50 hover:text-slate-300"
            )}
          >
            <div className="flex items-center space-x-3">
              <span className={cn("transition-colors", actualTab === tab.id ? "text-white" : "text-slate-600")}>
                {tab.icon}
              </span>
              <span>{tab.label}</span>
            </div>
            {tab.badge ? (
              <span className={cn(
                "min-w-[18px] h-4.5 px-1.5 rounded-md text-[10px] flex items-center justify-center font-black",
                actualTab === tab.id ? "bg-white text-indigo-600" : "bg-indigo-500 text-white"
              )}>
                {tab.badge}
              </span>
            ) : null}
          </button>
        ))}

        <div className="absolute bottom-8 left-8 right-8 pt-6 border-t border-slate-800/50">
          <div className="flex items-center space-x-2 text-indigo-600 mb-1">
            <div className="w-1 h-1 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em]">Module Verified</span>
          </div>
          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Build 2.4.0-Stable</p>
        </div>
      </aside>

      {/* Content Area */}
      <main className="flex-1 overflow-y-auto bg-white p-4 sm:p-6 md:px-8 lg:px-12 md:py-10 pb-24 md:pb-10 no-scrollbar">
        <AnimatePresence mode="wait">
          <motion.div
            key={actualTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-6xl mx-auto"
          >
            {actualTab === 'overview' && restaurant && <AdminOverview restaurant={restaurant} />}
            {actualTab === 'orders' && restaurant && <AdminOrders restaurant={restaurant} />}
            {actualTab === 'menu' && restaurant && <AdminMenu restaurant={restaurant} />}
            {actualTab === 'users' && <AdminUsers restaurant={restaurant || { id: '', name: 'Master', slug: 'master' } as any} isSuperAdmin={isSuperAdmin} />}
            {actualTab === 'settings' && restaurant && <AdminSettings restaurant={restaurant} />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Nav - Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 px-4 py-3 flex justify-around items-center z-50">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "relative flex flex-col items-center space-y-1 p-2 rounded-xl transition-all",
              actualTab === tab.id ? "text-indigo-500" : "text-slate-500 font-bold"
            )}
          >
            {tab.icon}
            <span className="text-[10px] font-bold uppercase tracking-wider">{tab.label}</span>
            {tab.badge ? (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-500 text-white rounded-lg text-[8px] flex items-center justify-center font-black border-2 border-slate-900">
                {tab.badge}
              </span>
            ) : null}
          </button>
        ))}
      </nav>
    </div>
  );
}
