import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';

const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const sizeMap = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <AnimatePresence>
      {isOpen && (
        /* On mobile: full screen with small padding; on desktop: centered with generous padding */
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-violet-950/40 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={`relative w-full ${sizeMap[size]} bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl border border-violet-100 z-10 overflow-hidden
              max-h-[95dvh] sm:max-h-[90vh] flex flex-col`}>
            {/* Header — fixed height, never scrolls */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-white flex-shrink-0">
              <h2 className="text-base sm:text-lg font-bold text-violet-900 truncate pr-2">{title}</h2>
              <button onClick={onClose}
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-violet-100 text-violet-500 hover:text-violet-700 transition-colors text-xl leading-none">
                ×
              </button>
            </div>
            {/* Body — scrollable, fills remaining space */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 overscroll-contain">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default Modal;
