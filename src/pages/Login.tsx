import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where, getDocs, setDoc, doc, getDoc, serverTimestamp, limit } from 'firebase/firestore';
import { motion } from 'motion/react';
import { Shield, ArrowRight, Mail, Key } from 'lucide-react';
import { UserRole } from '../types';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;
      
      // Fetch user profile
      let userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        // Reconstruction attempt: check if they own a restaurant
        const q = query(collection(db, 'restaurants'), where('ownerId', '==', user.uid), limit(1));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const restId = querySnapshot.docs[0].id;
          await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            email: user.email || email,
            role: 'admin',
            restaurantId: restId,
            createdAt: serverTimestamp(),
          });
          userDoc = await getDoc(doc(db, 'users', user.uid));
        }
      }

      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.role === 'admin' || userData.role === 'seller') {
          const restaurantId = userData.restaurantId;
          const restDoc = await getDoc(doc(db, 'restaurants', restaurantId));
          
          if (restDoc.exists()) {
            const restaurant = restDoc.data();
            navigate(`/admin/${restaurant.slug}`);
          } else {
            navigate('/');
          }
        } else {
          navigate('/');
        }
      } else {
        navigate('/');
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      const authErrorCode = err.code || (err.message?.includes('auth/') ? err.message.match(/auth\/[a-z0-9-]+/)?.[0] : null);
      
      if (authErrorCode === 'auth/invalid-credential' || authErrorCode === 'auth/wrong-password' || authErrorCode === 'auth/user-not-found' || authErrorCode === 'auth/invalid-email') {
        setError('E-mail ou senha incorretos. Verifique suas credenciais.');
      } else if (err.code === 'permission-denied' || err.message?.includes('permission')) {
        setError('Acesso negado: Perfil de usuário não localizado ou sem privilégios.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Muitas tentativas malsucedidas. Tente novamente em alguns minutos.');
      } else {
        setError('Falha na autenticação. Verifique sua conexão e tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 grid-bg noise-bg">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-[2.5rem] p-10 shadow-2xl border border-slate-100 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl -mr-10 -mt-10 opacity-50" />
        
        <div className="relative z-10 text-center mb-6">
          <div className="w-14 h-14 bg-slate-950 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-slate-200">
            <Shield className="w-7 h-7 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 leading-none tracking-tighter uppercase">
            Nexus Digital
          </h1>
        </div>

        <form onSubmit={handleAuth} className="space-y-5 relative z-10">
          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-red-50 border border-red-100 px-4 py-3 rounded-xl"
            >
              <p className="text-[10px] font-black text-red-500 uppercase tracking-tight text-center">{error}</p>
            </motion.div>
          )}

          <div>
            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2 ml-1">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="NOME@EXEMPLO.COM"
                className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-12 pr-5 py-4 text-xs font-black uppercase tracking-tight text-slate-900 placeholder:text-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2 ml-1">Senha</label>
            <div className="relative">
              <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-12 pr-5 py-4 text-xs font-black uppercase tracking-tight text-slate-900 placeholder:text-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-950 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-[0.3em] flex items-center justify-center group hover:bg-slate-900 shadow-2xl shadow-slate-300 transition-all active:scale-[0.98] mt-2"
          >
            {loading ? (
              <span className="flex items-center space-x-3">
                <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                <span>Processando...</span>
              </span>
            ) : (
              <>
                <span>Entrar</span>
                <ArrowRight className="ml-3 w-4 h-4 group-hover:translate-x-2 transition-transform" />
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
