import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, orderBy, addDoc, limit, doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { Restaurant, Category, Product, OrderItem, Order } from '../types';
import { formatPrice, cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingBag, ChevronRight, X, Clock, Plus, Minus, Check, ChefHat, Loader2, Search, QrCode, ClipboardList, Timer, ChevronDown, ChevronUp } from 'lucide-react';

export default function Menu() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const tableNumber = searchParams.get('mesa') || '';
  const navigate = useNavigate();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [filterChefSuggestions, setFilterChefSuggestions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [showMyOrders, setShowMyOrders] = useState(false);

  const chefSuggestions = useMemo(() => {
    // Pick 3 random or most expensive products as suggestions
    return [...products].sort((a, b) => b.price - a.price).slice(0, 3);
  }, [products]);

  const filteredProducts = useMemo(() => {
    let result = products;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.description.toLowerCase().includes(q)
      );
    }
    
    if (filterChefSuggestions) {
      const suggestionIds = chefSuggestions.map(s => s.id);
      result = result.filter(p => suggestionIds.includes(p.id));
    }

    if (activeCategory && activeCategory !== 'suggestions') {
      result = result.filter(p => p.categoryId === activeCategory);
    }
    
    return result;
  }, [products, searchQuery, filterChefSuggestions, chefSuggestions, activeCategory]);
  
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderCreated, setOrderCreated] = useState<string | null>(null);

  // Customer ID Logic
  const [customerInfo, setCustomerInfo] = useState<{ id: string; name: string; phone: string; email: string } | null>(() => {
    const saved = localStorage.getItem('nexus_customer_info');
    if (!saved) return null;
    try {
      const parsed = JSON.parse(saved);
      // Migration: Ensure existing users have an ID and email field
      if (parsed && (parsed.name || parsed.phone) && (!parsed.id || !parsed.email)) {
        if (!parsed.id) parsed.id = Math.random().toString(36).substring(2, 11);
        if (!parsed.email) parsed.email = '';
        localStorage.setItem('nexus_customer_info', JSON.stringify(parsed));
      }
      return parsed;
    } catch (e) {
      return null;
    }
  });
  const [showIdModal, setShowIdModal] = useState(false);
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(false);
  const [tempName, setTempName] = useState('');
  const [tempPhone, setTempPhone] = useState('');
  const [tempEmail, setTempEmail] = useState('');
  const [phoneError, setPhoneError] = useState(false);

  const formatPhone = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');
    
    // Limit to 11 digits
    const limitedDigits = digits.slice(0, 11);
    
    // Apply mask (XX) XXXXX-XXXX or (XX) XXXX-XXXX
    if (limitedDigits.length <= 2) {
      return limitedDigits;
    } else if (limitedDigits.length <= 6) {
      return `(${limitedDigits.slice(0, 2)}) ${limitedDigits.slice(2)}`;
    } else if (limitedDigits.length <= 10) {
      return `(${limitedDigits.slice(0, 2)}) ${limitedDigits.slice(2, 6)}-${limitedDigits.slice(6)}`;
    } else {
      return `(${limitedDigits.slice(0, 2)}) ${limitedDigits.slice(2, 7)}-${limitedDigits.slice(7)}`;
    }
  };

  useEffect(() => {
    // Silent anonymous sign in if not logged in
    if (!auth.currentUser) {
      signInAnonymously(auth).catch(err => console.error('Silent login failed:', err));
    }
  }, []);

  useEffect(() => {
    // Show ID modal if table scanned and not identified OR if table changed
    if (!loading && restaurant && tableNumber) {
      if (!customerInfo) {
        const timer = setTimeout(() => setShowIdModal(true), 1200);
        return () => clearTimeout(timer);
      } else {
        const welcomeShown = sessionStorage.getItem(`nexus_welcome_${tableNumber}`);
        if (!welcomeShown) {
          setShowWelcomeScreen(true);
          sessionStorage.setItem(`nexus_welcome_${tableNumber}`, 'true');
          const timer = setTimeout(() => setShowWelcomeScreen(false), 3500);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [loading, restaurant, customerInfo, tableNumber]);

  const handleIdentify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempPhone || !tempName || !tempEmail) return;
    
    // Normalize phone number: remove non-digits
    const normalizedPhone = tempPhone.replace(/\D/g, '');
    
    // Validation: Brazilian numbers must have 10 (fixed) or 11 (mobile) digits
    if (normalizedPhone.length < 10) {
      setPhoneError(true);
      return;
    }
    
    setPhoneError(false);
    
    // Generate a unique ID if not already present
    const customerId = customerInfo?.id || Math.random().toString(36).substring(2, 11);
    const info = { 
      id: customerId,
      name: tempName, 
      phone: normalizedPhone,
      email: tempEmail
    };

    // Register in the system (Firestore)
    if (restaurant) {
      try {
        const customerRef = doc(db, `restaurants/${restaurant.id}/customers`, customerId);
        await setDoc(customerRef, {
          ...info,
          registeredAt: serverTimestamp(),
          source: 'qr_scan',
          lastTable: tableNumber
        });
      } catch (err) {
        console.error('Error registering customer:', err);
      }
    }

    setCustomerInfo(info);
    localStorage.setItem('nexus_customer_info', JSON.stringify(info));
    setShowIdModal(false);
    
    setShowWelcomeScreen(true);
    if (tableNumber) {
      sessionStorage.setItem(`nexus_welcome_${tableNumber}`, 'true');
    }
    
    setTimeout(() => {
      setShowWelcomeScreen(false);
    }, 3500);
  };

  useEffect(() => {
    if (!restaurant || !customerInfo?.phone) return;

    // Use phone number for history recovery across devices/scans
    const ordersQuery = query(
      collection(db, `restaurants/${restaurant.id}/orders`),
      where('customerPhone', '==', customerInfo.phone),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
      const fetchedOrders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      setMyOrders(fetchedOrders);
    }, (error) => {
      console.error('Error listening to orders:', error);
      // Fallback: If ordering failed (likely missing index), try without ordering
      if (error.message.includes('FAILED_PRECONDITION') || error.message.includes('index')) {
        const simpleQuery = query(
          collection(db, `restaurants/${restaurant.id}/orders`),
          where('customerPhone', '==', customerInfo.phone)
        );
        onSnapshot(simpleQuery, (s) => {
          const orders = s.docs.map(d => ({ id: d.id, ...d.data() })) as Order[];
          setMyOrders(orders.sort((a: any, b: any) => {
             const da = a.createdAt?.seconds || 0;
             const db = b.createdAt?.seconds || 0;
             return db - da;
          }));
        });
      }
    });

    return () => unsubscribe();
  }, [restaurant, customerInfo?.phone]);

  const activeOrdersCount = useMemo(() => {
    return myOrders.filter(o => !['delivered', 'cancelled'].includes(o.status)).length;
  }, [myOrders]);

  const groupedMyOrders = useMemo(() => {
    const groups: { [key: string]: Order[] } = {};
    myOrders.forEach(order => {
      const date = order.createdAt ? new Date((order.createdAt as any).seconds * 1000) : new Date();
      const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      
      // Better date labels
      const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      
      let label = dateStr;
      if (dateStr === today) label = 'Hoje';
      else if (dateStr === yesterday) label = 'Ontem';

      if (!groups[label]) groups[label] = [];
      groups[label].push(order);
    });
    return Object.entries(groups).sort((a, b) => {
      if (a[0] === 'Hoje') return -1;
      if (b[0] === 'Hoje') return 1;
      if (a[0] === 'Ontem') return -1;
      if (b[0] === 'Ontem') return 1;
      return b[0].localeCompare(a[0]);
    });
  }, [myOrders]);

  const [expandedOrders, setExpandedOrders] = useState<string[]>([]);
  const toggleOrderExpand = (orderId: string) => {
    setExpandedOrders(prev => 
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };


  const getItemQuantity = (productId: string) => {
    return cart.find(item => item.productId === productId)?.quantity || 0;
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!slug) return;
      
      let step = 'Initializing';
      try {
        // 1. Get Restaurant
        step = 'Fetching Restaurant Info';
        let restSnap = await getDocs(query(collection(db, 'restaurants'), where('slug', '==', slug), limit(1)));
        
        if (restSnap.empty && slug) {
          // Fallback: try by ID if slug lookup fails
          const restDoc = await getDoc(doc(db, 'restaurants', slug));
          if (restDoc.exists()) {
            setRestaurant({ id: restDoc.id, ...restDoc.data() } as Restaurant);
            const restDocId = restDoc.id;
            
            // Fetch categories and products for this ID
            const [catSnap, prodSnap] = await Promise.all([
              getDocs(query(collection(db, `restaurants/${restDocId}/categories`), orderBy('order', 'asc'))),
              getDocs(query(collection(db, `restaurants/${restDocId}/products`)))
            ]);
            
            const cats = catSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Category[];
            setCategories(cats);
            if (cats.length > 0) setActiveCategory(cats[0].id);
            setProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Product[]);
            
            setLoading(false);
            return;
          }
        }

        if (restSnap.empty) {
          setError(`Restaurante não encontrado (${slug})`);
          setLoading(false);
          return;
        }
        
        const restDoc = restSnap.docs[0];
        const restData = { id: restDoc.id, ...restDoc.data() } as Restaurant;
        setRestaurant(restData);

        // 2. Get Categories
        step = 'Fetching Categories';
        const catQ = query(collection(db, `restaurants/${restDoc.id}/categories`), orderBy('order', 'asc'));
        const catSnap = await getDocs(catQ);
        const cats = catSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Category[];
        setCategories(cats);
        if (cats.length > 0) setActiveCategory(cats[0].id);

        // 3. Get Products
        step = 'Fetching Products';
        const prodQ = query(collection(db, `restaurants/${restDoc.id}/products`));
        const prodSnap = await getDocs(prodQ);
        setProducts(prodSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Product[]);

        setLoading(false);
      } catch (err: any) {
        console.error(`Error fetching menu at step: ${step}`, err);
        setError(`${step}: ${err.message || 'Erro de permissão (403)'}`);
        setLoading(false);
      }
    };

    fetchData();
  }, [slug]);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        return prev.map(item => 
          item.productId === product.id 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      }
      return [...prev, {
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: 1
      }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === productId);
      if (existing && existing.quantity > 1) {
        return prev.map(item => 
          item.productId === productId 
            ? { ...item, quantity: item.quantity - 1 } 
            : item
        );
      }
      return prev.filter(item => item.productId !== productId);
    });
  };

  const cartTotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  }, [cart]);

  const handlePlaceOrder = async () => {
    if (!restaurant || cart.length === 0) return;
    if (!tableNumber) {
      alert('Acesso Restrito: Por favor, informe o número da unidade (Mesa) via QR oficial ou solicite ao atendente.');
      return;
    }
    
    if (!customerInfo) {
      setShowIdModal(true);
      return;
    }

    setIsOrdering(true);
    const orderPath = `restaurants/${restaurant.id}/orders`;
    try {
      const orderData = {
        restaurantId: restaurant.id,
        restaurantSlug: slug, // Added for easier navigation back
        tableNumber,
        items: cart,
        total: cartTotal,
        status: 'pending',
        createdAt: serverTimestamp(),
        customerName: customerInfo.name,
        customerPhone: customerInfo.phone,
        customerEmail: customerInfo.email,
        customerId: customerInfo.id,
      };
      
      const docRef = await addDoc(collection(db, orderPath), orderData);
      setOrderCreated(docRef.id);
      setIsCartOpen(false);
      setCart([]);
      
      // Redirect after a short delay
      setTimeout(() => {
        navigate(`/order-tracking/${docRef.id}?restaurantId=${restaurant.id}&mesa=${tableNumber}`);
      }, 2000);
    } catch (error) {
      handleFirestoreError(auth, error, OperationType.WRITE, orderPath);
    } finally {
      setIsOrdering(false);
    }
  };

  if (loading) return (
    <div className="flex flex-col justify-center items-center h-screen bg-white">
      <div className="w-10 h-10 border-4 border-slate-50 border-t-indigo-600 rounded-xl animate-spin mb-6 shadow-2xl shadow-indigo-100"></div>
      <p className="text-[12px] font-black text-slate-400 uppercase tracking-[0.4em]">Preparando Cardápio Digital...</p>
    </div>
  );

  if (error) return (
    <div className="p-10 text-center font-black text-slate-800 uppercase tracking-[0.2em] bg-white h-screen flex flex-col items-center justify-center">
      <div className="bg-red-50 p-6 rounded-3xl border border-red-100 max-w-sm w-full shadow-2xl shadow-red-100">
        <X className="w-10 h-10 text-red-500 mx-auto mb-4" />
        <h3 className="text-red-900 mb-2 text-sm">Falha na Conexão</h3>
        <p className="text-[9px] text-red-600 mb-4 bg-white/50 p-3 rounded-xl border border-red-100/50 normal-case leading-relaxed">
          {error}
        </p>
        <div className="text-[8px] text-slate-400 mb-6 normal-case">
          Tente abrir o link diretamente no Chrome do seu Android se estiver usando um scanner externo.
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="w-full bg-red-500 text-white py-4 rounded-xl text-[10px] uppercase tracking-[0.3em] font-black shadow-lg shadow-red-500/20 active:scale-95 transition-all"
        >
          Recarregar Cardápio
        </button>
      </div>
    </div>
  );

  if (!restaurant) return <div className="p-20 text-center font-black text-slate-800 uppercase tracking-[0.2em] bg-white h-screen flex flex-col items-center justify-center">Terminal não encontrado.</div>;

  return (
    <div className="bg-slate-50 min-h-screen pb-24 font-sans text-slate-900">
      {/* Identification Modal (Non-blocking browsing) */}
      <AnimatePresence>
        {(!customerInfo && (showIdModal || !!tableNumber && cart.length > 0)) && (
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm relative z-10 shadow-2xl border border-white/10"
            >
              <div className="text-center mb-8">
                <div className="bg-slate-50 w-16 h-16 rounded-[2rem] flex items-center justify-center mx-auto mb-6 border border-slate-100 shadow-inner">
                  <QrCode className="w-6 h-6 text-indigo-600" />
                </div>
                <h2 className="text-2xl font-black text-slate-950 uppercase tracking-tight leading-none mb-3 font-display">Sua Identificação</h2>
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Para entrega na Unidade {tableNumber}</p>
                </div>
              </div>

              <form onSubmit={handleIdentify} className="space-y-6">
                <div className="grid gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[8px] font-black text-slate-400 uppercase tracking-[0.3em] ml-1">Seu Nome (Identificação)</label>
                    <input
                      required
                      type="text"
                      autoFocus
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      placeholder="Ex: Carlos, Maria..."
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-5 py-4 text-sm font-black text-slate-950 placeholder:text-slate-200 outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/5 transition-all shadow-inner"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[8px] font-black text-slate-400 uppercase tracking-[0.3em] ml-1">E-mail (Obrigatório)</label>
                    <input
                      required
                      type="email"
                      value={tempEmail}
                      onChange={(e) => setTempEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-5 py-4 text-sm font-black text-slate-950 placeholder:text-slate-200 outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/5 transition-all shadow-inner"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[8px] font-black text-slate-400 uppercase tracking-[0.3em] ml-1">WhatsApp (Para Rastreio)</label>
                    <input
                      required
                      type="tel"
                      value={tempPhone}
                      onChange={(e) => {
                        const formatted = formatPhone(e.target.value);
                        setTempPhone(formatted);
                        if (phoneError) setPhoneError(false);
                      }}
                      placeholder="(00) 00000-0000"
                      className={cn(
                        "w-full bg-slate-50 border rounded-xl px-5 py-4 text-sm font-black text-slate-950 placeholder:text-slate-200 outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all shadow-inner",
                        phoneError ? "border-red-500 focus:border-red-600" : "border-slate-100 focus:border-indigo-600"
                      )}
                    />
                    <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-1 ml-1">Usado para receber status do seu pedido</p>
                    {phoneError && (
                      <p className="text-[9px] font-black text-red-500 uppercase tracking-tighter ml-1">
                        Informe um número válido (com DDD)
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full bg-slate-950 text-white py-5 rounded-2xl font-black text-[12px] uppercase tracking-[0.4em] hover:bg-slate-900 shadow-xl shadow-slate-950/20 active:scale-[0.98] transition-all flex items-center justify-center group"
                  >
                    <span>Abrir Cardápio Digital</span>
                    <ChevronRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                  {cart.length === 0 && (
                    <button
                      type="button"
                      onClick={() => setShowIdModal(false)}
                      className="w-full mt-4 text-[9px] text-slate-400 font-bold uppercase tracking-widest hover:text-slate-600 transition-colors"
                    >
                      Ver cardápio primeiro
                    </button>
                  )}
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <header className="bg-white/80 backdrop-blur-xl border-b border-slate-100 p-3 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3 shrink-0">
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-50 border border-slate-100">
               {restaurant?.logoUrl ? (
                 <img src={restaurant.logoUrl} alt={restaurant.name} className="w-full h-full object-cover" />
               ) : (
                 <div className="w-full h-full flex items-center justify-center bg-indigo-600">
                    <ChefHat className="w-4 h-4 text-white" />
                 </div>
               )}
            </div>
            <div className="hidden xs:block">
              <h1 className="text-[11px] font-black text-slate-900 uppercase tracking-tight leading-none truncate max-w-[120px]">
                {restaurant?.name}
              </h1>
              <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Terminal Ativo</p>
            </div>
          </div>

          <div className="relative group flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 group-focus-within:text-indigo-600 transition-colors" />
            <input
              type="text"
              placeholder="Pesquisar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50/50 border border-slate-100 rounded-xl py-2 pl-9 pr-4 text-[10px] font-bold uppercase tracking-widest placeholder:text-slate-300 focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all shadow-sm"
            />
          </div>
          
          <div className="flex items-center space-x-2">
            {customerInfo && (
              <button
                onClick={() => setShowMyOrders(true)}
                className="relative bg-slate-950 text-white p-2.5 rounded-xl shadow-lg shadow-slate-950/10 hover:bg-slate-900 transition-all active:scale-95 border border-slate-800"
              >
                <ClipboardList className="w-4 h-4" />
                {activeOrdersCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-indigo-600 text-white text-[8px] font-black w-4.5 h-4.5 flex items-center justify-center rounded-full border-2 border-white shadow-sm animate-bounce">
                    {activeOrdersCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Categories */}
      <div className="sticky top-[61px] z-30 bg-white/60 backdrop-blur-md border-b border-slate-100 overflow-x-auto no-scrollbar py-2 px-4 shadow-sm">
        <div className="flex space-x-1.5 max-w-2xl mx-auto pb-1">
          <button
            onClick={() => {
              setFilterChefSuggestions(!filterChefSuggestions);
              setActiveCategory(filterChefSuggestions ? (categories[0]?.id || null) : 'suggestions');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={cn(
              "whitespace-nowrap px-3 py-1.5 rounded-lg text-[8px] font-black transition-all uppercase tracking-[0.2em] border flex items-center space-x-2",
              filterChefSuggestions 
                ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-900/10 scale-105" 
                : "bg-white text-indigo-400 border-indigo-50 hover:border-indigo-100"
            )}
          >
            <ChefHat className="w-3 h-3" />
            <span>Chef's Choice</span>
          </button>
          
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCategory(cat.id);
                // We don't force reset filterChefSuggestions anymore, 
                // allowing filtering within suggestions if active
              }}
              className={cn(
                "whitespace-nowrap px-3 py-1.5 rounded-lg text-[10px] font-black transition-all uppercase tracking-[0.2em] border",
                activeCategory === cat.id
                  ? "bg-slate-950 text-white border-slate-950 shadow-lg shadow-slate-950/10 scale-105" 
                  : "bg-white text-slate-400 border-slate-50 hover:border-slate-200 hover:text-slate-600"
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Product List */}
      <div className="max-w-2xl mx-auto p-4 space-y-10">
        {filterChefSuggestions && (
          <div className="mb-2 p-6 bg-indigo-600 rounded-[2.5rem] text-white shadow-2xl shadow-indigo-900/20 relative overflow-hidden group mx-2">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10 group-hover:scale-150 transition-transform duration-1000" />
            <div className="relative z-10 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tighter mb-1">Chef's Choice</h2>
                <p className="text-indigo-200 text-[10px] font-black uppercase tracking-widest opacity-80">Seleções exclusivas para você</p>
              </div>
              <button 
                onClick={() => {
                  setFilterChefSuggestions(false);
                  setActiveCategory(categories[0]?.id || null);
                }}
                className="bg-white/10 p-2.5 rounded-2xl hover:bg-white/20 transition-all border border-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
        {searchQuery && filteredProducts.length === 0 && (
          <div className="text-center py-24 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm mx-2">
            <div className="bg-slate-50 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-slate-100">
              <Search className="w-8 h-8 text-slate-200" />
            </div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-2">Sem resultados</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Não encontramos nada para "{searchQuery}"</p>
          </div>
        )}

        {/* Chef's Suggestions Section */}
        {!searchQuery && !filterChefSuggestions && (
          <section id="suggestions" className="scroll-mt-32">
            <div className="flex items-center space-x-4 mb-6">
              <div className="flex flex-col">
                <h2 className="text-xs font-black text-indigo-600 uppercase tracking-[0.2em] font-display flex items-center space-x-2">
                  <ChefHat className="w-3.5 h-3.5" />
                  <span>Chef's Choice</span>
                </h2>
                <div className="w-8 h-0.5 bg-indigo-600 rounded-full mt-1" />
              </div>
              <div className="flex-grow h-[1px] bg-indigo-50"></div>
              <span className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">Recomendado</span>
            </div>
            
            <div className="flex space-x-2 overflow-x-auto no-scrollbar pb-3 -mx-1 px-1">
              <AnimatePresence>
                {chefSuggestions.map((product, idx) => {
                  const available = product.isAvailable !== false;
                  return (
                    <motion.div
                      key={`suggestion-${product.id}`}
                      initial={{ opacity: 0, x: 50, scale: 0.9 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      transition={{ delay: idx * 0.1, type: 'spring', damping: 20 }}
                      whileHover={available ? { y: -5, scale: 1.02 } : {}}
                      className={cn(
                        "min-w-[130px] bg-slate-900 rounded-[1.5rem] p-2.5 relative overflow-hidden group shadow-2xl shadow-indigo-900/20 border border-slate-800 transition-all",
                        !available && "opacity-60 grayscale cursor-not-allowed"
                      )}
                    >
                    <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-500/10 rounded-full blur-2xl" />
                    <div className="relative z-10 flex flex-col items-center text-center">
                      <div className="w-8 h-8 rounded-lg overflow-hidden mb-2 border border-slate-800 shadow-sm">
                        <img src={product.imageUrl || '/placeholder.png'} alt="" className="w-full h-full object-cover" />
                      </div>
                      <h3 className="text-[9px] font-black text-white uppercase tracking-tight mb-0.5 line-clamp-1 w-full">{product.name}</h3>
                      <p className="text-indigo-400 text-[9px] font-black mb-2 font-mono">{formatPrice(product.price)}</p>
                      
                      <div className="w-full">
                         {available ? (
                           <>
                             {getItemQuantity(product.id) > 0 ? (
                              <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg overflow-hidden p-0.5">
                                <button 
                                  onClick={() => removeFromCart(product.id)}
                                  className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-white"
                                >
                                  <Minus className="w-2.5 h-2.5" />
                                </button>
                                <span className="text-[9px] font-black text-white">{getItemQuantity(product.id)}</span>
                                <button 
                                  onClick={() => addToCart(product)}
                                  className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-white"
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                </button>
                              </div>
                             ) : (
                              <button
                                onClick={() => addToCart(product)}
                                className="w-full bg-indigo-600 text-white p-1.5 rounded-lg active:scale-95 transition-all text-[8px] font-black uppercase tracking-widest"
                              >
                                Add
                              </button>
                             )}
                           </>
                         ) : (
                           <span className="text-[8px] font-black text-red-400 uppercase tracking-widest bg-red-400/10 px-1 py-0.5 rounded-md">Offline</span>
                         )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              </AnimatePresence>
            </div>
          </section>
        )}

        {categories.map((category) => {
          const categoryProducts = filteredProducts.filter(p => p.categoryId === category.id);
          if (categoryProducts.length === 0) return null;

          return (
            <section key={category.id} id={category.id} className="scroll-mt-32">
              <div className="flex items-center space-x-4 mb-6">
                <div className="flex flex-col">
                  <h2 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] font-display">
                    {category.name}
                  </h2>
                  <div className="w-8 h-0.5 bg-indigo-600 rounded-full mt-1" />
                </div>
                <div className="flex-grow h-[1px] bg-slate-100"></div>
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{categoryProducts.length} ITENS</span>
              </div>
              <div className="grid gap-4">
                {categoryProducts.map((product, pIdx) => {
                  const quantity = getItemQuantity(product.id);
                  const available = product.isAvailable !== false;
                  return (
                    <motion.div
                      key={product.id}
                      layout
                      initial={{ opacity: 0, y: 15 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: "-50px" }}
                      transition={{ delay: pIdx * 0.05, duration: 0.3 }}
                      className={cn(
                        "bg-white p-3 rounded-[1.5rem] border flex gap-4 transition-all group relative overflow-hidden",
                        filterChefSuggestions ? "py-2 px-3 gap-3" : "p-3 gap-4",
                        quantity > 0 ? "border-indigo-600 shadow-xl shadow-indigo-500/5" : "border-slate-100 hover:border-slate-300",
                        !available && "opacity-60 grayscale cursor-not-allowed bg-slate-50 border-slate-200"
                      )}
                    >
                      <div className={cn(
                        "relative shrink-0 overflow-hidden rounded-xl bg-slate-50 border border-slate-100 shadow-inner transition-all",
                        filterChefSuggestions ? "w-14 h-14" : "w-20 h-20"
                      )}>
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center opacity-20">
                            <ChefHat className="text-slate-950 h-6 w-6" />
                          </div>
                        )}
                        {quantity > 0 && available && (
                          <motion.div 
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute -top-1 -right-1 bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-black border-2 border-white"
                          >
                            {quantity}
                          </motion.div>
                        )}
                        {!available && (
                          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center group-hover:backdrop-blur-[4px] transition-all duration-500">
                            <div className="bg-red-500 text-white text-[7px] font-black px-2 py-1 rounded-md uppercase tracking-[0.2em] shadow-lg shadow-red-500/20 rotate-[-12deg] border border-red-400">
                              Offline
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 flex flex-col justify-between py-0.5">
                        <div className="space-y-0.5">
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex items-center gap-2">
                              <h3 className={cn(
                                "font-black text-slate-950 tracking-tight leading-tight uppercase font-display group-hover:text-indigo-600 transition-colors line-clamp-1",
                                filterChefSuggestions ? "text-[11px]" : "text-[12px]"
                              )}>
                                {product.name}
                              </h3>
                              {!available && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                            </div>
                            <span className={cn(
                              "font-black text-slate-950 tracking-tight shrink-0 font-mono",
                              filterChefSuggestions ? "text-[9px]" : "text-[10px]"
                            )}>
                              {formatPrice(product.price)}
                            </span>
                          </div>
                          <p className={cn(
                            "text-slate-400 font-medium leading-relaxed line-clamp-1 uppercase tracking-wide",
                            filterChefSuggestions ? "text-[9px]" : "text-[10px]"
                          )}>
                            {product.description}
                          </p>
                        </div>
                        <div className={cn(
                          "flex justify-end",
                          filterChefSuggestions ? "mt-1" : "mt-2"
                        )}>
                          <AnimatePresence mode="wait">
                            {!available ? (
                              <motion.div
                                key="unavailable"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="text-[8px] font-black text-red-500 uppercase tracking-widest bg-red-50 border border-red-100 px-3 py-1 rounded-lg flex items-center gap-1.5"
                              >
                                <X className="w-2.5 h-2.5" />
                                <span>Indisponível</span>
                              </motion.div>
                            ) : quantity > 0 ? (
                              <motion.div 
                                key="quantity-controls"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 10 }}
                                className="flex items-center bg-slate-50 rounded-xl border border-slate-100 overflow-hidden"
                              >
                                <button 
                                  onClick={() => removeFromCart(product.id)}
                                  className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all font-black text-lg"
                                >
                                  -
                                </button>
                                <motion.span 
                                  key={quantity}
                                  initial={{ scale: 0.8 }}
                                  animate={{ scale: 1 }}
                                  className="w-8 flex items-center justify-center text-[10px] font-black text-slate-900"
                                >
                                  {quantity}
                                </motion.span>
                                <button 
                                  onClick={() => addToCart(product)}
                                  className="w-10 h-10 flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-700 transition-all font-black text-lg shadow-lg shadow-indigo-100"
                                >
                                  +
                                </button>
                              </motion.div>
                            ) : (
                              <motion.button
                                key="add-button"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                onClick={() => addToCart(product)}
                                className={cn(
                                  "bg-slate-950 text-white rounded-xl flex items-center justify-center space-x-2 hover:bg-indigo-600 shadow-xl shadow-slate-950/5 active:scale-95 transition-all group/btn",
                                  filterChefSuggestions ? "h-8 px-4" : "h-10 px-6"
                                )}
                              >
                                <Plus className={filterChefSuggestions ? "w-3 h-3" : "w-3.5 h-3.5"} />
                                <span className={cn(
                                  "uppercase font-black tracking-widest",
                                  filterChefSuggestions ? "text-[9px]" : "text-[11px]"
                                )}>
                                  Adicionar
                                </span>
                              </motion.button>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Floating Cart Button */}
      <AnimatePresence>
        {cart.length > 0 && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-6 left-0 right-0 px-4 z-40 max-w-xl mx-auto"
          >
            <button
              onClick={() => setIsCartOpen(true)}
              className="w-full bg-slate-950 text-white p-3.5 rounded-2xl shadow-2xl flex items-center justify-between group hover:bg-slate-900 transition-all border border-slate-800"
            >
              <div className="flex items-center space-x-3">
                <div className="bg-indigo-600 p-2 rounded-lg">
                  <ShoppingBag className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="text-left">
                  <p className="text-[9px] text-indigo-400 font-black uppercase tracking-[0.2em]">{cart.reduce((a, b) => a + b.quantity, 0)} Itens</p>
                  <p className="text-[11px] font-black uppercase tracking-tight leading-none mt-0.5">Ver Bandeja</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-sm font-black tracking-tighter">{formatPrice(cartTotal)}</span>
                <div className="w-6 h-6 bg-slate-800 rounded-full flex items-center justify-center group-hover:bg-indigo-600 transition-colors">
                  <ChevronRight className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cart Drawer */}
      <AnimatePresence>
        {isCartOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCartOpen(false)}
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[2rem] z-50 max-h-[85vh] flex flex-col border-t border-slate-100 shadow-2xl"
            >
              <div className="w-10 h-1 bg-slate-100 rounded-full mx-auto mt-4 mb-2"></div>
              
              <div className="px-6 pb-4 pt-2 flex justify-between items-center border-b border-slate-50">
                <div>
                  <h2 className="text-lg font-black uppercase tracking-tight text-slate-950 leading-none">Bandeja de Pedidos</h2>
                  <p className="text-slate-400 text-[8px] font-black uppercase tracking-widest mt-1.5 px-2 py-0.5 bg-slate-50 rounded border border-slate-100 inline-block">
                    {isNaN(Number(tableNumber)) ? tableNumber : `Mesa ${tableNumber}`}
                  </p>
                </div>
                <button onClick={() => setIsCartOpen(false)} className="bg-slate-50 p-2.5 rounded-xl hover:bg-slate-100 transition-all text-slate-400">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
                <AnimatePresence mode="popLayout">
                  {cart.map(item => (
                    <motion.div 
                      key={item.productId}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="flex justify-between items-center bg-slate-50/50 p-4 rounded-2xl border border-slate-100/50"
                    >
                      <div className="flex-1 mr-4">
                        <h4 className="font-black text-slate-900 uppercase text-[10px] tracking-tight mb-1">{item.name}</h4>
                        <p className="text-[9px] text-indigo-600 font-bold uppercase tracking-widest">{formatPrice(item.price)}</p>
                      </div>
                      <div className="flex items-center bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden p-1">
                        <button 
                          onClick={() => removeFromCart(item.productId)} 
                          className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all active:scale-90"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <div className="w-8 flex items-center justify-center">
                          <AnimatePresence mode="wait">
                            <motion.span 
                              key={item.quantity}
                              initial={{ y: 10, opacity: 0 }}
                              animate={{ y: 0, opacity: 1 }}
                              exit={{ y: -10, opacity: 0 }}
                              transition={{ duration: 0.1 }}
                              className="font-black text-xs text-slate-950"
                            >
                              {item.quantity}
                            </motion.span>
                          </AnimatePresence>
                        </div>
                        <button 
                          onClick={() => addToCart({ id: item.productId, name: item.name, price: item.price } as any)} 
                          className="w-8 h-8 flex items-center justify-center bg-slate-950 text-white rounded-lg hover:bg-indigo-600 shadow-lg shadow-slate-950/10 transition-all active:scale-95"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {cart.length === 0 && (
                  <div className="text-center py-20">
                    <div className="bg-slate-50 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-slate-100 border-dashed">
                      <ShoppingBag className="w-8 h-8 text-slate-200" />
                    </div>
                    <p className="text-slate-300 font-black uppercase tracking-widest text-[10px]">A bandeja está vazia</p>
                  </div>
                )}
              </div>

              <div className="p-8 bg-white border-t border-slate-100 space-y-6">
                <div className="flex justify-between items-center px-2">
                  <span className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Total a Confirmar</span>
                  <span className="text-2xl font-black text-slate-950 tracking-tighter font-display">{formatPrice(cartTotal)}</span>
                </div>
                <button
                  onClick={handlePlaceOrder}
                  disabled={isOrdering || cart.length === 0}
                  className="w-full bg-slate-950 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-slate-950/20 hover:bg-slate-900 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center group"
                >
                  {isOrdering ? (
                    <Loader2 className="animate-spin h-6 w-6" />
                  ) : (
                    <>
                      <span>Enviar Protocolo</span>
                      <ChevronRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Order Success Overlay */}
      <AnimatePresence>
        {orderCreated && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-white z-[100] flex flex-col items-center justify-center p-6 text-center"
          >
            <motion.div
              initial={{ scale: 0, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', delay: 0.1 }}
              className="bg-indigo-600 text-white w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-indigo-100"
            >
              <Check className="w-8 h-8 stroke-[3px]" />
            </motion.div>
            <motion.h2 
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-xl font-black mb-2 uppercase tracking-tight text-slate-950"
            >
              Pedido Sincronizado
            </motion.h2>
            <motion.p
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-slate-400 font-black text-[8px] uppercase tracking-[0.3em]"
            >
              Protocolo enviado com sucesso para a cozinha.
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* My Orders Drawer */}
      <AnimatePresence>
        {showMyOrders && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMyOrders(false)}
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 right-0 top-0 w-full max-w-sm bg-white z-50 flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                <div>
                  <h2 className="text-lg font-black uppercase tracking-tight text-slate-950 leading-none">Meus Pedidos</h2>
                  <p className="text-[8px] text-slate-400 font-black uppercase tracking-[0.3em] mt-2">Log: {customerInfo?.phone}</p>
                </div>
                <button onClick={() => setShowMyOrders(false)} className="bg-white p-2.5 rounded-xl border border-slate-100 text-slate-400 hover:text-slate-950 transition-all">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar">
                {myOrders.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-10">
                    <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mb-6 border border-slate-100 border-dashed">
                      <ClipboardList className="w-10 h-10 text-slate-200" />
                    </div>
                    <p className="text-slate-300 font-black uppercase tracking-widest text-[10px]">Nenhum pedido localizado no sistema.</p>
                  </div>
                ) : (
                  groupedMyOrders.map(([date, orders]) => (
                    <div key={date} className="space-y-3">
                      <div className="flex items-center space-x-3 px-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">
                          {date}
                        </span>
                        <div className="flex-1 h-[1px] bg-slate-100"></div>
                        <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">{orders.length} Pedidos</span>
                      </div>
                      
                      <div className="space-y-3">
                        {orders.map(order => {
                          const isExpanded = expandedOrders.includes(order.id);
                          return (
                            <div
                              key={order.id}
                              className={cn(
                                "bg-white border transition-all duration-300 rounded-[1.8rem] overflow-hidden group",
                                isExpanded ? "border-indigo-600 shadow-xl shadow-indigo-100 ring-2 ring-indigo-50" : "border-slate-100 hover:border-slate-200"
                              )}
                            >
                              <div 
                                onClick={() => toggleOrderExpand(order.id)}
                                className="p-4 cursor-pointer flex justify-between items-start"
                              >
                                <div className="flex-1">
                                  <div className="flex items-center space-x-2 mb-1.5">
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">#{order.id.slice(-6).toUpperCase()}</p>
                                    <div className={cn(
                                      "px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest border",
                                      order.status === 'pending' && "bg-slate-50 text-slate-400 border-slate-100",
                                      order.status === 'preparing' && "bg-indigo-50 text-indigo-600 border-indigo-100 animate-pulse",
                                      order.status === 'ready' && "bg-slate-950 text-white border-slate-950",
                                      order.status === 'delivered' && "bg-emerald-50 text-emerald-600 border-emerald-100",
                                      order.status === 'cancelled' && "bg-red-50 text-red-600 border-red-100"
                                    )}>
                                      {order.status === 'pending' && 'Fila'}
                                      {order.status === 'preparing' && 'Validado'}
                                      {order.status === 'ready' && 'Finalizado'}
                                      {order.status === 'delivered' && 'Finalizado'}
                                      {order.status === 'cancelled' && 'Estorno'}
                                    </div>
                                  </div>
                                  <h3 className="text-[11px] font-black text-slate-900 uppercase">
                                    Mesa {order.tableNumber} • {formatPrice(order.total)}
                                  </h3>
                                </div>
                                <div className="bg-slate-50 p-2 rounded-xl group-hover:bg-indigo-50 transition-colors">
                                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-indigo-600" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                                </div>
                              </div>

                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="px-5 pb-5 pt-1 space-y-4">
                                      <div className="space-y-1 bg-slate-50/50 p-3 rounded-2xl border border-slate-100/50">
                                        {order.items.map((item, i) => (
                                          <div key={i} className="flex justify-between items-center text-[9px] font-bold text-slate-600">
                                            <span className="truncate flex-1">{item.name}</span>
                                            <span className="ml-2 font-mono">x{item.quantity}</span>
                                          </div>
                                        ))}
                                      </div>

                                      <div className="space-y-3">
                                        <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
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
                                        <div className="flex justify-between items-center px-1">
                                           <span className="text-[7px] font-black text-slate-300 uppercase tracking-widest">Barra de Progresso</span>
                                           <span className="text-[7px] font-black text-indigo-600 uppercase tracking-widest">
                                             {order.status === 'pending' && '33% - Em Fila'}
                                             {order.status === 'preparing' && '66% - Validado'}
                                             {(order.status === 'ready' || order.status === 'delivered') && '100% - Concluído'}
                                           </span>
                                        </div>
                                      </div>

                                      <button 
                                        onClick={() => navigate(`/order-tracking/${order.id}?restaurantId=${restaurant?.id}`)}
                                        className="w-full bg-slate-950 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-slate-950/20 active:scale-95 transition-all flex items-center justify-center"
                                      >
                                        Rastrear Pedido <ChevronRight className="w-3.5 h-3.5 ml-2" />
                                      </button>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Welcome Screen after identification */}
      <AnimatePresence>
        {showWelcomeScreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950 z-[120] flex flex-col items-center justify-center p-10 text-center"
          >
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 20 }}
              className="bg-white/5 border border-white/10 p-10 rounded-[3rem] backdrop-blur-2xl max-w-sm w-full"
            >
              <div className="bg-indigo-600 w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-indigo-500/20">
                <Check className="w-10 h-10 text-white stroke-[3]" />
              </div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-4 leading-none font-display">Acesso Autorizado</h2>
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mb-10">Você está conectado ao terminal:</p>
              
              <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-2xl shadow-slate-950/20 overflow-hidden relative group">
                <div className="relative z-10">
                  <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2">Identidade da Unidade</p>
                  <h3 className="text-4xl font-black text-slate-950 uppercase tracking-tighter leading-none">
                    {isNaN(Number(tableNumber)) ? tableNumber : `MESA ${tableNumber}`}
                  </h3>
                </div>
                <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 rounded-full -mr-8 -mt-8" />
              </div>

              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: 3 }}
                className="h-1 bg-indigo-600 rounded-full mt-10"
              />
              <p className="text-[8px] text-slate-600 font-bold uppercase tracking-widest mt-4">Sincronizando Cardápio...</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
