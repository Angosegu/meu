import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebase';
import { doc, setDoc, serverTimestamp, deleteDoc, getDocs, onSnapshot, query, collection, where } from 'firebase/firestore';
import { Restaurant, Order } from '../../types';
import { cn } from '../../lib/utils';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { UserPlus, Mail, Key, Trash2, Shield, Loader2, Check, X, Users, BarChart3, ShoppingBag, QrCode, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { initializeApp, getApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import firebaseConfig from '../../../firebase-applet-config.json';

interface AdminUsersProps {
  restaurant: Restaurant;
  isSuperAdmin?: boolean;
}

interface SellerUser {
  uid: string;
  email: string;
  role: 'seller';
  restaurantId: string;
  status: 'active' | 'suspended';
  storeName?: string;
  storeColor?: string;
  storeLogo?: string;
  permissions?: {
    canViewReports: boolean;
    canEditOrders: boolean;
    canManageMenu: boolean;
  };
  createdAt: any;
}

export default function AdminUsers({ restaurant, isSuperAdmin }: AdminUsersProps) {
  const [sellers, setSellers] = useState<SellerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreColor, setNewStoreColor] = useState('#6366f1');
  const [newStoreLogo, setNewStoreLogo] = useState('');
  const [uploading, setUploading] = useState(false);
  const [permissions, setPermissions] = useState({
    canViewReports: false,
    canEditOrders: true,
    canManageMenu: false
  });
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [editingSeller, setEditingSeller] = useState<SellerUser | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploading(true);
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewStoreLogo(reader.result as string);
        setUploading(false);
      };
      reader.onerror = () => {
        setUploading(false);
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    const q = isSuperAdmin 
      ? query(collection(db, 'users'), where('role', '==', 'seller'))
      : query(collection(db, 'users'), where('restaurantId', '==', restaurant.id), where('role', '==', 'seller'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const users = snapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      })) as SellerUser[];
      setSellers(users);
      setLoading(false);
    });

    return unsubscribe;
  }, [restaurant.id]);

  const handleCreateSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus('loading');

    try {
      // Create a secondary firebase app to avoid logging out the admin
      let secondaryApp;
      try {
        secondaryApp = getApp('Secondary');
      } catch (e) {
        secondaryApp = initializeApp(firebaseConfig, 'Secondary');
      }

      const secondaryAuth = getAuth(secondaryApp);
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newEmail, newPassword);
      const newUser = userCredential.user;

      // Add to users collection
      const userPath = `users/${newUser.uid}`;
      const restaurantSlug = newStoreName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const newRestaurantId = `rest_${Math.random().toString(36).substring(2, 9)}`;

      try {
        // 1. Create the Restaurant first
        await setDoc(doc(db, 'restaurants', newRestaurantId), {
          id: newRestaurantId,
          name: newStoreName,
          slug: restaurantSlug,
          description: `Loja de ${newStoreName}`,
          themeColor: newStoreColor,
          logoUrl: newStoreLogo,
          ownerId: newUser.uid,
          tables: ['Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Mesa 5'],
          createdAt: serverTimestamp(),
        });

        // 2. Create the User linked to their own restaurant
        await setDoc(doc(db, 'users', newUser.uid), {
          uid: newUser.uid,
          email: newEmail,
          role: 'seller',
          restaurantId: newRestaurantId,
          storeName: newStoreName,
          storeColor: newStoreColor,
          storeLogo: newStoreLogo,
          permissions: {
            ...permissions,
            canManageMenu: true, // Sellers MUST be able to manage their own menu
            canEditOrders: true,
            canViewReports: true
          },
          status: 'active',
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(auth, err, OperationType.CREATE, userPath);
      }

      // Sign out from the secondary app instance immediately
      await signOut(secondaryAuth);

      setStatus('success');
      setNewEmail('');
      setNewPassword('');
      setNewStoreName('');
      setNewStoreColor('#6366f1');
      setNewStoreLogo('');
      setPermissions({
        canViewReports: false,
        canEditOrders: true,
        canManageMenu: false
      });
      setTimeout(() => {
        setStatus('idle');
        setIsAdding(false);
      }, 2000);

    } catch (err: any) {
      console.error("Error creating seller:", err);
      if (err.code === 'auth/email-already-in-use') {
        setError("Este e-mail já está sendo usado por outro usuário no sistema.");
      } else if (err.code === 'auth/weak-password') {
        setError("A senha escolhida é muito fraca. Use pelo menos 6 caracteres.");
      } else if (err.code === 'auth/invalid-email') {
        setError("O endereço de e-mail informado é inválido.");
      } else if (err.code === 'permission-denied' || err.message?.toLowerCase().includes('permission')) {
        setError("Erro de Permissão: Verifique se você é o administrador deste restaurante.");
      } else if (err.code === 'auth/operation-not-allowed') {
        setError("O cadastro de usuários por e-mail/senha não está habilitado no Firebase.");
      } else {
        setError(`Erro inesperado: ${err.message || "Tente novamente mais tarde."}`);
      }
      setStatus('idle');
    }
  };

  const handleEditSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSeller) return;
    setError(null);
    setStatus('loading');

    const userPath = `users/${editingSeller.uid}`;
    try {
      await setDoc(doc(db, 'users', editingSeller.uid), {
        ...editingSeller,
        storeName: newStoreName,
        storeColor: newStoreColor,
        storeLogo: newStoreLogo,
        permissions: permissions,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // If store name changed, update the restaurant as well
      if (newStoreName !== editingSeller.storeName) {
        await setDoc(doc(db, 'restaurants', editingSeller.restaurantId), {
          name: newStoreName,
          themeColor: newStoreColor,
          logoUrl: newStoreLogo,
        }, { merge: true });
      }

      setStatus('success');
      setTimeout(() => {
        setStatus('idle');
        setEditingSeller(null);
        resetForm();
      }, 1000);
    } catch (err) {
      console.error("Error editing seller:", err);
      handleFirestoreError(auth, err, OperationType.UPDATE, userPath);
      setStatus('idle');
    }
  };

  const handleToggleStatus = async (seller: SellerUser) => {
    const newStatus = seller.status === 'suspended' ? 'active' : 'suspended';
    const actionLabel = newStatus === 'active' ? 'Reativar' : 'Suspender';
    
    if (!window.confirm(`Deseja realmente ${actionLabel.toLowerCase()} este vendedor?`)) return;
    
    const userPath = `users/${seller.uid}`;
    try {
      await setDoc(doc(db, 'users', seller.uid), {
        status: newStatus
      }, { merge: true });
    } catch (err) {
      console.error("Error toggling status:", err);
      handleFirestoreError(auth, err, OperationType.UPDATE, userPath);
    }
  };

  const resetForm = () => {
    setNewEmail('');
    setNewPassword('');
    setNewStoreName('');
    setNewStoreColor('#6366f1');
    setNewStoreLogo('');
    setPermissions({
      canViewReports: false,
      canEditOrders: true,
      canManageMenu: false
    });
    setError(null);
  };

  const startEditing = (seller: SellerUser) => {
    setEditingSeller(seller);
    setNewStoreName(seller.storeName || '');
    setNewStoreColor(seller.storeColor || '#6366f1');
    setNewStoreLogo(seller.storeLogo || '');
    setPermissions(seller.permissions || {
      canViewReports: false,
      canEditOrders: true,
      canManageMenu: false
    });
    setIsAdding(true);
  };

  const togglePermission = async (uid: string, seller: SellerUser, permission: keyof NonNullable<SellerUser['permissions']>) => {
    const userPath = `users/${uid}`;
    try {
      const currentPermissions = seller.permissions || {
        canViewReports: false,
        canEditOrders: false,
        canManageMenu: false
      };
      
      await setDoc(doc(db, 'users', uid), {
        ...seller,
        uid, // ensure uid is set
        permissions: {
          ...currentPermissions,
          [permission]: !currentPermissions[permission]
        }
      }, { merge: true });
    } catch (err) {
      console.error("Error updating permissions:", err);
      handleFirestoreError(auth, err, OperationType.UPDATE, userPath);
    }
  };

  const handleDeleteSeller = async (uid: string) => {
    if (!window.confirm('Tem certeza que deseja remover este vendedor? O acesso será revogado imediatamente.')) return;
    const userPath = `users/${uid}`;
    try {
      await deleteDoc(doc(db, 'users', uid));
    } catch (err) {
      console.error("Error deleting seller:", err);
      handleFirestoreError(auth, err, OperationType.DELETE, userPath);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <p className="text-[9px] font-black text-indigo-600 uppercase tracking-[0.4em] mb-1 px-2 py-0.5 bg-indigo-50 inline-block rounded-md">RH</p>
          <h1 className="text-2xl font-black text-slate-900 leading-none uppercase tracking-tighter">Equipe de Vendas</h1>
        </div>
        <button
          onClick={() => {
            setEditingSeller(null);
            resetForm();
            setIsAdding(true);
          }}
          className="bg-slate-950 text-white px-5 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center space-x-2 shadow-lg shadow-indigo-900/10 hover:bg-slate-800 transition-all active:scale-95"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Novo Vendedor</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Seller List */}
        <div className="lg:col-span-8">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-50 flex justify-between items-center bg-slate-50/20">
              <h3 className="text-[11px] font-black text-slate-950 uppercase tracking-widest">Time Ativo</h3>
              <div className="flex items-center space-x-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">{sellers.length} Conectados</p>
              </div>
            </div>

            <div className="divide-y divide-slate-50">
              {loading ? (
                <div className="p-20 flex flex-col items-center justify-center">
                  <Loader2 className="w-8 h-8 text-indigo-200 animate-spin mb-3" />
                  <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Sincronizando...</p>
                </div>
              ) : sellers.length === 0 ? (
                <div className="p-20 text-center">
                  <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mx-auto mb-4 text-slate-200">
                    <Users className="w-6 h-6" />
                  </div>
                  <p className="text-slate-400 text-[10px] font-black uppercase tracking-tight">Sem vendedores ativos.</p>
                </div>
              ) : (
                sellers.map((seller) => (
                  <div key={seller.uid} className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-50/50 transition-all group gap-4 sm:gap-2">
                    <div className="flex items-center space-x-3 sm:space-x-4 min-w-0">
                      <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-100 group-hover:scale-105 transition-transform duration-300 relative overflow-hidden shrink-0" 
                           style={{ backgroundColor: seller.storeColor }}>
                        {seller.storeLogo ? (
                          <img src={seller.storeLogo} alt="Logo" className="w-full h-full object-cover" />
                        ) : (
                          <Shield className={cn("w-5 h-5", seller.storeColor ? "text-white" : "text-indigo-600")} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight group-hover:text-indigo-600 transition-colors truncate">
                            {seller.storeName || seller.email}
                          </p>
                          {seller.status === 'suspended' && (
                            <span className="bg-red-50 text-red-500 text-[7px] font-black uppercase px-1.5 py-0.5 rounded border border-red-100 shrink-0">Suspenso</span>
                          )}
                        </div>
                        {seller.storeName && (
                          <p className="text-[8px] text-slate-400 font-bold uppercase -mt-0.5 truncate">{seller.email}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <button 
                            onClick={() => togglePermission(seller.uid, seller, 'canViewReports')}
                            className={cn(
                              "text-[8px] font-black uppercase tracking-tighter px-2 py-0.5 rounded transition-all",
                              seller.permissions?.canViewReports 
                                ? "bg-indigo-50 text-indigo-600" 
                                : "bg-slate-50 text-slate-300"
                            )}
                          >
                            RPT
                          </button>
                          <button 
                            onClick={() => togglePermission(seller.uid, seller, 'canEditOrders')}
                            className={cn(
                              "text-[8px] font-black uppercase tracking-tighter px-2 py-0.5 rounded transition-all",
                              seller.permissions?.canEditOrders 
                                ? "bg-indigo-50 text-indigo-600" 
                                : "bg-slate-50 text-slate-300"
                            )}
                          >
                            PED
                          </button>
                          <button 
                            onClick={() => togglePermission(seller.uid, seller, 'canManageMenu')}
                            className={cn(
                              "text-[8px] font-black uppercase tracking-tighter px-2 py-0.5 rounded transition-all",
                              seller.permissions?.canManageMenu 
                                ? "bg-indigo-50 text-indigo-600" 
                                : "bg-slate-50 text-slate-300"
                            )}
                          >
                            MENU
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-1 sm:opacity-0 sm:group-hover:opacity-100 transition-all justify-end sm:justify-start">
                      <button
                        onClick={() => handleToggleStatus(seller)}
                        className={cn(
                          "p-2 rounded-lg transition-all",
                          seller.status === 'suspended' ? "text-emerald-500 hover:bg-emerald-50" : "text-amber-500 hover:bg-amber-50"
                        )}
                        title={seller.status === 'suspended' ? "Ativar" : "Suspender"}
                      >
                        {seller.status === 'suspended' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => startEditing(seller)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        title="Editar"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteSeller(seller.uid)}
                        className="p-2 text-slate-200 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: Add Form Modal-like */}
        <AnimatePresence>
          {isAdding && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="lg:col-span-4"
            >
              <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden backdrop-blur-xl">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl" />
                
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-8">
                    <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-900/40">
                      <UserPlus className="w-6 h-6 text-white" />
                    </div>
                    <button onClick={() => setIsAdding(false)} className="text-slate-500 hover:text-white transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <h3 className="text-lg font-black text-white uppercase tracking-tight mb-2">
                    {editingSeller ? 'Editar Vendedor' : 'Credenciar Vendedor'}
                  </h3>
                  <p className="text-slate-500 text-[11px] font-black uppercase tracking-widest mb-8 leading-relaxed">
                    {editingSeller ? `Atualize os dados de acesso para ${editingSeller.storeName}.` : 'Personalize o terminal de acesso do seu vendedor.'}
                  </p>

                  <form onSubmit={editingSeller ? handleEditSeller : handleCreateSeller} className="space-y-4">
                    {error && (
                      <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl">
                        <p className="text-[11px] font-black text-red-400 uppercase tracking-tight text-center">{error}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Nome da Unidade</label>
                        <input
                          required
                          type="text"
                          value={newStoreName}
                          onChange={(e) => setNewStoreName(e.target.value)}
                          placeholder="Ex: Quiosque A"
                          className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-[11px] font-bold text-white placeholder:text-slate-600 focus:border-indigo-500 outline-none transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Cor de Destaque</label>
                        <div className="flex space-x-2">
                          <input
                            type="color"
                            value={newStoreColor}
                            onChange={(e) => setNewStoreColor(e.target.value)}
                            className="w-10 h-10 bg-slate-800/50 border border-slate-700 rounded-lg cursor-pointer p-1"
                          />
                          <input
                            type="text"
                            value={newStoreColor}
                            onChange={(e) => setNewStoreColor(e.target.value)}
                            className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-[10px] font-mono text-white outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                       <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Logotipo da Unidade</label>
                       <div className="flex items-center space-x-3">
                          <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-14 h-14 bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-center cursor-pointer hover:border-indigo-500 transition-all overflow-hidden relative group"
                          >
                            {newStoreLogo ? (
                              <>
                                <img src={newStoreLogo} alt="Logo Preview" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                  <Upload className="w-4 h-4 text-white" />
                                </div>
                              </>
                            ) : uploading ? (
                              <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                            ) : (
                              <Upload className="w-5 h-5 text-slate-600 group-hover:text-indigo-400" />
                            )}
                          </div>
                          <div className="flex-1 space-y-1">
                            <input
                              type="text"
                              value={newStoreLogo}
                              onChange={(e) => setNewStoreLogo(e.target.value)}
                              placeholder="Ou cole a URL direta aqui"
                              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-[10px] font-bold text-white placeholder:text-slate-600 focus:border-indigo-500 outline-none transition-all"
                            />
                            <p className="text-[7px] text-slate-600 font-bold uppercase tracking-widest ml-1">Recomendado: SVG ou PNG Transparente</p>
                          </div>
                          <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleLogoUpload} 
                            className="hidden" 
                            accept="image/*"
                          />
                       </div>
                    </div>

                    {!editingSeller && (
                      <div className="space-y-2">
                        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">E-mail de Acesso</label>
                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
                            <input
                              required
                              type="email"
                              value={newEmail}
                              onChange={(e) => setNewEmail(e.target.value)}
                              placeholder="vendedor@meulugar.com"
                              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl pl-12 pr-5 py-3 text-[10px] font-bold text-white placeholder:text-slate-600 focus:border-indigo-500 outline-none transition-all"
                            />
                        </div>
                      </div>
                    )}

                    {!editingSeller && (
                      <div className="space-y-2">
                        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Senha (Mín. 6 chars)</label>
                        <div className="relative">
                            <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
                            <input
                              required
                              type="password"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="••••••••"
                              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl pl-12 pr-5 py-3 text-[10px] font-bold text-white placeholder:text-slate-600 focus:border-indigo-500 outline-none transition-all"
                            />
                        </div>
                      </div>
                    )}

                    <div className="pt-2 space-y-3">
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1 mb-3">Permissões de Acesso</label>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setPermissions(p => ({ ...p, canViewReports: !p.canViewReports }))}
                          className={cn(
                            "flex flex-col items-center p-2.5 rounded-2xl border transition-all text-center",
                            permissions.canViewReports ? "bg-indigo-500/10 border-indigo-500 text-indigo-400" : "bg-slate-800/50 border-slate-700 text-slate-500"
                          )}
                        >
                          <BarChart3 className={cn("w-3.5 h-3.5 mb-1.5", permissions.canViewReports ? "text-indigo-400" : "text-slate-600")} />
                          <span className="text-[9px] font-black uppercase tracking-widest">Relatórios</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPermissions(p => ({ ...p, canEditOrders: !p.canEditOrders }))}
                          className={cn(
                            "flex flex-col items-center p-2.5 rounded-2xl border transition-all text-center",
                            permissions.canEditOrders ? "bg-indigo-500/10 border-indigo-500 text-indigo-400" : "bg-slate-800/50 border-slate-700 text-slate-500"
                          )}
                        >
                          <ShoppingBag className={cn("w-3.5 h-3.5 mb-1.5", permissions.canEditOrders ? "text-indigo-400" : "text-slate-600")} />
                          <span className="text-[9px] font-black uppercase tracking-widest">Pedidos</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPermissions(p => ({ ...p, canManageMenu: !p.canManageMenu }))}
                          className={cn(
                            "flex flex-col items-center p-2.5 rounded-2xl border transition-all text-center",
                            permissions.canManageMenu ? "bg-indigo-500/10 border-indigo-500 text-indigo-400" : "bg-slate-800/50 border-slate-700 text-slate-500"
                          )}
                        >
                          <QrCode className={cn("w-3.5 h-3.5 mb-1.5", permissions.canManageMenu ? "text-indigo-400" : "text-slate-600")} />
                          <span className="text-[9px] font-black uppercase tracking-widest">Cardápio/QR</span>
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={status !== 'idle'}
                      className="w-full bg-white text-slate-950 py-4 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center group hover:bg-indigo-50 transition-all active:scale-[0.98]"
                    >
                      {status === 'loading' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : status === 'success' ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <span>{editingSeller ? 'Salvar Alterações' : 'Validar e Criar Conta'}</span>
                      )}
                    </button>
                  </form>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!isAdding && (
          <div className="lg:col-span-4 space-y-4">
             <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 relative overflow-hidden group">
                <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-indigo-500/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
                <div className="relative z-10">
                   <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center mb-4">
                      <Users className="w-4 h-4 text-indigo-400" />
                   </div>
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-white">Segurança</h4>
                   <p className="text-slate-500 text-[9px] font-bold leading-relaxed mt-2 uppercase tracking-tight">
                      Acesso restrito ao terminal de pedidos e monitoramento.
                   </p>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
