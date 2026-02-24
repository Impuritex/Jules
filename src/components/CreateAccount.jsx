import React, { useState } from 'react';

const CreateAccount = ({ onCreated }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [duressPassword, setDuressPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }
    if (duressPassword && duressPassword === password) {
       setError('Duress password cannot be the same as master password');
       return;
    }

    // Pass duress password
    const result = await window.electron.createAccount(password, duressPassword || null);
    if (result.success) {
      onCreated();
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-900 text-white p-4">
      <div className="w-full max-w-md p-8 bg-neutral-800 rounded-xl shadow-2xl border border-neutral-700">
        <h2 className="text-3xl font-bold mb-6 text-center text-indigo-400">Setup Account</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Master Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-neutral-900 border border-neutral-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-200"
              placeholder="Create a strong password"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 bg-neutral-900 border border-neutral-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-200"
              placeholder="Confirm your password"
            />
          </div>

          <div>
             <label className="block text-sm font-medium text-red-400 mb-2">Duress Password (Optional)</label>
             <input
               type="password"
               value={duressPassword}
               onChange={(e) => setDuressPassword(e.target.value)}
               className="w-full px-4 py-3 bg-neutral-900 border border-red-900/50 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none transition-all duration-200"
               placeholder="Secret decoy password"
             />
             <p className="text-xs text-gray-500 mt-1">
               Entering this password will unlock a fake vault with decoy data.
             </p>
          </div>

          {error && <p className="text-red-500 text-sm text-center font-medium">{error}</p>}

          <button
            type="submit"
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-semibold transition-colors duration-200 shadow-lg"
          >
            Create Vault
          </button>
        </form>
      </div>
    </div>
  );
};

export default CreateAccount;
