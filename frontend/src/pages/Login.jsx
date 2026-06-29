import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';
import { Toaster } from 'react-hot-toast';

const EyeIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
    <path d="M1.5 1.5l21 21" />
  </svg>
);

const Login = () => {
  const [mode, setMode] = useState('login'); // 'login' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await login(email, password);
      if (data.isFirstLogin) {
        toast.success('Welcome! Please change your password.');
        navigate('/change-password');
      } else {
        toast.success(`Welcome back, ${data.user.name}!`);
        navigate('/dashboard');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally { setLoading(false); }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      toast.success('Password reset email sent!');
      setMode('login');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send reset email');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <Toaster position="top-right" toastOptions={{
        style: { background: '#fff', border: '1px solid #DDD6FE', color: '#4C1D95', fontSize: '14px', borderRadius: '12px' },
      }} />

      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-violet-200/50 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-violet-300/30 rounded-full blur-3xl" />
      </div>

      <motion.div initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Zaltix Soft Solutions" className="h-14 mx-auto mb-3 object-contain" />
        </div>

        {/* Card */}
        <div className="bg-violet-100/80 backdrop-blur-xl border border-violet-200 rounded-3xl p-8 shadow-lg">
          {mode === 'login' ? (
            <>
              <h2 className="text-lg font-bold text-violet-900 mb-6">Sign in to your account</h2>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-violet-700 mb-1.5">Email Address</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                    className="w-full bg-white/70 border border-violet-200 rounded-xl px-4 py-3 text-violet-900 placeholder-violet-400 focus:outline-none focus:ring-2 focus:ring-golden-400 focus:border-transparent text-sm transition-all"
                    placeholder="you@company.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-violet-700 mb-1.5">Password</label>
                  <div className="relative">
                    <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                      className="w-full bg-white/70 border border-violet-200 rounded-xl px-4 py-3 pr-11 text-violet-900 placeholder-violet-400 focus:outline-none focus:ring-2 focus:ring-golden-400 focus:border-transparent text-sm transition-all"
                      placeholder="Enter your password" />
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-violet-400 hover:text-violet-700">
                      {showPass ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>
                <button type="button" onClick={() => setMode('forgot')} className="text-xs text-golden-600 hover:text-golden-700 font-medium">
                  Forgot password?
                </button>
                <motion.button type="submit" disabled={loading} whileTap={{ scale: 0.97 }}
                  className="w-full bg-golden-500 hover:bg-golden-400 text-white font-bold py-3 rounded-xl transition-all duration-200 shadow-lg hover:shadow-golden-500/30 disabled:opacity-60 mt-2">
                  {loading ? 'Signing in...' : 'Sign In'}
                </motion.button>
              </form>
            </>
          ) : (
            <>
              <button onClick={() => setMode('login')} className="flex items-center gap-2 text-violet-600 hover:text-violet-900 text-sm mb-5 transition-colors">
                ← Back to login
              </button>
              <h2 className="text-lg font-bold text-violet-900 mb-2">Reset Password</h2>
              <p className="text-violet-600 text-sm mb-6">Enter your email and we'll send you a reset link.</p>
              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-violet-700 mb-1.5">Email Address</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                    className="w-full bg-white/70 border border-violet-200 rounded-xl px-4 py-3 text-violet-900 placeholder-violet-400 focus:outline-none focus:ring-2 focus:ring-golden-400 text-sm transition-all"
                    placeholder="you@company.com" />
                </div>
                <motion.button type="submit" disabled={loading} whileTap={{ scale: 0.97 }}
                  className="w-full bg-golden-500 hover:bg-golden-400 text-white font-bold py-3 rounded-xl transition-all duration-200 shadow-lg disabled:opacity-60">
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </motion.button>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
