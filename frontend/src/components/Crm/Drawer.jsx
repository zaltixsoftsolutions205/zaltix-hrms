import { AnimatePresence, motion } from 'framer-motion';

const WIDTHS = { md: 'max-w-md', lg: 'max-w-xl', xl: 'max-w-2xl' };

// New reusable primitive — the project only had a center-screen Modal
// before this. Built to match Modal's visual language (rounded corners,
// violet border/shadow tokens) so it doesn't look like a foreign import.
const Drawer = ({ isOpen, onClose, title, subtitle, size = 'lg', children, footer }) => (
    <AnimatePresence>
        {isOpen && (
            <>
                <motion.div
                    className="fixed inset-0 bg-violet-950/30 backdrop-blur-[2px] z-40"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={onClose}
                />
                <motion.div
                    className={`fixed inset-y-0 right-0 w-full ${WIDTHS[size] || WIDTHS.lg} bg-white z-50 shadow-2xl border-l border-violet-100 flex flex-col`}
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', stiffness: 320, damping: 34 }}
                >
                    <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-violet-100 flex-shrink-0">
                        <div className="min-w-0">
                            <h3 className="font-bold text-violet-900 truncate">{title}</h3>
                            {subtitle && <p className="text-xs text-violet-400 mt-0.5 truncate">{subtitle}</p>}
                        </div>
                        <button
                            onClick={onClose}
                            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-violet-400 hover:bg-violet-50 hover:text-violet-700 transition-colors"
                            aria-label="Close"
                        >
                            ✕
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
                    {footer && <div className="flex-shrink-0 px-5 py-4 border-t border-violet-100">{footer}</div>}
                </motion.div>
            </>
        )}
    </AnimatePresence>
);

export default Drawer;