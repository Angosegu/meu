import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useParams, Navigate, useLocation } from 'react-router-dom';
import { auth, db } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, getDocs, limit, getDoc, doc, getDocFromServer } from 'firebase/firestore';
import { AnimatePresence, motion } from 'motion/react';

// Pages
import Home from './pages/Home';
import Menu from './pages/Menu';
import AdminDashboard from './pages/AdminDashboard';
import SellerDashboard from './pages/SellerDashboard';
import ClientDashboard from './pages/ClientDashboard';
import ClientOrders from './pages/ClientOrders';
import OrderTracking from './pages/OrderTracking';
import Login from './pages/Login';
import Navbar from './components/Navbar';
import { UserRole } from './types';

function AnimatedRoutes({ user, role }: { user: User | null, role: UserRole | null }) {
  const location = useLocation();
  
  return (
    <AnimatePresence mode="wait">
      <div key={location.pathname}>
        <Routes location={location}>
          <Route path="/" element={
            <PageWrapper>
              <Home user={user} />
            </PageWrapper>
          } />
          <Route path="/login" element={
            <PageWrapper>
              <Login />
            </PageWrapper>
          } />
          <Route path="/menu/:slug" element={
            <PageWrapper>
              <Menu />
            </PageWrapper>
          } />
          
          <Route path="/admin/:slug" element={
            user && (role === 'admin' || role === 'seller') ? (
              <PageWrapper>
                <AdminDashboard user={user} />
              </PageWrapper>
            ) : <Navigate to="/login" />
          } />

          <Route path="/seller/:slug" element={
            user && (role === 'seller' || role === 'admin') ? (
              <PageWrapper>
                <SellerDashboard />
              </PageWrapper>
            ) : <Navigate to="/login" />
          } />

          <Route path="/client/profile" element={
            user ? (
              <PageWrapper>
                <ClientDashboard />
              </PageWrapper>
            ) : <Navigate to="/login" />
          } />

          <Route path="/client/orders" element={
            user ? (
              <PageWrapper>
                <ClientOrders />
              </PageWrapper>
            ) : <Navigate to="/login" />
          } />

          <Route path="/order-tracking/:orderId" element={
            <PageWrapper>
              <OrderTracking />
            </PageWrapper>
          } />
        </Routes>
      </div>
    </AnimatePresence>
  );
}

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user && !user.isAnonymous) {
        // Fetch role only for registered users
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setRole(userDoc.data().role as UserRole);
          } else {
            setRole('client'); 
          }
        } catch (error) {
          console.error("Error fetching user role:", error);
          setRole('client'); 
        }
      } else if (user && user.isAnonymous) {
        setRole('client');
      } else {
        setRole(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <div className="w-12 h-12 border-4 border-slate-50 border-t-indigo-600 rounded-xl animate-spin mb-4"></div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Abrindo Cardápio...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col selection:bg-indigo-100 selection:text-indigo-900">
        <NavWrapper>
          <Navbar user={user} role={role} />
        </NavWrapper>
        <main className="flex-grow">
          <AnimatedRoutes user={user} role={role} />
        </main>
      </div>
    </BrowserRouter>
  );
}

function NavWrapper({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isClientSide = location.pathname.startsWith('/menu/') || location.pathname.startsWith('/order-tracking/');

  if (isClientSide) return null;
  return <>{children}</>;
}
