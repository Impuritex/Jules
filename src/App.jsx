import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Login from './components/Login';
import CreateAccount from './components/CreateAccount';
import Dashboard from './components/Dashboard';

const App = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasAccount, setHasAccount] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [numLockPresses, setNumLockPresses] = useState([]);

  useEffect(() => {
    const checkAccount = async () => {
      try {
        const exists = await window.electron.checkAccountExists();
        setHasAccount(exists);
      } catch (err) {
        console.error('Failed to check account:', err);
      } finally {
        setIsLoading(false);
      }
    };

    checkAccount();

    window.electron.onBlur(() => setShowOverlay(true));
    window.electron.onFocus(() => setShowOverlay(false));
    window.electron.onWiped(() => {
        alert('Data wiped due to security breach.');
        window.location.reload();
    });

    const handleKeyDown = async (e) => {
      if (e.key === 'NumLock') {
        const isRhythmMatched = await window.electron.checkNumLockRhythm();
        if (isRhythmMatched) {
            if (window.confirm('WIPE ALERT! Are you sure you want to wipe everything?')) {
              window.electron.wipeData();
            }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };

  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-900 text-white">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-t-indigo-500 border-neutral-700 rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-gray-900 via-neutral-900 to-black min-h-screen text-white relative overflow-hidden">
      <AnimatePresence mode="wait">
        {showOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-xl"
          >
            <div className="text-center">
              <span className="text-6xl mb-4 block">🔒</span>
              <h1 className="text-3xl font-bold text-gray-400">Locked</h1>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {!hasAccount ? (
          <motion.div key="create-account" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
             <CreateAccount onCreated={() => setHasAccount(true)} />
          </motion.div>
        ) : !isLoggedIn ? (
          <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
             <Login onLogin={() => setIsLoggedIn(true)} />
          </motion.div>
        ) : (
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
             <Dashboard onLogout={() => setIsLoggedIn(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
