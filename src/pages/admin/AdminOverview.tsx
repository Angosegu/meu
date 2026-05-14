import React, { useState, useEffect, useMemo } from 'react';
import { Restaurant, Order } from '../../types';
import { db } from '../../firebase';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { formatPrice, cn } from '../../lib/utils';
import { motion } from 'motion/react';
import { TrendingUp, ShoppingBag, Users, Wallet, Calendar, FileDown, Download, ChevronRight, History, X, ArrowLeft, Clock } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { AnimatePresence } from 'motion/react';

interface AdminOverviewProps {
  restaurant: Restaurant;
}

export default function AdminOverview({ restaurant }: AdminOverviewProps) {
  const [stats, setStats] = useState({
    totalSales: 0,
    ordersCount: 0,
    pendingOrders: 0,
    averageTicket: 0,
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(null);

  const customerGroups = useMemo(() => {
    const groups: { [key: string]: { 
      name: string, 
      phone: string, 
      orders: Order[], 
      totalSpent: number,
      lastOrderDate: any
    } } = {};

    allOrders.forEach(order => {
      const key = order.customerPhone || order.customerName || 'Anonymous-' + order.tableNumber;
      if (!groups[key]) {
        groups[key] = {
          name: order.customerName || `Mesa ${order.tableNumber}`,
          phone: order.customerPhone || '',
          orders: [],
          totalSpent: 0,
          lastOrderDate: order.createdAt
        };
      }
      groups[key].orders.push(order);
      if (order.status === 'delivered') {
        groups[key].totalSpent += order.total;
      }
      
      const currentLast = groups[key].lastOrderDate?.toDate ? groups[key].lastOrderDate.toDate() : new Date(groups[key].lastOrderDate);
      const newDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
      if (newDate > currentLast) {
        groups[key].lastOrderDate = order.createdAt;
      }
    });

    return Object.entries(groups).map(([key, data]) => ({ key, ...data })).sort((a, b) => {
      const dateA = a.lastOrderDate?.toDate ? a.lastOrderDate.toDate() : new Date(a.lastOrderDate);
      const dateB = b.lastOrderDate?.toDate ? b.lastOrderDate.toDate() : new Date(b.lastOrderDate);
      return dateB.getTime() - dateA.getTime();
    });
  }, [allOrders]);

  const selectedCustomer = useMemo(() => 
    customerGroups.find(c => c.key === selectedCustomerKey),
    [customerGroups, selectedCustomerKey]
  );

  useEffect(() => {
    const ordersQ = query(collection(db, `restaurants/${restaurant.id}/orders`), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(ordersQ, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Order[];
      setAllOrders(orders);
      
      const deliveredOrders = orders.filter(o => o.status === 'delivered');
      const totalSales = deliveredOrders.reduce((acc, o) => acc + o.total, 0);
      const ordersCount = deliveredOrders.length;
      
      setStats({
        totalSales,
        ordersCount: orders.length,
        pendingOrders: orders.filter(o => ['pending', 'preparing'].includes(o.status)).length,
        averageTicket: ordersCount > 0 ? totalSales / ordersCount : 0
      });

      setRecentOrders(orders.slice(0, 10));
    });

    return unsubscribe;
  }, [restaurant.id]);

  const getFilteredData = () => {
    const now = new Date();
    const startTime = new Date();
    
    if (period === 'day') startTime.setHours(0, 0, 0, 0);
    else if (period === 'week') startTime.setDate(now.getDate() - 7);
    else if (period === 'month') startTime.setMonth(now.getMonth() - 1);

    return allOrders.filter(o => {
      if (!o.createdAt) return false;
      const orderDate = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
      return orderDate >= startTime && o.status === 'delivered';
    });
  };

  const filteredData = getFilteredData();
  const periodSales = filteredData.reduce((acc, o) => acc + o.total, 0);

  const exportCSV = () => {
    const data = filteredData;
    const headers = ['ID', 'Data', 'Mesa', 'Cliente', 'Total', 'Itens'];
    const rows = data.map(o => [
      o.id,
      o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString() : new Date(o.createdAt).toLocaleString(),
      o.tableNumber,
      o.customerName || 'N/A',
      o.total,
      o.items.map(i => `${i.name} (x${i.quantity})`).join('; ')
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(String).map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_${period}_${restaurant.slug}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const chartData = useMemo(() => {
    const groups: { [key: string]: number } = {};
    filteredData.forEach(o => {
      const date = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
      const key = period === 'day' ? date.getHours() + 'h' : date.toLocaleDateString();
      groups[key] = (groups[key] || 0) + o.total;
    });

    return Object.entries(groups).map(([name, sales]) => ({ name, sales })).sort((a, b) => {
      if (period === 'day') return parseInt(a.name) - parseInt(b.name);
      return new Date(a.name).getTime() - new Date(b.name).getTime();
    });
  }, [filteredData, period]);

  const statCards = [
    { label: 'Receita', value: formatPrice(periodSales), icon: <Wallet className="w-4 h-4" />, color: 'bg-slate-950 border-slate-800 text-white' },
    { label: 'Ticket Médio', value: formatPrice(filteredData.length > 0 ? periodSales / filteredData.length : 0), icon: <TrendingUp className="w-4 h-4" />, color: 'bg-white border-slate-100 text-slate-800 shadow-sm' },
    { label: 'Volume', value: filteredData.length.toString(), icon: <ShoppingBag className="w-4 h-4" />, color: 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-900/10' },
    { label: 'Total', value: stats.ordersCount.toString(), icon: <Calendar className="w-4 h-4" />, color: 'bg-white border-slate-100 text-slate-400 shadow-sm' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 md:gap-0">
        <div>
          <p className="text-[9px] font-black text-indigo-600 uppercase tracking-[0.4em] mb-1.5 px-2.5 py-1 bg-indigo-50 inline-block rounded-lg">Performance</p>
          <h1 className="text-3xl font-black text-slate-900 leading-none tracking-tighter uppercase">Monitor</h1>
        </div>
        <div className="text-left md:text-right">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-0.5">Sincronizado</p>
          <div className="flex items-center md:justify-end space-x-1.5">
            <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((card, i) => (
          <motion.button
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.05 }}
            className={cn(
              "p-3 sm:p-4 rounded-[1.25rem] border transition-all duration-300 text-left w-full group relative overflow-hidden",
              card.color
            )}
          >
            <div className="absolute top-0 right-0 w-16 h-16 bg-white/5 blur-2xl rounded-full -mr-8 -mt-8 group-hover:scale-150 transition-transform duration-700" />
            <div className="flex items-center justify-between mb-3 relative z-10">
              <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shadow-inner",
                  card.color.includes('bg-white') ? 'bg-slate-50 border border-slate-100 text-slate-900' : 'bg-white/10 border border-white/5'
              )}>
                {card.icon}
              </div>
            </div>
            <div className="relative z-10">
              <p className={cn(
                "text-[9px] font-black uppercase tracking-widest mb-0.5",
                card.color.includes('bg-white') ? 'text-slate-400' : 'text-white/50'
              )}>{card.label}</p>
              <h3 className="text-lg font-black tracking-tighter font-mono">{card.value}</h3>
            </div>
          </motion.button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Chart */}
        <motion.div 
          whileHover={{ borderColor: 'rgba(99, 102, 241, 0.2)' }}
          className="lg:col-span-2 bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm group transition-all"
        >
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-3 cursor-pointer group/title">
              <div className="w-1 h-5 bg-indigo-600 rounded-full shadow-lg shadow-indigo-200 group-hover/title:h-8 transition-all" />
              <div>
                <h3 className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-400 leading-none">Fluxo</h3>
                <p className="text-sm font-black text-slate-900 tracking-tighter mt-0.5 uppercase group-hover/title:text-indigo-600 transition-colors">Operação</p>
              </div>
            </div>
            <div className="flex items-center space-x-1.5">
              <select 
                value={period}
                onChange={(e) => setPeriod(e.target.value as any)}
                className="bg-slate-50 border border-slate-100 rounded-lg text-[8px] font-black uppercase tracking-tight px-2 py-1.5 outline-none cursor-pointer text-slate-600 shadow-sm"
              >
                <option value="day">Hoje</option>
                <option value="week">Semana</option>
                <option value="month">Mês</option>
              </select>
              <button
                onClick={exportCSV}
                className="bg-slate-950 text-white p-2 rounded-lg hover:bg-indigo-600 transition-all active:scale-95"
              >
                <Download className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f8fafc" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 8, fontWeight: 900, fill: '#94a3b8', textTransform: 'uppercase' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 8, fontWeight: 900, fill: '#94a3b8' }} 
                />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: '1px solid #f1f5f9', 
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.1)', 
                    fontSize: '9px',
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    padding: '8px 12px'
                  }} 
                />
                <Area type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Recent Protocols (Grouped by Customer) */}
        <div className="bg-slate-950 p-6 rounded-[1.5rem] border border-slate-900 shadow-2xl relative overflow-hidden group">
          <div className="relative z-10 h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-indigo-400">Protocolos</h3>
              <div className="px-2 py-0.5 bg-white/5 rounded-md border border-white/10 text-[7px] font-black text-indigo-500 uppercase tracking-widest animate-pulse">Live</div>
            </div>

            <div className="space-y-2 flex-grow overflow-y-auto max-h-[450px] pr-1 scrollbar-none">
              {customerGroups.map((group) => (
                <button 
                  key={group.key} 
                  onClick={() => setSelectedCustomerKey(group.key)}
                  className="w-full text-left group/item flex items-center justify-between border-b border-white/5 pb-2.5 last:border-0 last:pb-0 hover:bg-white/5 p-1.5 -mx-1.5 rounded-lg transition-all"
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center text-white font-black shadow-sm transition-all group-hover/item:scale-105">
                      <Users className="w-3.5 h-3.5 text-indigo-400" />
                    </div>
                    <div>
                      <p className="font-black text-[10px] text-white uppercase tracking-tight truncate max-w-[120px]">{group.name}</p>
                      <p className="text-[7.5px] font-black text-slate-600 uppercase tracking-widest mt-0.5">{group.orders.length}P</p>
                    </div>
                  </div>
                  <div className="text-right flex items-center space-x-2">
                    <div>
                      <p className="font-black text-[11px] text-white tracking-tighter font-mono">{formatPrice(group.totalSpent)}</p>
                    </div>
                    <ChevronRight className="w-3 h-3 text-slate-800 group-hover/item:text-indigo-400 transition-colors" />
                  </div>
                </button>
              ))}
              
              {customerGroups.length === 0 && (
                <div className="text-center py-24">
                  <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-6 opacity-50">
                    <History className="w-6 h-6 text-slate-700" />
                  </div>
                  <p className="text-slate-600 font-black uppercase tracking-[0.2em] text-[10px]">Escaneando Datastream...</p>
                </div>
              )}
            </div>

            <button 
              onClick={() => setSelectedCustomerKey(customerGroups[0]?.key || null)}
              className="mt-6 w-full py-3 bg-white/5 hover:bg-indigo-600 border border-white/10 rounded-xl text-[9px] font-black text-white uppercase tracking-[0.2em] transition-all shadow-lg"
            >
              Auditoria de Fluxo
            </button>
          </div>
          
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-indigo-600/10 blur-[80px] rounded-full pointer-events-none group-hover:bg-indigo-600/20 transition-all duration-700"></div>

          {/* Customer Detail Overlay */}
          <AnimatePresence>
            {selectedCustomerKey && selectedCustomer && (
              <motion.div 
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute inset-0 z-50 bg-slate-950 p-8 flex flex-col"
              >
                <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/5">
                  <button 
                    onClick={() => setSelectedCustomerKey(null)}
                    className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors flex items-center space-x-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest font-sans">Voltar</span>
                  </button>
                  <div className="px-3 py-1 bg-indigo-600/10 border border-indigo-500/20 rounded-lg text-[8px] font-black text-indigo-400 uppercase tracking-widest">Protocolo Identificado</div>
                </div>

                <div className="flex items-center space-x-5 mb-10">
                  <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-3xl flex items-center justify-center shadow-2xl">
                    <Users className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h4 className="text-2xl font-black text-white uppercase tracking-tighter leading-none">{selectedCustomer.name}</h4>
                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-2">{selectedCustomer.phone || 'Terminal Sincronizado'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-10">
                  <div className="bg-white/5 border border-white/5 p-4 rounded-2xl">
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Volume Negócios</p>
                    <p className="text-lg font-black text-white font-mono">{formatPrice(selectedCustomer.totalSpent)}</p>
                  </div>
                  <div className="bg-white/5 border border-white/5 p-4 rounded-2xl">
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Interações</p>
                    <p className="text-lg font-black text-white font-mono">{selectedCustomer.orders.length}</p>
                  </div>
                </div>

                <div className="flex-grow overflow-y-auto pr-2 scrollbar-none space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 mb-4 sticky top-0 bg-slate-950 py-2">Histórico de Pedidos</h3>
                  {selectedCustomer.orders.map((order) => (
                    <div key={order.id} className="bg-white/5 border border-white/5 p-5 rounded-2xl hover:bg-white/10 transition-colors">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-[10px] font-black text-white uppercase tracking-widest">#{order.id.slice(-6).toUpperCase()}</p>
                          <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                            {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString() : new Date(order.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <span className={cn(
                          "text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border",
                          order.status === 'delivered' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                        )}>
                          {order.status === 'delivered' ? 'Sincronizado' : 'Processando'}
                        </span>
                      </div>
                      <div className="space-y-1 mb-4">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-[10px] text-slate-400 uppercase font-black tracking-tight">
                            <span>{item.quantity}x {item.name}</span>
                            <span>{formatPrice(item.price * item.quantity)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between items-end pt-3 border-t border-white/5 mt-2">
                        <div className="flex items-center space-x-2">
                          <Clock className="w-3 h-3 text-slate-600" />
                          <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Mesa {order.tableNumber}</span>
                        </div>
                        <p className="text-base font-black text-white font-mono">{formatPrice(order.total)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
