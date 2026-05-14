import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { db, auth } from '../firebase';
import { query, where, onSnapshot, collectionGroup, orderBy } from 'firebase/firestore';
import { Order } from '../types';
import { cn, formatPrice } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Package, Clock, CheckCircle2, ArrowLeft, Search, Calendar, ChevronRight } from 'lucide-react';

export default function ClientOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      navigate('/login');
      return;
    }

    const q = query(
      collectionGroup(db, 'orders'),
      where('customerEmail', '==', user.email),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Order[]);
      setLoading(false);
    }, (error) => {
      console.error('Error listening to orders:', error);
      setLoading(false);
    });

    return unsubscribe;
  }, [navigate]);

  const filteredOrders = orders.filter(order => 
    order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.items.some(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white border-b border-slate-100 p-6 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <Link to="/dashboard" className="p-2 hover:bg-slate-50 rounded-xl transition-colors">
              <ArrowLeft className="w-5 h-5 text-slate-400" />
            </Link>
            <div>
              <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Protocolos</p>
              <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Histórico Completo</h1>
            </div>
          </div>
          
          <div className="relative flex-1 max-w-xs hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
            <input 
              type="text"
              placeholder="Buscar pedido ou item..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-9 pr-4 py-2 text-xs font-bold focus:border-indigo-600 outline-none transition-all"
            />
          </div>
        </div>
      </header>

      <main className="p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="md:hidden">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input 
                type="text"
                placeholder="Buscar pedido ou item..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-100 rounded-[1.5rem] pl-9 pr-4 py-3 text-xs font-bold focus:border-indigo-600 outline-none transition-all shadow-sm"
              />
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <h3 className="text-[11px] font-black text-slate-950 uppercase tracking-[0.3em]">Todos os Registros ({filteredOrders.length})</h3>
            <div className="flex-grow h-[1px] bg-slate-200" />
          </div>

          <div className="grid gap-4">
            <AnimatePresence mode="popLayout">
              {filteredOrders.map((order) => (
                <motion.div
                  key={order.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="group bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-indigo-500/5 hover:border-indigo-100 transition-all cursor-pointer"
                  onClick={() => navigate(`/order-tracking/${order.id}`)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center space-x-4">
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border transition-colors",
                        order.status === 'delivered' ? "bg-emerald-50 border-emerald-100 text-emerald-500" :
                        order.status === 'cancelled' ? "bg-red-50 border-red-100 text-red-500" :
                        "bg-slate-50 border-slate-100 text-slate-400"
                      )}>
                        {order.status === 'delivered' ? <CheckCircle2 className="w-6 h-6" /> : <Package className="w-6 h-6" />}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">#{order.id.slice(-6).toUpperCase()}</p>
                          <span className="text-[8px] text-slate-200 font-bold">•</span>
                          <p className="text-[8px] text-slate-400 font-bold uppercase">
                            {order.createdAt?.toDate ? new Date(order.createdAt.toDate()).toLocaleDateString('pt-BR') : 'Data n/d'}
                          </p>
                        </div>
                        <h4 className="font-bold text-slate-950 uppercase text-[12px] tracking-tight mt-0.5">
                          {order.items.length} Itens • {formatPrice(order.total)}
                        </h4>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4">
                      <div className={cn(
                        "hidden sm:flex px-3 py-1.5 rounded-lg items-center space-x-1.5 border capitalize text-[9px] font-black tracking-widest",
                        order.status === 'pending' && "bg-amber-50 border-amber-100 text-amber-600",
                        order.status === 'preparing' && "bg-blue-50 border-blue-100 text-blue-600",
                        order.status === 'ready' && "bg-indigo-50 border-indigo-100 text-indigo-600",
                        order.status === 'delivered' && "bg-emerald-50 border-emerald-100 text-emerald-600",
                        order.status === 'cancelled' && "bg-red-50 border-red-100 text-red-600",
                      )}>
                         <span className="uppercase">
                          {order.status === 'pending' ? 'Fila' :
                           order.status === 'preparing' ? 'Validado' :
                           order.status === 'ready' ? 'Finalizado' :
                           order.status === 'delivered' ? 'Finalizado' :
                           order.status === 'cancelled' ? 'Estorno' : order.status}
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                  
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {order.items.map((item, idx) => (
                      <span key={idx} className="text-[7px] bg-slate-50 text-slate-400 px-2 py-0.5 rounded border border-slate-100 font-bold uppercase">
                        {item.quantity}x {item.name}
                      </span>
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {filteredOrders.length === 0 && (
              <div className="text-center py-20 bg-white rounded-[2.5rem] border border-dashed border-slate-100">
                <p className="text-slate-300 font-black uppercase tracking-widest text-[10px]">Nenhum pedido encontrado no histórico.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
