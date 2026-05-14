import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db } from '../../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Restaurant, Order, OrderStatus } from '../../types';
import { formatPrice, cn } from '../../lib/utils';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { auth } from '../../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Check, X, Clock, ChefHat, CheckCircle2, Truck, Timer, Bell, BellOff, Search, Phone, User, ChevronDown, ChevronUp, ClipboardList } from 'lucide-react';

interface AdminOrdersProps {
  restaurant: Restaurant;
  readOnly?: boolean;
}

type GroupedOrder = Order & { 
  displayDate: string; 
  isGroup?: boolean; 
  originalOrders?: Order[]; 
};

export default function AdminOrders({ restaurant, readOnly = false }: AdminOrdersProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'flow' | 'customers'>('flow');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationSound, setNotificationSound] = useState('ping');
  const notifiedOrders = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  const sounds = {
    ping: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
    alert: 'https://assets.mixkit.co/active_storage/sfx/1014/1014-preview.mp3',
    chime: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'
  };

  useEffect(() => {
    // Request permission on mount
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        setNotificationsEnabled(true);
      }
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setNotificationsEnabled(true);
    }
  };

  useEffect(() => {
    const q = query(
      collection(db, `restaurants/${restaurant.id}/orders`),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];

      // Check for new orders to notify
      if (!isFirstLoad.current && notificationsEnabled) {
        ordersData.forEach(order => {
          if ((order.status === 'pending') && !notifiedOrders.current.has(order.id)) {
            try {
              new Notification(`Novo Pedido - ${restaurant.name}`, {
                body: `${isNaN(Number(order.tableNumber)) ? order.tableNumber : `Mesa ${order.tableNumber}`}: ${order.items.length} itens • ${formatPrice(order.total)}`,
                icon: restaurant.logoUrl || undefined,
                tag: order.id,
              });
              
              const audio = new Audio((sounds as any)[notificationSound]);
              audio.play().catch(e => console.log('Audio play failed:', e));
            } catch (err) {
              console.error('Notification error:', err);
            }
            notifiedOrders.current.add(order.id);
          }
        });
      }

      // Populate notified set on first load without triggering alerts
      if (isFirstLoad.current) {
        ordersData.forEach(o => notifiedOrders.current.add(o.id));
        isFirstLoad.current = false;
      }

      setOrders(ordersData);
      setLoading(false);
    });

    return unsubscribe;
  }, [restaurant.id, notificationsEnabled, notificationSound]);

  const customerHub = useMemo(() => {
    const hub: { [key: string]: { 
      name: string; 
      phone: string; 
      orderCount: number; 
      totalSpent: number; 
      latestOrder: Order;
      orders: Order[];
    } } = {};

    orders.forEach(order => {
      if (!order.customerPhone && !order.customerName) return;
      
      const key = order.customerPhone || `name-${order.customerName?.toLowerCase()}`;
      if (!hub[key]) {
        hub[key] = {
          name: order.customerName || 'Não Identificado',
          phone: order.customerPhone || '',
          orderCount: 0,
          totalSpent: 0,
          latestOrder: order,
          orders: []
        };
      }

      hub[key].orderCount++;
      hub[key].totalSpent += order.total;
      hub[key].orders.push(order);

      const currentLatest = hub[key].latestOrder.createdAt?.toDate ? hub[key].latestOrder.createdAt.toDate() : new Date(hub[key].latestOrder.createdAt);
      const newOrderDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
      
      if (newOrderDate > currentLatest) {
        hub[key].latestOrder = order;
      }
    });

    return Object.values(hub).sort((a, b) => b.totalSpent - a.totalSpent);
  }, [orders]);

  const groupedOrders = useMemo(() => {
    const groups: { [key: string]: Order[] } = {};
    
    orders.forEach(order => {
      const date = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt || Date.now());
      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
      
      // Group by Date and Table
      const key = `${dateKey}_${order.tableNumber}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(order);
    });

    return Object.entries(groups).map(([key, groupOrders]) => {
      // Find if any order in the group matches the search/filter
      const matchesFilter = groupOrders.some(order => {
        let matchesStatus = filterStatus === 'all' || order.status === filterStatus;
        if (filterStatus === 'delivered') {
          matchesStatus = order.status === 'delivered' || order.status === 'ready';
        }
        
        const searchTerms = searchQuery.toLowerCase();
        const matchesSearch = 
          !searchQuery || 
          (order.customerName?.toLowerCase().includes(searchTerms)) ||
          (order.customerPhone?.toLowerCase().includes(searchTerms)) ||
          (order.id.toLowerCase().includes(searchTerms)) ||
          (order.tableNumber?.toLowerCase().includes(searchTerms)) ||
          (order.items.some(item => item.name.toLowerCase().includes(searchTerms)));
        
        return matchesStatus && matchesSearch;
      });

      if (!matchesFilter) return null;

      // Sort by date desc
      const sortedGroup = [...groupOrders].sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return dateB.getTime() - dateA.getTime();
      });

      const latest = sortedGroup[0];
      const [dateKey] = key.split('_');
      const displayDate = new Date(dateKey + 'T12:00:00').toLocaleDateString('pt-BR');

      return {
        ...latest,
        id: `group-${key}`,
        displayDate,
        isGroup: true,
        items: groupOrders.flatMap(o => o.items),
        total: groupOrders.reduce((sum, o) => sum + o.total, 0),
        status: groupOrders.some(o => o.status === 'pending') ? 'pending' : 
                groupOrders.some(o => o.status === 'preparing') ? 'preparing' : 'delivered',
        originalOrders: groupOrders
      };
    }).filter(Boolean).sort((a, b) => {
      // Sort groups by date desc
      return b.displayDate.localeCompare(a.displayDate);
    }) as GroupedOrder[];
  }, [orders, filterStatus, searchQuery]);

  const updateStatus = async (orderId: string, newStatus: OrderStatus, ordersInGroup?: Order[]) => {
    if (ordersInGroup) {
      for (const order of ordersInGroup) {
        if (order.status !== 'delivered' && order.status !== 'cancelled') {
          const path = `restaurants/${restaurant.id}/orders/${order.id}`;
          try {
            await updateDoc(doc(db, path), { status: newStatus });
          } catch (e) {
            handleFirestoreError(auth, e, OperationType.UPDATE, path);
          }
        }
      }
      return;
    }

    const path = `restaurants/${restaurant.id}/orders/${orderId}`;
    try {
      await updateDoc(doc(db, path), {
        status: newStatus
      });
    } catch (error) {
      handleFirestoreError(auth, error, OperationType.UPDATE, path);
    }
  };

  const getStatusConfig = (status: OrderStatus) => {
    switch (status) {
      case 'pending': return { label: 'Fila', color: 'bg-amber-100 text-amber-700', icon: <Clock className="w-3 h-3" /> };
      case 'preparing': return { label: 'Validado', color: 'bg-indigo-50 text-indigo-600', icon: <ChefHat className="w-3 h-3" /> };
      case 'ready': 
      case 'delivered': return { label: 'Finalizado', color: 'bg-emerald-50 text-emerald-600', icon: <CheckCircle2 className="w-3 h-3" /> };
      case 'cancelled': return { label: 'Estorno', color: 'bg-red-50 text-red-500', icon: <X className="w-3 h-3" /> };
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-24 bg-white rounded-[3rem] border border-slate-100">
      <div className="w-10 h-10 border-4 border-slate-50 border-t-indigo-600 rounded-xl animate-spin mb-6"></div>
      <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.4em]">Escaneando Logística de Pedidos...</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 md:gap-0">
        <div>
          <p className="text-[9px] font-black text-indigo-600 uppercase tracking-[0.4em] mb-1 px-2.5 py-1 bg-indigo-50 inline-block rounded-lg">Cozinha</p>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-black text-slate-900 leading-none tracking-tighter uppercase">Gestão</h1>
            <div className="flex items-center bg-white border border-slate-100 rounded-lg p-0.5 shadow-sm">
              <button
                onClick={requestNotificationPermission}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  notificationsEnabled 
                    ? "bg-indigo-50 text-indigo-600 shadow-sm" 
                    : "text-slate-400 grayscale opacity-50 hover:grayscale-0 hover:opacity-100"
                )}
                title={notificationsEnabled ? "Ativo" : "Off"}
              >
                {notificationsEnabled ? <Bell className="w-4 h-4 fill-indigo-600/10" /> : <BellOff className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
        <div className="bg-slate-950 text-indigo-500 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center space-x-2 shadow-lg">
          <div className="w-1 h-1 rounded-full bg-indigo-500 animate-pulse"></div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Sync</span>
        </div>
      </div>

      {/* Search and Filter Controls */}
      <div className="bg-white rounded-[1.5rem] border border-slate-100 p-4 shadow-sm space-y-4">
        <div className="flex bg-slate-50 p-1 rounded-xl w-fit">
          <button 
            onClick={() => setViewMode('flow')}
            className={cn(
              "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
              viewMode === 'flow' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"
            )}
          >
            Fluxo Geral
          </button>
          <button 
            onClick={() => setViewMode('customers')}
            className={cn(
              "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
              viewMode === 'customers' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"
            )}
          >
            Hub de Clientes
          </button>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input 
              type="text"
              placeholder="PESQUISAR..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-11 pr-4 py-2.5 text-[10px] font-black uppercase tracking-widest focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-600 outline-none transition-all placeholder:text-slate-300"
            />
          </div>
          <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100 overflow-x-auto no-scrollbar">
            {(['all', 'pending', 'preparing', 'delivered', 'cancelled'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-tight transition-all border border-transparent shrink-0",
                  filterStatus === status
                    ? "bg-white text-slate-950 shadow-sm border-slate-100"
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                <div className="flex items-center space-x-1.5">
                  <span>{status === 'all' ? 'TUDO' : getStatusConfig(status as OrderStatus).label}</span>
                  <span className={cn(
                    "px-1 py-0.5 rounded text-[8px] min-w-[1rem] transition-colors",
                    filterStatus === status ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-500"
                  )}>
                    {orders.filter(o => {
                      if (status === 'delivered') return o.status === 'delivered' || o.status === 'ready';
                      return o.status === status;
                    }).length}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <AnimatePresence mode="popLayout">
          {viewMode === 'flow' ? (
            (Object.entries(
              groupedOrders.reduce((acc, order) => {
                if (!acc[order.displayDate]) acc[order.displayDate] = [];
                acc[order.displayDate].push(order);
                return acc;
              }, {} as Record<string, GroupedOrder[]>)
            ) as [string, GroupedOrder[]][]).map(([date, dateOrders]) => (
              <div key={date} className="space-y-3">
                <div className="flex items-center space-x-4 mb-2 mt-4 first:mt-0">
                  <div className="h-[1px] bg-slate-100 flex-1"></div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] px-4 py-1.5 bg-slate-50 rounded-full border border-slate-100">
                    {date}
                  </span>
                  <div className="h-[1px] bg-slate-100 flex-1"></div>
                </div>
                {dateOrders.map((order) => (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={cn(
                      "bg-white rounded-xl border transition-all cursor-pointer relative overflow-hidden",
                      expandedOrderId === order.id ? "border-indigo-200 shadow-lg ring-1 ring-indigo-500/10" : "border-slate-100",
                      order.status === 'pending' && !expandedOrderId && "border-indigo-400 bg-indigo-50/5"
                    )}
                    onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                  >
                    {expandedOrderId === order.id ? (
                      // EXPANDED VIEW
                      <div className="flex flex-col">
                        <div className="p-4 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                          <div className="flex items-center space-x-3">
                            <div className="flex flex-col">
                              <div className="flex items-center space-x-2 mb-0.5">
                                <span className="bg-slate-950 text-white px-2 py-1 rounded-md font-black text-[11px] uppercase tracking-widest leading-none border border-slate-800">
                                  {isNaN(Number(order.tableNumber)) ? order.tableNumber : `U${order.tableNumber}`}
                                </span>
                                <ChevronUp className="w-3.5 h-3.5 text-indigo-600" />
                              </div>
                              <h3 className="font-black text-[9px] text-slate-400 uppercase tracking-widest mt-1">
                                {order.isGroup ? 'Protocolo Agrupado' : `#${order.id.slice(-6).toUpperCase()}`}
                              </h3>
                            </div>
                            {order.isGroup && (
                              <div className="bg-indigo-600 text-white px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter shadow-sm">
                                {order.originalOrders?.length}P
                              </div>
                            )}
                          </div>
                          {!readOnly && order.status !== 'cancelled' && order.status !== 'delivered' && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                updateStatus(order.id, 'cancelled', order.isGroup ? order.originalOrders : undefined);
                              }}
                              className="w-8 h-8 bg-white border border-slate-200 text-slate-300 hover:text-red-500 hover:border-red-100 rounded-lg transition-all flex items-center justify-center group/btn"
                            >
                              <X className="w-4 h-4 group-hover/btn:rotate-90 transition-transform" />
                            </button>
                          )}
                        </div>
                        {/* ... items and other details ... */}
                        <div className="p-4 space-y-4">
                          {order.customerName && (
                            <div className="bg-indigo-600 border border-indigo-500 text-white p-4 rounded-xl flex items-center justify-between shadow-sm">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-1">
                                  <User className="w-3.5 h-3.5 text-indigo-200" />
                                  <p className="text-[9px] font-black uppercase tracking-[0.2em] leading-none text-indigo-100/60">Identidade</p>
                                </div>
                                <p className="text-sm font-black uppercase tracking-tight truncate">{order.customerName}</p>
                                {order.customerPhone && (
                                  <div className="mt-2 flex items-center space-x-2">
                                    <Phone className="w-3.5 h-3.5 text-indigo-200" />
                                    <p className="text-[12px] font-black tracking-widest">{order.customerPhone}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          
                          <div className="space-y-2">
                            <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Compilado de Itens</p>
                              {order.isGroup && <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Histórico</p>}
                            </div>
                            {order.items.map((item, idx) => (
                              <div key={idx} className="flex justify-between items-center text-[12px] font-bold py-2 border-b border-slate-50 last:border-0">
                                <div className="flex items-center space-x-3">
                                  <span className="w-6 h-6 bg-slate-50 flex items-center justify-center rounded-lg text-slate-500 font-black text-[10px] border border-slate-100">{item.quantity}×</span>
                                  <span className="text-slate-900 uppercase tracking-tight font-black">{item.name}</span>
                                </div>
                                <span className="text-slate-600 font-black tracking-tight font-mono">{formatPrice(item.price * item.quantity)}</span>
                              </div>
                            ))}
                          </div>

                          <div className="pt-2">
                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mb-2">
                              <motion.div 
                                 initial={{ width: 0 }}
                                 animate={{ 
                                   width: 
                                     order.status === 'pending' ? '33.33%' :
                                     order.status === 'preparing' ? '66.66%' :
                                     order.status === 'delivered' || order.status === 'ready' ? '100%' : '0%'
                                 }}
                                 className={cn(
                                  "h-full transition-all duration-1000",
                                  order.status === 'cancelled' ? 'bg-red-500' : 'bg-indigo-600'
                                 )}
                              />
                            </div>
                            <div className="flex justify-between text-[10px] font-black uppercase text-slate-300 tracking-[0.2em]">
                              <span>Fila</span>
                              <span>Preparo</span>
                              <span>Fim</span>
                            </div>
                          </div>

                          <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                             <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Subtotal Consolidado</span>
                             <span className="font-black text-xl text-slate-950 tracking-tighter font-mono">{formatPrice(order.total)}</span>
                          </div>

                          <div className="space-y-3 pt-2">
                             <div className={cn(
                               "flex items-center justify-center space-x-2 px-4 py-3.5 rounded-xl text-[11px] font-black uppercase tracking-[0.3em] border shadow-sm",
                               getStatusConfig(order.status).color,
                               order.status === 'delivered' ? 'border-slate-800' : 'border-indigo-100/10'
                             )}>
                               {getStatusConfig(order.status).icon}
                               <span>{order.isGroup && order.status !== 'delivered' ? 'Protocolo Ativo' : getStatusConfig(order.status).label}</span>
                             </div>

                              {!readOnly && (
                                <div className="grid grid-cols-1 gap-2.5">
                                  {order.status === 'pending' && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateStatus(order.id, 'preparing', order.isGroup ? order.originalOrders : undefined);
                                      }}
                                      className="bg-indigo-600 text-white py-4 rounded-xl font-black text-[13px] uppercase tracking-widest flex items-center justify-center space-x-3 shadow-lg"
                                    >
                                      <ChefHat className="w-5 h-5" />
                                      <span>Validar Cozinha</span>
                                    </button>
                                  )}
                                  {order.status === 'preparing' && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateStatus(order.id, 'delivered', order.isGroup ? order.originalOrders : undefined);
                                      }}
                                      className="bg-slate-950 text-white py-4 rounded-xl font-black text-[13px] uppercase tracking-widest flex items-center justify-center space-x-3 shadow-xl"
                                    >
                                      <CheckCircle2 className="w-5 h-5 text-indigo-400" />
                                      <span>Finalizar Fluxo</span>
                                    </button>
                                  )}
                                </div>
                              )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      // COMPACT ROW
                      <div className="flex items-center justify-between p-3 gap-2 overflow-hidden">
                        <div className="flex items-center space-x-2 sm:space-x-4 flex-1 min-w-0">
                          <span className="bg-slate-950 text-white px-1.5 sm:px-2 py-1 rounded-lg font-black text-[9px] sm:text-[10px] uppercase border border-slate-800 shrink-0 shadow-sm">
                            {isNaN(Number(order.tableNumber)) ? order.tableNumber : `U${order.tableNumber}`}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline space-x-2">
                              <p className="text-[11px] sm:text-[12px] font-black uppercase text-slate-900 truncate tracking-tight">
                                {order.customerName || `Hash: #${order.id.slice(-6).toUpperCase()}`}
                              </p>
                              {order.isGroup && (
                                <span className="text-[7px] sm:text-[8px] font-black text-indigo-500 uppercase tracking-tighter shrink-0 bg-indigo-50 px-1 rounded-md">
                                  {order.originalOrders?.length}P
                                </span>
                              )}
                            </div>
                            <p className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-[0.1em] truncate mt-0.5 max-w-full">
                              {order.items.map(i => `${i.quantity}x ${i.name}`).join(' • ')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 sm:space-x-4 shrink-0">
                          <div className={cn(
                            "hidden xs:flex items-center space-x-1 sm:space-x-1.5 px-2 py-1 rounded-lg text-[8px] sm:text-[9px] font-black uppercase tracking-widest border",
                            getStatusConfig(order.status).color,
                            order.status === 'delivered' ? 'border-slate-800' : 'border-indigo-100/5'
                          )}>
                            {getStatusConfig(order.status).icon}
                            <span className="hidden md:inline">{order.isGroup && order.status !== 'delivered' ? 'Ativo' : getStatusConfig(order.status).label}</span>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-xs sm:text-sm text-slate-950 font-mono tracking-tighter">{formatPrice(order.total)}</p>
                          </div>
                          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100 group-hover:bg-indigo-50 group-hover:border-indigo-100 transition-colors">
                            <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-300 group-hover:text-indigo-400" />
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            ))
          ) : (
            customerHub.map((customer, idx) => (
              <motion.div
                key={customer.phone || customer.name + idx}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-2xl border border-slate-100 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 group hover:border-indigo-200 transition-all shadow-sm"
              >
                <div className="flex items-center space-x-5">
                  <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-900 border border-slate-100 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-inner">
                    <User className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-950 uppercase tracking-tight">{customer.name}</h3>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5">
                      <div className="flex items-center space-x-1.5 text-slate-400">
                        <Phone className="w-3 h-3" />
                        <span className="text-[10px] font-black tracking-widest">{customer.phone || 'Sem Registro'}</span>
                      </div>
                      <div className="flex items-center space-x-1.5 text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                        <ClipboardList className="w-3 h-3" />
                        <span className="text-[9px] font-black uppercase tracking-widest">{customer.orderCount} Pedidos</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-8 w-full md:w-auto pt-4 md:pt-0 border-t md:border-t-0 border-slate-50">
                  <div className="flex-1 md:flex-none">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Consumido</p>
                    <p className="text-xl font-black text-slate-950 font-mono tracking-tighter">{formatPrice(customer.totalSpent)}</p>
                  </div>
                  <div className="flex-1 md:flex-none text-right">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Última Visita</p>
                    <p className="text-[11px] font-black text-slate-900 uppercase">
                      {customer.latestOrder.createdAt?.toDate ? customer.latestOrder.createdAt.toDate().toLocaleDateString('pt-BR') : 'Hoje'}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
        
        {((viewMode === 'flow' && groupedOrders.length === 0) || (viewMode === 'customers' && customerHub.length === 0)) && (
          <div className="col-span-full py-12 bg-white rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center">
            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center mb-4">
              <Timer className="w-5 h-5 text-slate-200" />
            </div>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">Aguardando fluxos...</p>
          </div>
        )}
      </div>
    </div>
  );
}
