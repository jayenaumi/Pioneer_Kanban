
import React, { useState } from 'react';
import { supabase } from '../services/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Building2, 
  Mail, 
  Lock, 
  User, 
  ArrowRight, 
  Loader2, 
  AlertCircle,
  CheckCircle2,
  X
} from 'lucide-react';

const FACTORIES = [
  {
    id: 'pioneer',
    name: 'Pioneer Apparels Limited',
    color: 'blue',
    gradient: 'from-[#001d3d] to-[#003566]'
  },
  {
    id: 'maxcom',
    name: 'Maxcom International (BD) Limited',
    color: 'orange',
    gradient: 'from-[#3d1a00] to-[#7d2d00]'
  },
  {
    id: 'alislam',
    name: 'Al-Islam Textile Limited',
    color: 'green',
    gradient: 'from-[#002211] to-[#004d26]'
  }
];

interface AuthProps {
  onSuccess: (user: any) => void;
}

const Auth: React.FC<AuthProps> = ({ onSuccess }) => {
  const [selectedFactory, setSelectedFactory] = useState<typeof FACTORIES[0] | null>(null);
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });

        if (error) throw error;

        // Ensure user metadata matches the factory they selected at login
        if (selectedFactory) {
          const { data: updatedData } = await supabase.auth.updateUser({
            data: { factory: selectedFactory.name }
          });
          onSuccess(updatedData.user || data.user);
        } else {
          onSuccess(data.user);
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              full_name: formData.name,
              factory: selectedFactory?.name
            }
          }
        });

        if (error) throw error;
        if (data.user) {
          setSuccess('Account created! Please check your email for verification if required.');
          setIsLogin(true);
        }
      }
    } catch (err: any) {
      if (err.message === 'Failed to fetch') {
        setError('Network Connection Error: Please check your internet connection and try again.');
      } else {
        setError(err.message || 'An error occurred during authentication');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#002b2b] via-[#001a1a] to-[#000d0d] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Subtle Depth Layers */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-teal-500/5 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0)_0%,rgba(0,0,0,0.4)_100%)]" />
      </div>
      
      <div className="relative z-10 w-full max-w-6xl">
        <header className="text-center mb-16">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center space-x-3 bg-white/10 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/20 mb-8"
          >
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <Building2 className="text-white" size={18} />
            </div>
            <span className="text-white font-black uppercase tracking-[0.2em] text-xs">Pioneer Group Production</span>
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl md:text-7xl font-black text-white mb-6 tracking-tighter"
          >
            Factory <span className="text-blue-400">Access Portal</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-slate-300 font-bold uppercase tracking-widest text-[10px]"
          >
            Select your manufacturing unit to proceed
          </motion.p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {FACTORIES.map((factory, index) => (
            <motion.button
              key={factory.id}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.3 + index * 0.1 }}
              whileHover={{ scale: 1.02, y: -5 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedFactory(factory)}
              className={`group relative bg-gradient-to-br ${factory.gradient} p-4 rounded-[1.5rem] shadow-2xl hover:shadow-teal-500/30 transition-all border border-white/20 text-left overflow-hidden flex flex-col h-32`}
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-8 translate-x-8 blur-2xl group-hover:scale-150 transition-transform" />
              <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none" />
              
              <div className="w-8 h-8 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center text-white mb-2 border border-white/20 group-hover:scale-110 group-hover:rotate-3 transition-transform">
                <Building2 size={16} />
              </div>

              <div className="flex-1">
                <h2 className="text-sm font-black text-white mb-1 leading-tight">
                  {factory.name}
                </h2>
              </div>

              <div className="flex items-center text-white font-black uppercase text-[8px] mt-2 tracking-widest group-hover:translate-x-2 transition-transform">
                Sign In <ArrowRight className="ml-1" size={12} />
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {selectedFactory && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedFactory(null)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 40 }}
              className="relative w-full max-w-xl bg-white rounded-[3rem] shadow-3xl overflow-hidden border border-slate-100"
            >
              {/* Modal Header */}
              <div className="relative p-10 bg-slate-50 border-b border-slate-100">
                <button 
                  onClick={() => setSelectedFactory(null)}
                  className="absolute top-8 right-8 text-slate-400 hover:text-slate-900 transition-colors"
                >
                  <X size={24} />
                </button>
                
                <div className={`w-14 h-14 bg-${selectedFactory.color}-50 rounded-2xl flex items-center justify-center text-${selectedFactory.color}-600 mb-6 border border-${selectedFactory.color}-100`}>
                  <Building2 size={28} />
                </div>
                
                <h3 className="text-3xl font-black text-slate-900 tracking-tighter leading-tight">
                  {selectedFactory.name}
                </h3>
                <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-2 overflow-hidden text-ellipsis whitespace-nowrap">
                  Manufacturing Plant Access
                </p>
              </div>

              {/* Form Area */}
              <div className="p-10">
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mb-8 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center space-x-3 text-rose-600 font-black text-[10px] uppercase tracking-wider"
                  >
                    <AlertCircle size={18} />
                    <span>{error}</span>
                  </motion.div>
                )}
                
                {success && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mb-8 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center space-x-3 text-emerald-600 font-black text-[10px] uppercase tracking-wider"
                  >
                    <CheckCircle2 size={18} />
                    <span>{success}</span>
                  </motion.div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  {!isLogin && (
                    <div className="group">
                      <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block ml-1 tracking-widest">User Name</label>
                      <div className="relative">
                        <User className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={18} />
                        <input 
                          type="text"
                          required
                          value={formData.name}
                          onChange={(e) => setFormData({...formData, name: e.target.value})}
                          placeholder="Your full name"
                          className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] pl-16 pr-8 py-5 text-sm font-bold text-slate-900 outline-none focus:border-blue-600 focus:bg-white transition-all placeholder:text-slate-300"
                        />
                      </div>
                    </div>
                  )}

                  <div className="group">
                    <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block ml-1 tracking-widest">Corporate Email</label>
                    <div className="relative">
                      <Mail className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={18} />
                      <input 
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        placeholder="email@pioneer-group.com"
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] pl-16 pr-8 py-5 text-sm font-bold text-slate-900 outline-none focus:border-blue-600 focus:bg-white transition-all placeholder:text-slate-300"
                      />
                    </div>
                  </div>

                  <div className="group">
                    <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block ml-1 tracking-widest">Security Password</label>
                    <div className="relative">
                      <Lock className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={18} />
                      <input 
                        type="password"
                        required
                        value={formData.password}
                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                        placeholder="••••••••"
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] pl-16 pr-8 py-5 text-sm font-bold text-slate-900 outline-none focus:border-blue-600 focus:bg-white transition-all placeholder:text-slate-300"
                      />
                    </div>
                  </div>

                  <button
                    disabled={isLoading}
                    className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs shadow-xl shadow-slate-200 hover:bg-blue-600 hover:shadow-blue-200 transition-all active:scale-[0.98] flex items-center justify-center space-x-3"
                  >
                    {isLoading ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      <>
                        <span>{isLogin ? 'Grant Access' : 'Register Account'}</span>
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </form>

                <div className="mt-10 text-center">
                  <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">
                    {isLogin ? "Don't have an account?" : "Already registered?"}
                    <button 
                      onClick={() => setIsLogin(!isLogin)}
                      className="ml-2 text-blue-600 hover:text-blue-700 transition-colors"
                    >
                      {isLogin ? 'Sign Up' : 'Sign In'}
                    </button>
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Auth;
