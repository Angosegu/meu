import React, { useState, useEffect } from 'react';
import { Restaurant, Category, Product } from '../../types';
import { db } from '../../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { Plus, Trash2, Edit2, Check, X, ChefHat, Image as ImageIcon, LayoutGrid, Upload, Loader2 } from 'lucide-react';
import { formatPrice, cn } from '../../lib/utils';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { auth } from '../../firebase';
import { motion, AnimatePresence } from 'motion/react';

interface AdminMenuProps {
  restaurant: Restaurant;
}

export default function AdminMenu({ restaurant }: AdminMenuProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [newProduct, setNewProduct] = useState<Partial<Product>>({ 
    name: '', description: '', price: 0, isAvailable: true, categoryId: '', imageUrl: '' 
  });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploading(true);
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewProduct(prev => ({ ...prev, imageUrl: reader.result as string }));
        setUploading(false);
      };
      reader.onerror = () => {
        // Fallback placeholder logic mentioned in requirements (simulated with standard placeholder)
        setNewProduct(prev => ({ ...prev, imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&q=80' }));
        setUploading(false);
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    const catQ = query(collection(db, `restaurants/${restaurant.id}/categories`), orderBy('order', 'asc'));
    const prodQ = collection(db, `restaurants/${restaurant.id}/products`);

    const unsubCats = onSnapshot(catQ, (snap) => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Category[]);
    });

    const unsubProds = onSnapshot(prodQ, (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Product[]);
    });

    return () => {
      unsubCats();
      unsubProds();
    };
  }, [restaurant.id]);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName) return;
    const path = `restaurants/${restaurant.id}/categories`;
    try {
      await addDoc(collection(db, path), {
        name: newCatName,
        restaurantId: restaurant.id,
        order: categories.length
      });
      setNewCatName('');
      setIsAddingCategory(false);
    } catch (e) { 
      handleFirestoreError(auth, e, OperationType.WRITE, path);
    }
  };

  const addProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.categoryId || !newProduct.price) return;
    const path = editingProductId 
      ? `restaurants/${restaurant.id}/products/${editingProductId}`
      : `restaurants/${restaurant.id}/products`;
    
    try {
      const productData = {
        ...newProduct,
        restaurantId: restaurant.id,
      };

      if (editingProductId) {
        await updateDoc(doc(db, path), productData);
      } else {
        await addDoc(collection(db, path), {
          ...productData,
          isAvailable: true
        });
      }
      setIsAddingProduct(false);
      setEditingProductId(null);
      setNewProduct({ name: '', description: '', price: 0, isAvailable: true, categoryId: '', imageUrl: '' });
    } catch (e) { 
      handleFirestoreError(auth, e, editingProductId ? OperationType.UPDATE : OperationType.WRITE, path);
    }
  };

  const handleEditProduct = (product: Product) => {
    setNewProduct({
      name: product.name,
      description: product.description,
      price: product.price,
      isAvailable: product.isAvailable,
      categoryId: product.categoryId,
      imageUrl: product.imageUrl
    });
    setEditingProductId(product.id);
    setIsAddingProduct(true);
  };

  const toggleAvailability = async (product: Product) => {
    const path = `restaurants/${restaurant.id}/products/${product.id}`;
    try {
      await updateDoc(doc(db, path), {
        isAvailable: !product.isAvailable
      });
    } catch (e) {
      handleFirestoreError(auth, e, OperationType.UPDATE, path);
    }
  };

  const deleteProduct = async (id: string) => {
    if (confirm('Deseja excluir este item?')) {
      const path = `restaurants/${restaurant.id}/products/${id}`;
      try {
        await deleteDoc(doc(db, path));
      } catch (e) {
        handleFirestoreError(auth, e, OperationType.DELETE, path);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <p className="text-[9px] font-black text-indigo-600 uppercase tracking-[0.4em] mb-1.5 px-2.5 py-1 bg-indigo-50 inline-block rounded-lg">Estoque</p>
          <h1 className="text-2xl font-black text-slate-900 leading-none uppercase tracking-tighter">Gestão de Inventário</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setIsAddingCategory(true)}
            className="bg-white border border-slate-200 text-slate-400 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center space-x-2 hover:border-slate-400 hover:bg-slate-50 transition-all shadow-xs active:scale-95"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Categorias</span>
          </button>
          <button
            onClick={() => setIsAddingProduct(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center space-x-2 shadow-lg shadow-indigo-900/10 hover:bg-slate-950 transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo Item</span>
          </button>
        </div>
      </div>

      {/* Category Navigation Bar */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-2 no-scrollbar">
        <button
          onClick={() => setSelectedCategoryId('all')}
          className={cn(
            "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border shrink-0",
            selectedCategoryId === 'all'
              ? "bg-slate-950 text-white border-slate-950 shadow-md"
              : "bg-white text-slate-400 border-slate-100 hover:border-slate-200"
          )}
        >
          Todos ({products.length})
        </button>
        {categories.map(category => (
          <button
            key={category.id}
            onClick={() => setSelectedCategoryId(category.id)}
            className={cn(
              "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border shrink-0 flex items-center space-x-2",
              selectedCategoryId === category.id
                ? "bg-indigo-600 text-white border-indigo-600 shadow-md"
                : "bg-white text-slate-400 border-slate-100 hover:border-slate-200"
            )}
          >
            <span>{category.name}</span>
            <span className={cn(
              "px-1.5 py-0.5 rounded-md text-[8px] font-bold",
              selectedCategoryId === category.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"
            )}>
              {products.filter(p => p.categoryId === category.id).length}
            </span>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {isAddingCategory && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-slate-50 border border-slate-100 p-6 rounded-3xl overflow-hidden mb-8"
          >
            <form onSubmit={handleAddCategory} className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 space-y-2">
                <label className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-400 ml-1">Nova Categoria de Produto</label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  className="w-full bg-white border border-slate-200 p-3 rounded-xl text-[10px] font-bold uppercase tracking-widest outline-none focus:border-indigo-600"
                  placeholder="EX: BEBIDAS PREMIUM"
                />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setIsAddingCategory(false)} className="px-4 py-3 text-[9px] font-black uppercase text-slate-400 bg-white rounded-xl border border-slate-100">Cancelar</button>
                <button type="submit" className="px-6 py-3 text-[9px] font-black uppercase text-white bg-slate-950 rounded-xl">Indexar Categoria</button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {isAddingProduct && (
        <motion.div 
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           className="bg-white rounded-[2.5rem] border border-slate-100 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.08)] overflow-hidden"
         >
            <div className="bg-slate-950 p-8 text-white flex justify-between items-center">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight leading-none">
                  {editingProductId ? 'Modificar Protocolo' : 'Novo Registro de Cardápio'}
                </h2>
                <div className="flex items-center space-x-3 mt-3">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.3em]">Ambiente de Configuração Segura</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setIsAddingProduct(false);
                  setEditingProductId(null);
                  setNewProduct({ name: '', description: '', price: 0, isAvailable: true, categoryId: '', imageUrl: '' });
                }}
                className="bg-white/10 hover:bg-white/20 p-3 rounded-2xl transition-colors border border-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={addProduct} className="p-8">
               <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                  {/* Left Column: Image Asset */}
                  <div className="lg:col-span-3 space-y-4">
                    <div className="space-y-3">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center">
                        <ImageIcon className="w-3 h-3 mr-2 text-indigo-500" />
                        Asset Visual
                      </label>
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full max-w-[180px] aspect-square mx-auto bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center relative overflow-hidden group cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-50/30 transition-all shadow-inner"
                      >
                        {newProduct.imageUrl ? (
                          <>
                            <img src={newProduct.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <div className="bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-lg text-white text-[8px] font-black uppercase tracking-widest border border-white/20">Alterar</div>
                            </div>
                          </>
                        ) : (
                          <div className="text-center p-4">
                            {uploading ? (
                              <Loader2 className="w-6 h-6 text-indigo-600 animate-spin mx-auto mb-2" />
                            ) : (
                               <Upload className="w-6 h-6 text-slate-300 mx-auto mb-2 group-hover:text-indigo-500 transition-colors" />
                            )}
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tight">Upload Asset</p>
                          </div>
                        )}
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          onChange={handleImageUpload} 
                          className="hidden" 
                          accept="image/*"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[7px] font-black uppercase tracking-widest text-slate-300 ml-1">URL Direta</label>
                        <input
                          type="text"
                          value={newProduct.imageUrl}
                          onChange={e => setNewProduct({...newProduct, imageUrl: e.target.value})}
                          className="w-full bg-slate-50 border border-slate-100 p-2.5 rounded-lg text-[8px] font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                          placeholder="https://..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Information Data */}
                  <div className="lg:col-span-9 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Identificação Nominal</label>
                          <input
                            type="text"
                            required
                            value={newProduct.name}
                            onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                            className="w-full bg-white border border-slate-200 p-3.5 rounded-xl focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all placeholder:text-slate-300 font-black text-xs uppercase tracking-tight"
                            placeholder="Ex: Entrecôte Premium"
                          />
                       </div>

                       <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Classificação de Menu</label>
                          <div className="relative">
                            <select
                              required
                              value={newProduct.categoryId}
                              onChange={e => setNewProduct({...newProduct, categoryId: e.target.value})}
                              className="w-full bg-white border border-slate-200 p-3.5 rounded-xl focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all appearance-none font-bold text-xs cursor-pointer pr-10"
                            >
                              <option value="">Indexar em...</option>
                              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <LayoutGrid className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 pointer-events-none" />
                          </div>
                       </div>

                       <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Valor Unitário (BRL)</label>
                          <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 font-black text-[10px]">R$</span>
                            <input
                              type="number"
                              step="0.01"
                              required
                              value={newProduct.price}
                              onChange={e => setNewProduct({...newProduct, price: parseFloat(e.target.value)})}
                              className="w-full bg-white border border-slate-200 p-3.5 pl-9 rounded-xl focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all font-black text-base tracking-tighter"
                            />
                          </div>
                       </div>

                       <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Status de Rede</label>
                          <div className="flex items-center space-x-3 h-full pt-1">
                            <button
                              type="button"
                              onClick={() => setNewProduct({...newProduct, isAvailable: !newProduct.isAvailable})}
                              className={cn(
                                "w-12 h-6 rounded-full relative transition-all duration-300 outline-none border-2",
                                newProduct.isAvailable ? "bg-indigo-600 border-indigo-400 shadow-[0_0_10px_rgba(79,70,229,0.2)]" : "bg-slate-100 border-slate-200"
                              )}
                            >
                              <div className={cn(
                                "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all duration-300 shadow-sm",
                                newProduct.isAvailable ? "left-6.5" : "left-0.5"
                              )} />
                            </button>
                            <div className="flex flex-col">
                              <span className={cn(
                                "text-[9px] font-black uppercase tracking-widest leading-none",
                                newProduct.isAvailable ? "text-indigo-600" : "text-slate-400"
                              )}>
                                {newProduct.isAvailable ? 'Operacional' : 'Offline'}
                              </span>
                              <span className="text-[7px] text-slate-300 font-bold uppercase mt-0.5">Visibilidade Ativa</span>
                            </div>
                          </div>
                       </div>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Especificações de Cardápio</label>
                       <textarea
                         value={newProduct.description}
                         onChange={e => setNewProduct({...newProduct, description: e.target.value})}
                         className="w-full bg-white border border-slate-200 p-3.5 rounded-xl focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all h-24 resize-none font-medium text-xs leading-relaxed"
                         placeholder="Descreva as propriedades sensoriais, ingredientes e detalhes técnicos do prato..."
                       />
                    </div>
                  </div>
               </div>

               <div className="mt-12 flex flex-col md:flex-row justify-between items-center gap-6 pt-10 border-t border-slate-100">
                  <div className="flex items-center space-x-3 text-slate-300">
                    <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center">
                      <ChefHat className="w-5 h-5" />
                    </div>
                    <p className="text-[9px] font-bold uppercase tracking-widest leading-tight">Os dados serão propagados em tempo real<br/>para todos os terminais de mesa vinculados.</p>
                  </div>
                  <div className="flex space-x-3 w-full md:w-auto">
                    <button 
                      type="button" 
                      onClick={() => {
                        setIsAddingProduct(false);
                        setEditingProductId(null);
                        setNewProduct({ name: '', description: '', price: 0, isAvailable: true, categoryId: '', imageUrl: '' });
                      }} 
                      className="flex-1 md:flex-none px-6 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all border border-slate-100"
                    >
                      Abortar Operação
                    </button>
                    <button 
                      type="submit" 
                      className="flex-1 md:flex-none px-8 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest bg-slate-950 text-white hover:bg-indigo-600 shadow-xl shadow-indigo-500/10 active:scale-95 transition-all flex items-center justify-center border border-white/5"
                    >
                      {editingProductId ? 'Salvar Protocolo' : 'Confirmar Registro'}
                    </button>
                  </div>
               </div>
            </form>
         </motion.div>
      )}

      {categories.length === 0 && !isAddingProduct && (
        <div className="text-center py-24 bg-white rounded-3xl border-2 border-dashed border-slate-100">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <ChefHat className="w-8 h-8 text-slate-200" />
          </div>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Aguardando definição de arquitetura...</p>
        </div>
      )}

      {categories
        .filter(c => selectedCategoryId === 'all' || c.id === selectedCategoryId)
        .map((category) => (
        <div key={category.id} className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="flex items-center justify-between group border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-3">
              <div className="w-1.5 h-6 bg-slate-950 rounded-full" />
              <h2 className="text-lg font-black text-slate-950 uppercase tracking-tighter flex items-center">
                {category.name}
                <span className="ml-3 text-[9px] font-black bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-md tracking-widest border border-indigo-100/50">
                  {products.filter(p => p.categoryId === category.id).length}P
                </span>
              </h2>
            </div>
            <div className="flex space-x-1">
              <button 
                onClick={async () => {
                  if (confirm('Deseja excluir a categoria e todos os seus itens?')) {
                    const path = `restaurants/${restaurant.id}/categories/${category.id}`;
                    try {
                      await deleteDoc(doc(db, path));
                    } catch (e) {
                      handleFirestoreError(auth, e, OperationType.DELETE, path);
                    }
                  }
                }}
                className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                title="Deletar Estrutura"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className={cn(
            "grid gap-2 text-center",
            selectedCategoryId === 'all' 
              ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10" 
              : "grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 2xl:grid-cols-9"
          )}>
            {products.filter(p => p.categoryId === category.id).map((product) => (
              <div key={product.id} className={cn(
                "bg-white p-2 rounded-xl border border-slate-100 transition-all flex flex-col group hover:border-indigo-100 hover:shadow-sm relative overflow-hidden",
                !product.isAvailable && "opacity-60 grayscale border-dashed"
              )}>
                <div className="space-y-1.5 mb-2">
                  <div className="aspect-square bg-slate-50 rounded-lg overflow-hidden border border-slate-50 relative">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-200 bg-slate-50">
                        <ChefHat className="w-4 h-4" />
                      </div>
                    )}
                    {!product.isAvailable && (
                      <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] flex items-center justify-center p-1">
                        <span className="text-[7px] font-black text-white uppercase tracking-tighter bg-red-500 px-1 rounded">Off</span>
                      </div>
                    )}
                  </div>
                  <div className="px-0.5">
                    <h4 className="font-black text-slate-900 uppercase tracking-tight truncate text-[9px] leading-tight group-hover:text-indigo-600 transition-colors">{product.name}</h4>
                    <p className="font-black text-indigo-600 text-[9px] font-mono tracking-tighter leading-none">{formatPrice(product.price)}</p>
                  </div>
                </div>
                
                <div className="flex items-center justify-between mt-auto pt-1.5 border-t border-slate-50/50">
                  <button
                    onClick={() => toggleAvailability(product)}
                    className={cn(
                      "text-[7px] font-black uppercase tracking-tighter px-1 py-0.5 rounded border transition-all",
                      product.isAvailable ? "bg-indigo-50 text-indigo-600 border-indigo-100" : "bg-slate-50 text-slate-400 border-slate-100"
                    )}
                  >
                    {product.isAvailable ? 'ON' : 'OFF'}
                  </button>
                  <div className="flex space-x-1">
                    <button 
                      onClick={() => handleEditProduct(product)}
                      className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded transition-all"
                      title="Editar"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => deleteProduct(product.id)}
                      className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-50 rounded transition-all"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            <button
               onClick={() => {
                 setIsAddingProduct(true);
                 setNewProduct({...newProduct, categoryId: category.id});
               }}
               className="aspect-square border border-dashed border-slate-100 rounded-xl flex flex-col items-center justify-center text-slate-200 hover:border-indigo-100 hover:text-indigo-500 hover:bg-slate-50 transition-all group bg-slate-50/5"
            >
               <div className="w-6 h-6 bg-white border border-slate-100 rounded flex items-center justify-center mb-1 group-hover:scale-110 group-hover:rotate-90 transition-all duration-300">
                 <Plus className="w-3.5 h-3.5" />
               </div>
               <span className="text-[8px] font-black uppercase tracking-tight">Novo</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
