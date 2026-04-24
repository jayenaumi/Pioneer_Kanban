
import React from 'react';
import { LayoutDashboard, ClipboardList, Camera, History, User, Building2, QrCode, AlertCircle, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../services/supabase';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: any;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab, user }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'order-info', label: 'Order Info', icon: ClipboardList },
    { id: 'generate-qr', label: 'QR Code', icon: QrCode },
    { id: 'scan', label: 'Scan', icon: Camera },
    { id: 'orders', label: 'Reports', icon: ClipboardList },
    { id: 'hourly-reports', label: 'Hourly Reports', icon: ClipboardList },
    { id: 'rejections', label: 'Rejections', icon: AlertCircle },
    { id: 'history', label: 'History', icon: History },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const factory = user?.user_metadata?.factory || 'Pioneer Group';

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
      {/* Sidebar - Desktop Only */}
      <aside className="w-48 bg-slate-900 text-white flex flex-col hidden md:flex shadow-xl">
        <div className="p-2.5 flex items-center space-x-2 bg-slate-950">
          <img 
            src="/pioneer-logo.png" 
            alt="Pioneer Group" 
            className="w-5 h-5 rounded object-contain bg-white" 
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
          <div className="w-5 h-5 bg-blue-500 rounded flex items-center justify-center font-bold text-white hidden">
            <Building2 size={12} />
          </div>
          <h1 className="text-sm font-bold tracking-tight text-white line-clamp-1">Garments Track</h1>
        </div>
        
        <nav className="flex-1 mt-2 px-1.5 space-y-0.5 overflow-y-auto custom-scrollbar">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center space-x-2 px-2 py-1.5 rounded-lg transition-all duration-200 ${
                activeTab === item.id 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <item.icon size={14} />
              <span className="font-medium text-[11px]">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-2 border-t border-slate-800 space-y-1.5">
          <div className="flex items-center space-x-2 px-2 py-1 bg-slate-800/50 rounded-lg">
            <div className="w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center shrink-0">
              <User size={10} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium truncate uppercase">{userName}</p>
              <p className="text-[8px] text-slate-500 truncate uppercase mt-0.5">{factory}</p>
            </div>
          </div>
          
          <button 
            onClick={handleLogout}
            className="w-full flex items-center space-x-2 px-2 py-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 transition-all font-black uppercase text-[8px] tracking-widest"
          >
            <LogOut size={12} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-auto pb-20 md:pb-0">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-8 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center space-x-2 md:hidden">
             <img 
               src="/pioneer-logo.png" 
               alt="Logo" 
               className="w-6 h-6 object-contain bg-white rounded" 
               onError={(e) => {
                 e.currentTarget.style.display = 'none';
                 e.currentTarget.nextElementSibling?.classList.remove('hidden');
               }}
             />
             <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center font-bold text-white hidden">
               <Building2 size={12} />
             </div>
             <h2 className="text-sm font-bold text-slate-900 uppercase tracking-tight">PG Tracker</h2>
          </div>
          <h2 className="text-sm md:text-lg font-semibold text-gray-800 capitalize hidden md:block">
            {menuItems.find(item => item.id === activeTab)?.label || activeTab.replace('-', ' ')}
          </h2>
          <div className="flex items-center space-x-3 md:space-x-4 text-right">
            <div className="flex flex-col items-end">
              <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Active Factory</span>
              <div className="bg-slate-900 text-white px-2.5 md:px-5 py-1 md:py-2 rounded-lg md:rounded-xl text-[9px] md:text-xs font-black border border-slate-700 uppercase tracking-wider flex items-center gap-1.5 md:gap-2 shadow-lg shadow-slate-200 max-w-[120px] md:max-w-none">
                <div className="w-1 md:w-1.5 h-1 md:h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="truncate">{factory}</span>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="md:hidden p-2 text-slate-400 hover:text-rose-500 transition-colors"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <div className="p-4 md:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center h-16 z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center justify-center space-y-1 w-full h-full relative transition-colors duration-200 ${
              activeTab === item.id 
              ? 'text-blue-600' 
              : 'text-gray-400'
            }`}
          >
            <item.icon size={20} />
            <span className="text-[10px] font-bold uppercase tracking-tight">{item.label}</span>
            {activeTab === item.id && (
              <motion.span 
                layoutId="activeTab"
                className="absolute bottom-1 w-1 h-1 bg-blue-600 rounded-full"
              />
            )}
          </button>
        ))}
      </nav>
    </div>
  );
};

export default Layout;

