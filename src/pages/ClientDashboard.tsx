import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, orderBy, onSnapshot, doc, getDoc, collectionGroup } from 'firebase/firestore';
import { Order, UserProfile } from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Package, Clock, CheckCircle2, ArrowLeft, User as UserIcon, LogOut, ChevronRight } from 'lucide-react';
import { signOut } from 'firebase/auth';

export default function ClientDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      navigate('/login');
      return;
    }

    // Fetch profile
    const fetchProfile = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setUserProfile(userDoc.data() as UserProfile);
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      }
    };

    fetchProfile();

    // Fetch orders across all restaurants using collectionGroup
    const q = query(
      collectionGroup(db, 'orders'),
      where('customerEmail', '==', user.email),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Order[]);
      setLoading(false);
    });

    return unsubscribe;
  }, [navigate]);

  const handleLogout = () => signOut(auth).then(() => navigate('/'));

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-100 p-8 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <Link to="/" className="p-2 hover:bg-slate-50 rounded-xl transition-colors">
              <ArrowLeft className="w-5 h-5 text-slate-400" />
            </Link>
            <div>
              <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Área do Cliente</p>
              <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Protocolos de Pedidos</h1>
            </div>
          </div>

          <button onClick={handleLogout} className="flex items-center space-x-2 text-slate-400 hover:text-red-500 transition-colors font-bold text-[10px] uppercase tracking-widest">
            <span>Sair</span>
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="p-8">
        <div className="max-w-4xl mx-auto space-y-10">
          <div className="bg-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                <UserIcon className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">{userProfile?.name || auth.currentUser?.email}</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ID DE ACESSO: {userProfile?.uid.slice(0, 8)}</p>
              </div>
            </div>
            <div className="hidden md:block text-right">
              <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Nexus Digital v1.0</p>
              <p className="text-[8px] font-bold text-indigo-500 uppercase tracking-widest mt-1">Conexão Criptografada</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-2 h-2 rounded-full bg-indigo-600" />
                <h3 className="text-[11px] font-black text-slate-950 uppercase tracking-[0.3em]">Pedidos Recentes</h3>
              </div>
              <Link 
                to="/client/orders" 
                className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:translate-x-1 transition-transform flex items-center space-x-2 bg-indigo-50 px-4 py-2 rounded-xl"
              >
                <span>Ver Todos</span>
                <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="grid gap-4">
              <AnimatePresence mode="popLayout">
                {orders.slice(0, 5).map((order) => (
                  <motion.div
                    key={order.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="group bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-2xl hover:shadow-indigo-500/10 hover:border-indigo-100 transition-all cursor-pointer"
                    onClick={() => navigate(`/order-tracking/${order.id}`)}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex items-start space-x-5">
                        <div className={cn(
                          "w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border transition-colors",
                          order.status === 'delivered' ? "bg-emerald-50 border-emerald-100 text-emerald-500" :
                          order.status === 'cancelled' ? "bg-red-50 border-red-100 text-red-500" :
                          "bg-slate-50 border-slate-100 text-slate-400"
                        )}>
                          {order.status === 'delivered' ? <CheckCircle2 className="w-7 h-7" /> : <Package className="w-7 h-7" />}
                        </div>
                        <div>
                          <div className="flex items-center space-x-3 mb-1">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">PEDIDO #{order.id.slice(-6).toUpperCase()}</p>
                            <span className="w-1 h-1 rounded-full bg-slate-200" />
                            <p className="text-[8px] text-slate-300 font-bold uppercase tracking-widest">
                              {order.createdAt?.toDate ? new Date(order.createdAt.toDate()).toLocaleDateString('pt-BR') : 'Data Indisponível'}
                            </p>
                          </div>
                          <h4 className="font-bold text-slate-950 uppercase text-sm tracking-tight">
                            {order.items.length} Itens • {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total)}
                          </h4>
                          <div className="mt-2 flex flex-wrap gap-2">
                             {order.items.slice(0, 3).map((item, idx) => (
                               <span key={idx} className="text-[8px] bg-slate-50 text-slate-400 px-2 py-0.5 rounded border border-slate-100 font-bold uppercase">
                                 {item.quantity}x {item.name}
                               </span>
                             ))}
                             {order.items.length > 3 && <span className="text-[8px] text-slate-300 font-black">+{order.items.length - 3} MAIS</span>}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between md:justify-end gap-4 p-2 bg-slate-50 md:bg-transparent rounded-2xl md:p-0">
                         <div className={cn(
                           "px-4 py-2 rounded-xl flex items-center space-x-2 border shrink-0",
                           order.status === 'pending' && "bg-amber-50 border-amber-100 text-amber-600",
                           order.status === 'preparing' && "bg-blue-50 border-blue-100 text-blue-600",
                           order.status === 'ready' && "bg-indigo-50 border-indigo-100 text-indigo-600",
                           order.status === 'delivered' && "bg-emerald-50 border-emerald-100 text-emerald-600",
                           order.status === 'cancelled' && "bg-red-50 border-red-100 text-red-600",
                         )}>
                            {order.status === 'pending' || order.status === 'preparing' ? (
                              <Clock className="w-3.5 h-3.5 animate-pulse" />
                            ) : (
                              <div className="w-1.5 h-1.5 rounded-full bg-current" />
                            )}
                            <span className="text-[10px] font-black uppercase tracking-widest">
                               {order.status === 'pending' ? 'Fila' : 
                                order.status === 'preparing' ? 'Validado' :
                                order.status === 'ready' ? 'Finalizado' :
                                order.status === 'delivered' ? 'Finalizado' : 'Estorno'}
                            </span>
                         </div>
                         <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-300 group-hover:text-indigo-600 group-hover:bg-indigo-50 border border-slate-100 transition-all">
                            <ArrowLeft className="w-4 h-4 rotate-180" />
                         </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {orders.length === 0 && (
                <div className="text-center py-32 bg-white rounded-[3rem] border border-dashed border-slate-200">
                  <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-slate-100">
                    <Package className="w-10 h-10 text-slate-200" />
                  </div>
                  <h3 className="text-slate-950 font-black uppercase tracking-widest text-xs mb-2">Sem histórico de atividade</h3>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest max-w-[200px] mx-auto leading-relaxed">Seus pedidos aparecerão aqui assim que forem realizados em um de nossos terminais.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
