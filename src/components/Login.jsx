import React, { useState } from 'react';
import { motion } from 'framer-motion';

const Login = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState(null);
  const [isShaking, setIsShaking] = useState(false);
  const [numLockState, setNumLockState] = useState(false);

  const checkNumLock = (e) => {
    if (e.getModifierState) {
      setNumLockState(e.getModifierState('NumLock'));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    let currentNumLock = numLockState;
    if (e.getModifierState) {
        currentNumLock = e.getModifierState('NumLock');
    }

    const result = await window.electron.login(password, currentNumLock);
    if (result.success) {
      onLogin();
    } else {
      setError(result.error);
      setRemaining(result.remaining);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      if (result.wiped) {
        alert('Security Breach Detected. Data Wiped.');
        window.location.reload();
      }
    }
  };

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-neutral-900 to-black text-white p-4"
      onKeyDown={checkNumLock}
      onKeyUp={checkNumLock}
      onClick={checkNumLock}
    >
      <motion.div
        animate={isShaking ? { x: [-10, 10, -10, 10, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md p-8 bg-black/40 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10"
      >
        <h2 className="text-3xl font-bold mb-6 text-center text-white/90 drop-shadow-md">Secure Notes</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 focus:outline-none transition-all duration-200 text-white placeholder-gray-500 backdrop-blur-sm"
              placeholder="Enter your password"
              autoFocus
            />
          </div>
          {error && (
            <div className="text-center space-y-1">
                <p className="text-red-500 text-sm font-medium">{error}</p>
                {remaining !== undefined && remaining !== null && (
                    <p className="text-orange-400 text-xs">Attempts remaining: {remaining}</p>
                )}
            </div>
          )}
          {/* Hidden NumLock check */}
          <button
            type="submit"
            className="w-full py-3 bg-indigo-600/80 hover:bg-indigo-700/80 rounded-lg font-semibold transition-colors duration-200 shadow-lg border border-indigo-500/30 backdrop-blur-sm"
          >
            Unlock
          </button>
        </form>
      </motion.div>
    </div>
  );
};

export default Login;
