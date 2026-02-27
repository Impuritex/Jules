import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { FaPlus, FaTrash, FaSignOutAlt, FaLock, FaCog, FaImage, FaTimes, FaFileExport, FaSync, FaKey } from 'react-icons/fa';

const AutoTextarea = ({ value, onChange, onKeyDown, placeholder, autoFocus, id, setRef }) => {
  const textareaRef = useRef(null);

  useLayoutEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'inherit';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.max(scrollHeight, 24)}px`;
    }
  }, [value]);

  useEffect(() => {
      if (setRef) setRef(id, textareaRef.current);
  }, [id, setRef]);

  useEffect(() => {
      if (autoFocus && textareaRef.current) {
          textareaRef.current.focus();
      }
  }, [autoFocus]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className="w-full bg-transparent resize-none focus:outline-none text-gray-300 leading-relaxed text-lg overflow-hidden py-1"
      rows={1}
      style={{ minHeight: '24px' }}
    />
  );
};

const Dashboard = ({ onLogout }) => {
  const [notes, setNotes] = useState([]);
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Security Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsNoteId, setSettingsNoteId] = useState(null);
  const [notePassword, setNotePassword] = useState('');
  const [exportable, setExportable] = useState(true);
  const [validityDuration, setValidityDuration] = useState(''); // Hours
  const [accessTimerLimit, setAccessTimerLimit] = useState(15);

  // Password Change Modal
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [changePassData, setChangePassData] = useState({ old: '', new: '', confirm: '' });

  // Unlock State
  const [unlockNoteId, setUnlockNoteId] = useState(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockTimeLeft, setUnlockTimeLeft] = useState(null);
  const [unlockedNotes, setUnlockedNotes] = useState(new Set());

  const unlockTimerRef = useRef(null);
  const blockRefs = useRef(new Map());

  useEffect(() => {
    loadNotes();

    // Memory Cleansing & Refresh
    const handleBlur = () => {
        setNotes([]);
        setSelectedNoteId(null);
        setUnlockedNotes(new Set()); // Lock all notes
    };
    const handleFocus = () => {
        loadNotes();
    };

    const cleanBlur = window.electron.onBlur(handleBlur);
    const cleanFocus = window.electron.onFocus(handleFocus);

    return () => {
        if (cleanBlur) cleanBlur();
        if (cleanFocus) cleanFocus();
    };
  }, []);

  useEffect(() => {
      return () => {
          if (unlockTimerRef.current) clearInterval(unlockTimerRef.current);
      };
  }, []);

  const loadNotes = async () => {
    try {
      const loadedNotes = await window.electron.loadNotes();
      const processedNotes = (loadedNotes || []).map(note => {
          if (typeof note.content === 'string') {
              return { ...note, content: [{ id: uuidv4(), type: 'text', data: note.content }] };
          }
          return note;
      });
      setNotes(processedNotes);
    } catch (err) {
      console.error('Failed to load notes', err);
    }
  };

  const saveNotesToDisk = async (updatedNotes) => {
    setIsSaving(true);
    setStatusMessage('Saving...');
    try {
      await window.electron.saveNotes(updatedNotes);
      setStatusMessage('Saved');
      setTimeout(() => setStatusMessage(''), 2000);
    } catch (err) {
      console.error('Failed to save', err);
      setStatusMessage('Error saving');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddNote = () => {
    const newNote = {
      id: uuidv4(),
      title: 'New Note',
      content: [{ id: uuidv4(), type: 'text', data: '' }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      security: {
          exportable: true,
          accessTimer: 15
      }
    };
    const updatedNotes = [newNote, ...notes];
    setNotes(updatedNotes);
    handleSelectNote(newNote.id);
    saveNotesToDisk(updatedNotes);
  };

  const handleDeleteNote = (e, id) => {
    if (e) e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this note?')) {
      deleteNote(id);
    }
  };

  const deleteNote = (id) => {
      const updatedNotes = notes.filter(n => n.id !== id);
      setNotes(updatedNotes);
      if (selectedNoteId === id) {
        setSelectedNoteId(null);
        setUnlockNoteId(null);
      }
      saveNotesToDisk(updatedNotes);
  };

  const handleUpdateNoteTitle = (value) => {
    const updatedNotes = notes.map(note => {
      if (note.id === selectedNoteId) {
        return { ...note, title: value, updatedAt: new Date().toISOString() };
      }
      return note;
    });
    setNotes(updatedNotes);
  };

  const updateNoteContent = (newContent) => {
      const updatedNotes = notes.map(n => n.id === selectedNoteId ? { ...n, content: newContent, updatedAt: new Date().toISOString() } : n);
      setNotes(updatedNotes);
  };

  const handleUpdateBlock = (blockId, value) => {
      const updatedNotes = notes.map(note => {
          if (note.id === selectedNoteId) {
              const newContent = note.content.map(block => {
                  if (block.id === blockId) {
                      return { ...block, data: value };
                  }
                  return block;
              });
              return { ...note, content: newContent, updatedAt: new Date().toISOString() };
          }
          return note;
      });
      setNotes(updatedNotes);
  };

  const handleBlockKeyDown = (e, blockId, index) => {
        if (!selectedNote) return;

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const block = selectedNote.content[index];
            const cursorPosition = e.target.selectionStart;
            const textBefore = block.data.slice(0, cursorPosition);
            const textAfter = block.data.slice(cursorPosition);

            // Update current block
            const updatedContent = [...selectedNote.content];
            updatedContent[index] = { ...block, data: textBefore };

            // Create new block
            const newBlock = { id: uuidv4(), type: 'text', data: textAfter };
            updatedContent.splice(index + 1, 0, newBlock);

            updateNoteContent(updatedContent);

            // Focus new block
            setTimeout(() => {
                const el = blockRefs.current.get(newBlock.id);
                if (el) {
                    el.focus();
                    el.setSelectionRange(0, 0);
                }
            }, 0);
        } else if (e.key === 'Backspace' && e.target.selectionStart === 0 && e.target.selectionEnd === 0 && index > 0) {
             const currentBlock = selectedNote.content[index];
             const prevBlock = selectedNote.content[index - 1];

             if (prevBlock.type === 'text') {
                 e.preventDefault();
                 const prevLength = prevBlock.data.length;
                 const updatedContent = [...selectedNote.content];
                 updatedContent[index - 1] = { ...prevBlock, data: prevBlock.data + currentBlock.data };
                 updatedContent.splice(index, 1);

                 updateNoteContent(updatedContent);
                 setTimeout(() => {
                    const el = blockRefs.current.get(prevBlock.id);
                    if (el) {
                        el.focus();
                        el.setSelectionRange(prevLength, prevLength);
                    }
                 }, 0);
             }
        } else if (e.key === 'ArrowUp' && index > 0) {
            const prevBlock = selectedNote.content[index - 1];
             if (prevBlock.type === 'text' && e.target.selectionStart === 0) {
                 e.preventDefault();
                 const el = blockRefs.current.get(prevBlock.id);
                 if (el) {
                     el.focus();
                     const len = el.value.length;
                     el.setSelectionRange(len, len);
                 }
             }
        } else if (e.key === 'ArrowDown' && index < selectedNote.content.length - 1) {
             const nextBlock = selectedNote.content[index + 1];
             if (nextBlock.type === 'text' && e.target.selectionStart === e.target.value.length) {
                 e.preventDefault();
                 const el = blockRefs.current.get(nextBlock.id);
                 if (el) {
                     el.focus();
                     el.setSelectionRange(0, 0);
                 }
             }
        }
    };

  const handleAddImageBlock = async () => {
      try {
          const clipboardItems = await navigator.clipboard.read();
          for (const item of clipboardItems) {
              if (item.types.some(type => type.startsWith('image/'))) {
                  const blob = await item.getType(item.types.find(type => type.startsWith('image/')));
                  const reader = new FileReader();
                  reader.onload = (e) => {
                      const base64 = e.target.result;
                      // Sanitize: ensure it starts with data:image
                      if (base64.startsWith('data:image')) {
                          addBlock('image', base64);
                      } else {
                          alert('Invalid image format');
                      }
                  };
                  reader.readAsDataURL(blob);
                  return;
              }
          }
          alert('No image in clipboard');
      } catch (err) {
          console.error('Clipboard read failed', err);
          alert('Failed to read clipboard image. Please ensure you have copied an image.');
      }
  };

  const addBlock = (type, data = '') => {
      const updatedNotes = notes.map(note => {
          if (note.id === selectedNoteId) {
              return {
                  ...note,
                  content: [...note.content, { id: uuidv4(), type, data }],
                  updatedAt: new Date().toISOString()
              };
          }
          return note;
      });
      setNotes(updatedNotes);
  };

  const handleSelectNote = (id) => {
      const note = notes.find(n => n.id === id);
      if (!note) return;

      if (note.security && note.security.password && !unlockedNotes.has(id)) {
          setUnlockNoteId(id);
          setUnlockPassword('');
          setUnlockTimeLeft(note.security.accessTimer || 15);
          if (unlockTimerRef.current) clearInterval(unlockTimerRef.current);
          unlockTimerRef.current = setInterval(() => {
              setUnlockTimeLeft(prev => {
                  if (prev <= 1) {
                      clearInterval(unlockTimerRef.current);
                      deleteNote(id);
                      setUnlockNoteId(null);
                      alert('Access time expired. Note wiped.');
                      return 0;
                  }
                  return prev - 1;
              });
          }, 1000);
      } else {
          setSelectedNoteId(id);
          setUnlockNoteId(null);
          if (unlockTimerRef.current) clearInterval(unlockTimerRef.current);
      }
  };

  const handleUnlockSubmit = async (e) => {
      e.preventDefault();
      try {
          const result = await window.electron.verifyNotePassword(unlockNoteId, unlockPassword);
          if (result.success) {
              if (unlockTimerRef.current) clearInterval(unlockTimerRef.current);
              setUnlockedNotes(prev => new Set(prev).add(unlockNoteId));
              setSelectedNoteId(unlockNoteId);
              setUnlockNoteId(null);
          } else {
              alert('Incorrect password. Security breach protocol initiated.');
              window.location.reload();
          }
      } catch (err) {
          console.error(err);
          alert('Error unlocking note');
      }
  };

  const handleOpenSettings = () => {
      const note = notes.find(n => n.id === selectedNoteId);
      if (!note) return;
      setSettingsNoteId(selectedNoteId);
      setExportable(note.security?.exportable ?? true);
      setValidityDuration(note.security?.validityDuration || '');
      setAccessTimerLimit(note.security?.accessTimer || 15);
      setNotePassword('');
      setIsSettingsOpen(true);
  };

  const handleSaveSettings = async () => {
      const updatedNotes = notes.map(note => {
          if (note.id === settingsNoteId) {
              const security = {
                  ...note.security,
                  exportable,
                  validityDuration: validityDuration ? parseInt(validityDuration) : null,
                  lastRefreshedAt: validityDuration ? Date.now() : null, // Reset refresh on setting change
                  accessTimer: parseInt(accessTimerLimit) || 15
              };
              if (notePassword) {
                  security.password = notePassword;
              }
              return { ...note, security, updatedAt: new Date().toISOString() };
          }
          return note;
      });
      setNotes(updatedNotes);
      saveNotesToDisk(updatedNotes);
      setIsSettingsOpen(false);
  };

  const handleRefreshValidity = () => {
      if (!selectedNoteId) return;
      const updatedNotes = notes.map(note => {
          if (note.id === selectedNoteId && note.security?.validityDuration) {
              return {
                  ...note,
                  security: { ...note.security, lastRefreshedAt: Date.now() },
                  updatedAt: new Date().toISOString()
              };
          }
          return note;
      });
      setNotes(updatedNotes);
      saveNotesToDisk(updatedNotes);
      setStatusMessage('Validity Refreshed');
      setTimeout(() => setStatusMessage(''), 2000);
  };

  const handleExport = async () => {
     if (!selectedNoteId) return;
     const note = notes.find(n => n.id === selectedNoteId);
     if (note.security && note.security.exportable === false) {
         alert('This note is not exportable.');
         return;
     }
     const password = prompt('Enter a password to encrypt this export:');
     if (!password) return;

     const result = await window.electron.exportNote(selectedNoteId, password);
     if (result.success) {
         setStatusMessage('Exported');
     } else {
         alert(result.error);
     }
  };

  const handleChangePasswordSubmit = async (e) => {
      e.preventDefault();
      if (changePassData.new !== changePassData.confirm) {
          alert('New passwords do not match');
          return;
      }
      if (changePassData.new.length < 1) {
          alert('Password cannot be empty');
          return;
      }

      const result = await window.electron.changePassword(changePassData.old, changePassData.new);
      if (result.success) {
          alert('Password changed successfully');
          setIsPasswordModalOpen(false);
          setChangePassData({ old: '', new: '', confirm: '' });
      } else {
          alert('Failed: ' + result.error);
      }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
        if (notes.length > 0) {
            window.electron.saveNotes(notes).catch(console.error);
        }
    }, 2000);
    return () => clearTimeout(timer);
  }, [notes]);

  const selectedNote = notes.find(n => n.id === selectedNoteId);

  let expirationText = null;
  if (selectedNote && selectedNote.security?.validityDuration && selectedNote.security.lastRefreshedAt) {
      const expiresAt = selectedNote.security.lastRefreshedAt + (selectedNote.security.validityDuration * 60 * 60 * 1000);
      const hoursLeft = (expiresAt - Date.now()) / (1000 * 60 * 60);
      expirationText = hoursLeft > 0 ? `${hoursLeft.toFixed(1)}h remaining` : 'Expired';
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-900 via-neutral-900 to-black text-white overflow-hidden font-sans">
      {/* Sidebar - Glassmorphism */}
      <div className="w-64 bg-black/30 backdrop-blur-md border-r border-white/10 flex flex-col">
        <div className="p-4 border-b border-white/10 flex justify-between items-center z-10">
          <h2 className="text-xl font-bold text-gray-200 tracking-wider">VAULT</h2>
          <button
            onClick={handleAddNote}
            className="p-2 bg-indigo-600/80 hover:bg-indigo-700/80 rounded-full transition-colors border border-indigo-500/30 shadow-lg backdrop-blur-sm"
            title="New Note"
          >
            <FaPlus size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {notes.map(note => (
            <div
              key={note.id}
              onClick={() => handleSelectNote(note.id)}
              className={`p-4 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors relative group ${
                selectedNoteId === note.id ? 'bg-white/10 border-l-4 border-l-indigo-500' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                  <h3 className="font-semibold truncate pr-2 flex-1 text-sm">{note.title || 'Untitled'}</h3>
                  {note.security?.password && <FaLock size={10} className="text-yellow-500/80" />}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {format(new Date(note.updatedAt), 'MMM d, HH:mm')}
              </p>
              <button
                onClick={(e) => handleDeleteNote(e, note.id)}
                className="absolute right-2 top-8 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity p-1"
                title="Delete"
              >
                <FaTrash size={12} />
              </button>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-white/10 space-y-2">
           <button
             onClick={() => setIsPasswordModalOpen(true)}
             className="w-full flex items-center justify-center space-x-2 py-2 bg-white/5 hover:bg-white/10 rounded text-sm transition-colors border border-white/5 backdrop-blur-sm"
           >
             <FaKey />
             <span>Change Password</span>
           </button>
           <button
             onClick={onLogout}
             className="w-full flex items-center justify-center space-x-2 py-2 bg-white/5 hover:bg-white/10 rounded text-sm transition-colors border border-white/5 backdrop-blur-sm"
           >
             <FaSignOutAlt />
             <span>Lock Vault</span>
           </button>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col relative bg-transparent">
        {unlockNoteId ? (
            <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-xl flex flex-col items-center justify-center">
                <div className="p-8 bg-black/40 backdrop-blur-xl rounded-xl border border-white/10 w-96 text-center shadow-2xl">
                    <FaLock size={40} className="mx-auto mb-4 text-indigo-500 drop-shadow-glow" />
                    <h2 className="text-xl font-bold mb-2 text-white">Restricted Access</h2>
                    <p className="text-red-400 text-sm mb-4 font-mono">
                        Self-Destruct in: {unlockTimeLeft}s
                    </p>
                    <form onSubmit={handleUnlockSubmit}>
                        <input
                            type="password"
                            value={unlockPassword}
                            onChange={(e) => setUnlockPassword(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 mb-4 text-white focus:outline-none focus:border-indigo-500/50 backdrop-blur-sm placeholder-gray-500"
                            placeholder="Enter Password"
                            autoFocus
                        />
                        <button type="submit" className="w-full bg-indigo-600/80 hover:bg-indigo-700/80 py-2 rounded font-bold backdrop-blur-sm border border-indigo-500/30 transition-all">
                            Authenticate
                        </button>
                    </form>
                </div>
            </div>
        ) : selectedNote ? (
          <>
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/20 backdrop-blur-sm">
              <input
                type="text"
                value={selectedNote.title}
                onChange={(e) => handleUpdateNoteTitle(e.target.value)}
                className="bg-transparent text-3xl font-bold focus:outline-none w-full placeholder-gray-600 text-white/90"
                placeholder="Note Title"
              />
              <div className="flex items-center space-x-3 text-sm text-gray-400">
                 <span className="text-xs font-mono">{statusMessage}</span>

                 {selectedNote.security?.validityDuration && (
                     <div className="flex items-center space-x-2 px-3 py-1 bg-white/5 rounded-full border border-white/5">
                         <span className="text-xs text-orange-400">{expirationText}</span>
                         <button onClick={handleRefreshValidity} className="text-indigo-400 hover:text-indigo-300" title="Refresh Validity License">
                             <FaSync size={12} />
                         </button>
                     </div>
                 )}

                 <div className="h-6 w-px bg-white/10 mx-2"></div>

                 <button onClick={handleAddImageBlock} className="p-2 bg-white/5 hover:bg-white/10 rounded-full border border-white/5 transition-colors" title="Insert Image">
                     <FaImage size={14} />
                 </button>

                 <button onClick={handleExport} className="p-2 bg-white/5 hover:bg-white/10 rounded-full border border-white/5 transition-colors" title="Export Note">
                     <FaFileExport size={14} />
                 </button>

                 <button onClick={handleOpenSettings} className="p-2 bg-white/5 hover:bg-white/10 rounded-full border border-white/5 transition-colors" title="Security Settings">
                     <FaCog size={14} />
                 </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {Array.isArray(selectedNote.content) && selectedNote.content.map((block, index) => (
                    <div key={block.id} className="relative group">
                        {block.type === 'text' ? (
                            <AutoTextarea
                                id={block.id}
                                value={block.data}
                                onChange={(e) => handleUpdateBlock(block.id, e.target.value)}
                                onKeyDown={(e) => handleBlockKeyDown(e, block.id, index)}
                                setRef={(id, el) => {
                                    if (el) blockRefs.current.set(id, el);
                                    else blockRefs.current.delete(id);
                                }}
                                placeholder={index === 0 && selectedNote.content.length === 1 ? "Start typing..." : ""}
                            />
                        ) : block.type === 'image' ? (
                            <div className="relative inline-block rounded-lg overflow-hidden border border-white/10 shadow-lg my-2">
                                <img src={block.data} alt="Note Content" className="max-w-full" />
                                <button
                                    onClick={() => {
                                        const newContent = selectedNote.content.filter(b => b.id !== block.id);
                                        const updatedNotes = notes.map(n => n.id === selectedNoteId ? { ...n, content: newContent } : n);
                                        setNotes(updatedNotes);
                                    }}
                                    className="absolute top-2 right-2 bg-red-600/80 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
                                >
                                    <FaTimes size={12} />
                                </button>
                            </div>
                        ) : null}
                    </div>
                ))}

                <div
                    className="h-32 cursor-text"
                    onClick={() => addBlock('text')}
                >
                </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 font-light tracking-widest uppercase text-sm">
            Select a secure note to view
          </div>
        )}
      </div>

      {/* Security Modal */}
      <AnimatePresence>
          {isSettingsOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-black/50 backdrop-blur-xl p-8 rounded-2xl border border-white/10 w-96 shadow-2xl relative overflow-hidden"
                  >
                      {/* Note Settings Logic... */}
                      <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>

                      <h3 className="text-xl font-bold mb-6 flex items-center text-white relative z-10"><FaLock className="mr-3 text-indigo-400"/> Security Protocols</h3>

                      <div className="space-y-5 relative z-10">
                          <div>
                              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">Per-Note Password</label>
                              <input
                                type="password"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500/50 transition-colors placeholder-gray-600"
                                placeholder="Set new password..."
                                value={notePassword}
                                onChange={(e) => setNotePassword(e.target.value)}
                              />
                              <p className="text-[10px] text-red-400 mt-1 opacity-80">Warning: Failed attempt triggers immediate wipe.</p>
                          </div>

                          <div className="flex items-center justify-between py-2 border-b border-white/5">
                              <label className="text-sm text-gray-300">Allow External Export</label>
                              <input
                                type="checkbox"
                                checked={exportable}
                                onChange={(e) => setExportable(e.target.checked)}
                                className="w-4 h-4 accent-indigo-500 bg-white/10 border-white/20 rounded"
                              />
                          </div>

                          <div>
                              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">Dead Man's Switch (Hours)</label>
                              <div className="flex items-center space-x-2">
                                  <input
                                    type="number"
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500/50"
                                    value={validityDuration}
                                    placeholder="Disabled"
                                    onChange={(e) => setValidityDuration(e.target.value)}
                                  />
                              </div>
                              <p className="text-[10px] text-gray-500 mt-1">Must be refreshed every X hours or note auto-destructs.</p>
                          </div>

                          <div>
                              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">Access Timer (Seconds)</label>
                              <input
                                type="number"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500/50"
                                value={accessTimerLimit}
                                onChange={(e) => setAccessTimerLimit(e.target.value)}
                                min="5"
                              />
                          </div>
                      </div>

                      <div className="mt-8 flex justify-end space-x-3 relative z-10">
                          <button
                            onClick={() => setIsSettingsOpen(false)}
                            className="px-4 py-2 rounded-lg text-gray-400 hover:text-white transition-colors text-sm"
                          >
                              Cancel
                          </button>
                          <button
                            onClick={handleSaveSettings}
                            className="px-6 py-2 bg-indigo-600/90 hover:bg-indigo-700/90 rounded-lg text-white font-bold text-sm shadow-lg shadow-indigo-500/20 backdrop-blur-sm transition-all"
                          >
                              Engage
                          </button>
                      </div>
                  </motion.div>
              </div>
          )}
      </AnimatePresence>

      {/* Password Change Modal */}
      <AnimatePresence>
          {isPasswordModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-black/50 backdrop-blur-xl p-8 rounded-2xl border border-white/10 w-96 shadow-2xl relative overflow-hidden"
                  >
                      <h3 className="text-xl font-bold mb-6 flex items-center text-white relative z-10"><FaKey className="mr-3 text-indigo-400"/> Change Password</h3>

                      <div className="space-y-4 relative z-10">
                          <div>
                              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">Old Password</label>
                              <input
                                type="password"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                                value={changePassData.old}
                                onChange={(e) => setChangePassData({...changePassData, old: e.target.value})}
                              />
                          </div>
                          <div>
                              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">New Password</label>
                              <input
                                type="password"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                                value={changePassData.new}
                                onChange={(e) => setChangePassData({...changePassData, new: e.target.value})}
                              />
                          </div>
                          <div>
                              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">Confirm New Password</label>
                              <input
                                type="password"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                                value={changePassData.confirm}
                                onChange={(e) => setChangePassData({...changePassData, confirm: e.target.value})}
                              />
                          </div>
                      </div>

                      <div className="mt-8 flex justify-end space-x-3 relative z-10">
                          <button
                            onClick={() => setIsPasswordModalOpen(false)}
                            className="px-4 py-2 rounded-lg text-gray-400 hover:text-white transition-colors text-sm"
                          >
                              Cancel
                          </button>
                          <button
                            onClick={handleChangePasswordSubmit}
                            className="px-6 py-2 bg-indigo-600/90 hover:bg-indigo-700/90 rounded-lg text-white font-bold text-sm shadow-lg shadow-indigo-500/20 backdrop-blur-sm transition-all"
                          >
                              Update
                          </button>
                      </div>
                  </motion.div>
              </div>
          )}
      </AnimatePresence>
    </div>
  );
};

export default Dashboard;
