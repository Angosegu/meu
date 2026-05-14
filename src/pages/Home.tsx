import React from 'react';
import { User } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { QrCode, Smartphone, BarChart3, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';

interface HomeProps {
  user: User | null;
}

export default function Home({ user }: HomeProps) {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen bg-white flex flex-col items-center justify-center overflow-hidden">
      {/* Background patterns */}
      <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none">
        <div className="absolute top-[10%] left-[10%] w-[40%] h-[40%] bg-indigo-400 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[10%] right-[10%] w-[40%] h-[40%] bg-violet-400 rounded-full blur-[120px]"></div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-xl mx-auto px-6 relative z-10 text-center py-10 sm:py-0"
      >
        <h1 className="text-2xl lg:text-3xl font-black text-slate-950 leading-tight mb-4 tracking-tighter uppercase sm:whitespace-pre-line">
          Infraestrutura <br className="hidden sm:block" />
          <span className="text-indigo-600">Digital Ativa</span>
        </h1>
        
        <p className="text-[12px] text-slate-400 mb-10 leading-relaxed max-w-[280px] mx-auto font-black uppercase tracking-widest">
          Sistema de Gestão Operacional e Cardápio Digital Inteligente para Redes de Alimentação.
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => navigate('/login')}
            className="w-full bg-slate-950 text-white px-6 py-4 rounded-xl font-black text-[11px] hover:bg-slate-900 transition-all shadow-xl shadow-slate-200 flex items-center justify-center group uppercase tracking-[0.2em]"
          >
            Entrar no Sistema
            <ArrowRight className="ml-2 h-3 w-3 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        <div className="mt-16 flex items-center justify-center space-x-6">
          <button 
            onClick={() => navigate('/login', { state: { mode: 'register' } })}
            className="flex items-center space-x-2 text-slate-400 hover:text-indigo-600 transition-colors"
          >
            <QrCode className="w-3 h-3" />
            <span className="text-[9px] font-black uppercase tracking-widest">Digital Ready</span>
          </button>
          <div className="w-[1px] h-2 bg-slate-200" />
          <button 
            onClick={() => navigate('/login', { state: { mode: 'login' } })}
            className="flex items-center space-x-2 text-slate-400 hover:text-indigo-600 transition-colors"
          >
            <BarChart3 className="w-3 h-3" />
            <span className="text-[9px] font-black uppercase tracking-widest">BI Monitoring</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
