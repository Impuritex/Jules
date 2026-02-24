import React, { useState } from 'react';
import { motion } from 'framer-motion';

const Login = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const result = await window.electron.login(password);
    if (result.success) {
      onLogin();
    } else {
      setError(result.error);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      if (result.wiped) {
        alert('Security Breach Detected. Data Wiped.');
        window.location.reload();
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-900 text-white p-4">
      <motion.div
        animate={isShaking ? { x: [-10, 10, -10, 10, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md p-8 bg-neutral-800 rounded-xl shadow-2xl border border-neutral-700"
      >
        <h2 className="text-3xl font-bold mb-6 text-center text-indigo-400">Secure Notes</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-neutral-900 border border-neutral-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-200"
              placeholder="Enter your password"
              autoFocus
            />
          </div>
          {error && <p className="text-red-500 text-sm text-center font-medium">{error}</p>}
          <button
            type="submit"
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-semibold transition-colors duration-200 shadow-lg"
          >
            Unlock
          </button>
        </form>
      </motion.div>
    </div>
  );
};

export default Login;
