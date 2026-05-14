import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { Utensils, LogOut, User as UserIcon, LayoutDashboard, UserCircle } from 'lucide-react';
import { UserRole } from '../types';

interface NavbarProps {
  user: User | null;
  role: UserRole | null;
}

export default function Navbar({ user, role }: NavbarProps) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  return (
    <nav className="bg-white/70 backdrop-blur-xl border-b border-slate-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-12 items-center">
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-2 group">
              <div className="bg-slate-950 w-7 h-7 rounded-lg flex items-center justify-center text-[10px] text-white font-black shadow-2xl shadow-slate-900/20 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">ML</div>
              <span className="font-black text-sm tracking-tighter text-slate-900 uppercase">Meu <span className="text-indigo-600">Lugar</span></span>
            </Link>
          </div>

          <div className="flex items-center space-x-6">
            {user ? (
              <div className="flex items-center space-x-6">
                {(role === 'admin' || role === 'seller') ? (
                  <Link 
                    to="/login" // Logic in Login will redirect to correct dashboard
                    className="flex items-center space-x-2 text-indigo-600 hover:text-indigo-700 transition-colors font-black text-[8px] uppercase tracking-[0.2em]"
                  >
                    <LayoutDashboard className="w-3.5 h-3.5" />
                    <span>Terminal</span>
                  </Link>
                ) : (
                  <Link 
                    to="/client/profile"
                    className="flex items-center space-x-2 text-indigo-600 hover:text-indigo-700 transition-colors font-black text-[8px] uppercase tracking-[0.2em]"
                  >
                    <UserCircle className="w-3.5 h-3.5" />
                    <span>Perfil</span>
                  </Link>
                )}
                
                <button
                  onClick={handleLogout}
                  className="flex items-center space-x-2 text-slate-400 hover:text-slate-950 transition-all font-black text-[10px] uppercase tracking-[0.2em] group"
                >
                  <LogOut className="h-3.5 w-3.5 group-hover:-translate-x-1 transition-transform" />
                  <span>Sair</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-6">
                <Link
                  to="/login"
                  state={{ mode: 'login' }}
                  className="bg-slate-950 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-900 transition-all shadow-xl shadow-slate-200"
                >
                  Entrar
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
