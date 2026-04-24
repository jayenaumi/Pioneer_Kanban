import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  type?: 'info' | 'warning' | 'success' | 'error';
  confirmLabel?: string;
  onConfirm?: (password?: string) => void;
  showPasswordInput?: boolean;
}

const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  type = 'info',
  confirmLabel,
  onConfirm,
  showPasswordInput
}) => {
  const [password, setPassword] = React.useState('');

  const icons = {
    info: <Info className="text-blue-500" size={24} />,
    warning: <AlertTriangle className="text-amber-500" size={24} />,
    success: <CheckCircle2 className="text-emerald-500" size={24} />,
    error: <X className="text-rose-500" size={24} />,
  };

  React.useEffect(() => {
    if (!isOpen) setPassword('');
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-100"
          >
            <div className="p-8">
              <div className="flex items-center space-x-4 mb-6">
                <div className="p-3 bg-slate-50 rounded-2xl">
                  {icons[type]}
                </div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">{title}</h3>
              </div>
              
              <div className="text-slate-600 font-medium leading-relaxed mb-6">
                {children}
              </div>

              {showPasswordInput && (
                <div className="mb-8">
                  <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block">Enter Password</label>
                  <input 
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-center text-xl font-black tracking-[0.5em] outline-none focus:border-indigo-500 transition-all"
                    autoFocus
                  />
                </div>
              )}

              <div className="flex space-x-4">
                <button
                  onClick={onClose}
                  className="flex-1 px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-[10px] hover:bg-slate-200 transition-colors"
                >
                  {onConfirm ? 'Cancel' : 'Close'}
                </button>
                {onConfirm && (
                  <button
                    onClick={() => {
                      onConfirm(password);
                      onClose();
                    }}
                    className={`flex-1 px-6 py-4 text-white rounded-2xl font-black uppercase text-[10px] transition-all shadow-lg active:scale-95 ${
                      type === 'warning' ? 'bg-amber-600 hover:bg-amber-700' : 
                      type === 'error' ? 'bg-rose-600 hover:bg-rose-700' : 
                      'bg-indigo-600 hover:bg-indigo-700'
                    }`}
                  >
                    {confirmLabel || 'Confirm'}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default Modal;
