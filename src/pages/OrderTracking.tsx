import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { Order, OrderStatus } from '../types';
import { formatPrice, cn } from '../lib/utils';
import { motion } from 'motion/react';
import { Clock, ChefHat, CheckCircle2, Truck, XCircle, ArrowLeft } from 'lucide-react';

export default function OrderTracking() {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const restaurantId = searchParams.get('restaurantId');
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId || !restaurantId) return;

    const unsubscribe = onSnapshot(doc(db, `restaurants/${restaurantId}/orders/${orderId}`), (snapshot) => {
      if (snapshot.exists()) {
        setOrder({ id: snapshot.id, ...snapshot.data() } as Order);
      }
      setLoading(false);
    }, (error) => {
      console.error('Error tracking order:', error);
      setLoading(false);
    });

    return unsubscribe;
  }, [orderId, restaurantId]);

  if (loading) return (
    <div className="flex flex-col justify-center items-center h-screen bg-white">
      <div className="w-10 h-10 border-4 border-slate-50 border-t-indigo-600 rounded-xl animate-spin mb-6 shadow-2xl shadow-indigo-100"></div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Sincronizando Fluxo de Entrega...</p>
    </div>
  );
  if (!order) return <div className="p-20 text-center font-black text-slate-400 uppercase tracking-[0.3em] h-screen flex items-center justify-center bg-white">Protocolo não localizado na rede.</div>;

  const steps = [
    { statuses: ['pending'], label: 'Fila', icon: <Clock className="w-4 h-4" />, description: 'Aguardando Aprovação' },
    { statuses: ['preparing'], label: 'Validado', icon: <ChefHat className="w-4 h-4" />, description: 'Em Preparo na Cozinha' },
    { statuses: ['ready', 'delivered'], label: 'Finalizado', icon: <CheckCircle2 className="w-4 h-4" />, description: 'Pronto para Consumo' },
  ];

  const currentStepIndex = steps.findIndex(s => s.statuses.includes(order.status));
  const isCancelled = order.status === 'cancelled';

  // Use restaurantSlug from order if available, fallback to restaurantId
  const menuSlug = (order as any).restaurantSlug || order.restaurantId;

  return (
    <div className="bg-slate-50 min-h-screen p-8 font-sans">
      <div className="max-w-xl mx-auto">
        <Link to={`/menu/${menuSlug}${order.tableNumber ? `?mesa=${order.tableNumber}` : ''}`} className="inline-flex items-center text-slate-400 font-black text-[10px] uppercase tracking-[0.4em] mb-12 hover:text-slate-950 transition-all group px-4 py-2 bg-white rounded-xl border border-slate-100 shadow-sm">
          <ArrowLeft className="w-3.5 h-3.5 mr-3 transition-transform group-hover:-translate-x-1" />
          Voltar ao Cardápio
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-slate-200/40 border border-slate-100 relative overflow-hidden"
        >
          <div className="text-center mb-16 relative z-10">
            <div className="inline-flex items-center space-x-3 px-4 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 mb-6 group cursor-default">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500"></span>
              </span>
              <span className="text-[9px] font-black text-indigo-600 uppercase tracking-[0.4em]">Pedido em Tempo Real</span>
            </div>
            
            <p className="text-slate-400 text-[8px] font-black uppercase tracking-[0.5em] mb-3">Protocolo: #{order.id.slice(-8).toUpperCase()}</p>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter leading-none mb-6 uppercase">Status do Pedido</h1>
            <div className="inline-flex bg-slate-950 text-white px-5 py-2 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] border border-slate-800 shadow-xl">Local: {order.tableNumber}</div>
          </div>

          {isCancelled ? (
            <div className="bg-red-50 text-red-600 p-12 rounded-[2.5rem] text-center border-2 border-red-100 shadow-2xl shadow-red-100/50">
              <XCircle className="w-20 h-20 mx-auto mb-8 animate-pulse" />
              <h2 className="text-2xl font-black uppercase tracking-tighter">Fluxo Interrompido</h2>
              <p className="font-black text-[10px] opacity-70 mt-3 uppercase tracking-[0.3em]">Protocolo invalidado. Solicite intervenção manual.</p>
            </div>
          ) : (
            <div className="relative py-4 px-2">
              {/* Progress Line */}
              <div className="absolute left-[26px] top-6 bottom-6 w-[3px] bg-slate-100 z-0 rounded-full">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${(Math.max(0, currentStepIndex) / (steps.length - 1)) * 100}%` }}
                  className="w-full bg-indigo-500 origin-top rounded-full shadow-[0_0_12px_rgba(79,70,230,0.5)]"
                  transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>

              {/* Status Steps */}
              <div className="space-y-10 relative z-10 pb-4">
                {steps.map((step, idx) => {
                  const isActive = idx <= currentStepIndex;
                  const isCurrent = idx === currentStepIndex;

                  return (
                    <motion.div
                      key={step.label}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="flex items-start space-x-8 relative"
                    >
                      {/* Anchor point for the line connection */}
                      <div className="flex flex-col items-center">
                        <div className={cn(
                          "w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-700 border-2 shrink-0 relative z-20",
                          isActive 
                            ? 'bg-slate-950 text-indigo-400 border-slate-800 shadow-xl shadow-slate-950/30 scale-105' 
                            : 'bg-white border-slate-100 text-slate-200'
                        )}>
                          {React.cloneElement(step.icon as React.ReactElement, { className: "w-4 h-4" })}
                        </div>
                      </div>

                      <div className="flex-1 pt-0.5">
                        <h3 className={cn(
                          "font-black text-[12px] uppercase tracking-tighter leading-none mb-1",
                          isActive ? 'text-slate-900' : 'text-slate-200'
                        )}>
                          {step.label}
                        </h3>
                        <p className={cn(
                          "text-[8px] font-bold uppercase tracking-widest leading-tight",
                          isActive ? 'text-slate-500' : 'text-slate-200'
                        )}>
                          {step.description}
                        </p>
                        {isCurrent && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center space-x-3 mt-2"
                          >
                            <div className="bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100/50 flex items-center space-x-1.5 shadow-sm">
                              <p className="text-indigo-600 text-[7px] font-black uppercase tracking-[0.2em]">Operação em Curso</p>
                              <div className="flex space-x-1">
                                <motion.div animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 1.5 }} className="w-1 h-1 rounded-full bg-indigo-500" />
                                <motion.div animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.3 }} className="w-1 h-1 rounded-full bg-indigo-500" />
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-20 pt-16 border-t border-slate-50 relative z-10">
            <div className="flex items-center justify-between mb-12">
              <h4 className="font-black text-slate-400 uppercase tracking-[0.4em] text-[10px]">Relatório de Itens</h4>
              <div className="flex-grow h-[1px] bg-slate-50 ml-8"></div>
            </div>
            <div className="space-y-4">
              {order.items.map((item, idx) => (
                <div key={idx} className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 group hover:bg-white hover:shadow-xl hover:shadow-slate-200/50 transition-all">
                  <div className="flex justify-between items-start">
                    <div className="flex items-start space-x-4">
                      <div className="w-10 h-10 bg-white flex items-center justify-center rounded-xl text-[12px] font-black text-indigo-600 border border-slate-100 shadow-sm shrink-0">
                        {item.quantity}x
                      </div>
                      <div>
                        <h5 className="uppercase tracking-tight text-slate-950 font-black text-sm">{item.name}</h5>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                          Preço Unitário: {formatPrice(item.price)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-950 font-black tracking-tighter text-sm">{formatPrice(item.price * item.quantity)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-12 flex justify-between items-center bg-slate-950 p-10 rounded-[2.5rem] border border-slate-800 shadow-2xl relative overflow-hidden group">
              <div className="relative z-10">
                <span className="font-black text-slate-500 uppercase tracking-[0.4em] text-[9px]">Valor Liquidado</span>
                <p className="text-4xl font-black text-white tracking-tighter mt-2">{formatPrice(order.total)}</p>
              </div>
              <CheckCircle2 className="w-32 h-32 text-indigo-600/10 absolute -right-6 -bottom-6 group-hover:scale-110 transition-all duration-1000 rotate-12" />
              <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-600/2 blur-[60px] rounded-full pointer-events-none"></div>
            </div>
          </div>
          
          {/* Decors */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/5 blur-[40px] rounded-full pointer-events-none"></div>
        </motion.div>
      </div>
    </div>
  );
}
