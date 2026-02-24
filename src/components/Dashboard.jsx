import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { FaPlus, FaTrash, FaSignOutAlt, FaSave, FaCopy, FaBell } from 'react-icons/fa';

const Dashboard = ({ onLogout }) => {
  const [notes, setNotes] = useState([]);
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const [isReminderOpen, setIsReminderOpen] = useState(false);
  const [reminderTime, setReminderTime] = useState('');
  const scheduledReminders = useRef(new Set());

  useEffect(() => {
    loadNotes();
    if (Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }, []);

  const loadNotes = async () => {
    try {
      const loadedNotes = await window.electron.loadNotes();
      setNotes(loadedNotes || []);
      if (loadedNotes && loadedNotes.length > 0) {
        setSelectedNoteId(loadedNotes[0].id);
      }
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
      content: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updatedNotes = [newNote, ...notes];
    setNotes(updatedNotes);
    setSelectedNoteId(newNote.id);
    saveNotesToDisk(updatedNotes);
  };

  const handleDeleteNote = (e, id) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this note?')) {
      const updatedNotes = notes.filter(n => n.id !== id);
      setNotes(updatedNotes);
      if (selectedNoteId === id) {
        setSelectedNoteId(updatedNotes.length > 0 ? updatedNotes[0].id : null);
      }
      saveNotesToDisk(updatedNotes);
    }
  };

  const handleUpdateNote = (field, value) => {
    const updatedNotes = notes.map(note => {
      if (note.id === selectedNoteId) {
        return { ...note, [field]: value, updatedAt: new Date().toISOString() };
      }
      return note;
    });
    setNotes(updatedNotes);
    // Debounce save? For now, manual save or auto-save on change?
    // Let's autosave with debounce or just on blur?
    // The prompt implies secure notes. "Auto-disintegration (requires manual refresh)".
    // I'll stick to manual save button or auto-save on change.
    // To keep it simple and robust, I'll save on change but maybe throttled?
    // For now, I'll add a save button or save on unmount/change note.
    // Actually, `handleUpdateNote` is called on every keystroke. I shouldn't save to disk every keystroke due to encryption overhead.
    // I'll add a save button and maybe a periodic autosave.
  };

  // Autosave effect
  useEffect(() => {
    const timer = setTimeout(() => {
        if (notes.length > 0) {
            window.electron.saveNotes(notes).catch(console.error);
        }
    }, 2000);
    return () => clearTimeout(timer);
  }, [notes]);

  // Schedule reminders
  useEffect(() => {
    notes.forEach(note => {
        if (note.reminders) {
            note.reminders.forEach(r => {
                const delay = new Date(r.time) - new Date();
                if (delay > 0 && !scheduledReminders.current.has(r.id)) {
                     scheduledReminders.current.add(r.id);
                     setTimeout(() => {
                         new Notification('Secure Notes Reminder', { body: `Note: ${note.title}` });
                     }, delay);
                }
            });
        }
    });
  }, [notes]);

  const handleAddReminder = () => {
    if (!reminderTime || !selectedNoteId) return;
    const time = new Date(reminderTime).toISOString();
    const newReminder = { id: uuidv4(), time };

    const updatedNotes = notes.map(n => {
        if (n.id === selectedNoteId) {
            const reminders = n.reminders ? [...n.reminders, newReminder] : [newReminder];
            return { ...n, reminders, updatedAt: new Date().toISOString() };
        }
        return n;
    });
    setNotes(updatedNotes);
    setIsReminderOpen(false);
    setReminderTime('');
    setStatusMessage('Reminder set');
  };

  const handleCopy = () => {
    if (selectedNote) {
      navigator.clipboard.writeText(selectedNote.content);
      setStatusMessage('Copied. Clears in 30s.');

      setTimeout(() => {
        navigator.clipboard.writeText('');
        setStatusMessage('Clipboard cleared.');
        setTimeout(() => setStatusMessage(''), 2000);
      }, 30000);
    }
  };

  const selectedNote = notes.find(n => n.id === selectedNoteId);

  return (
    <div className="flex h-screen bg-neutral-900 text-white overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-neutral-800 border-r border-neutral-700 flex flex-col">
        <div className="p-4 border-b border-neutral-700 flex justify-between items-center bg-neutral-800 z-10">
          <h2 className="text-xl font-bold text-gray-200">My Notes</h2>
          <button
            onClick={handleAddNote}
            className="p-2 bg-indigo-600 hover:bg-indigo-700 rounded-full transition-colors"
            title="New Note"
          >
            <FaPlus size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {notes.map(note => (
            <div
              key={note.id}
              onClick={() => setSelectedNoteId(note.id)}
              className={`p-4 border-b border-neutral-700 cursor-pointer hover:bg-neutral-700 transition-colors relative group ${
                selectedNoteId === note.id ? 'bg-neutral-700 border-l-4 border-l-indigo-500' : ''
              }`}
            >
              <h3 className="font-semibold truncate pr-6">{note.title || 'Untitled'}</h3>
              <p className="text-xs text-gray-400 mt-1">
                {format(new Date(note.updatedAt), 'MMM d, yyyy HH:mm')}
              </p>
              <button
                onClick={(e) => handleDeleteNote(e, note.id)}
                className="absolute right-2 top-4 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity p-1"
                title="Delete"
              >
                <FaTrash size={12} />
              </button>
            </div>
          ))}

          {notes.length === 0 && (
            <div className="p-8 text-center text-gray-500 text-sm">
              No notes yet. Click + to create one.
            </div>
          )}
        </div>

        <div className="p-4 border-t border-neutral-700">
           <button
             onClick={onLogout}
             className="w-full flex items-center justify-center space-x-2 py-2 bg-neutral-700 hover:bg-neutral-600 rounded text-sm transition-colors"
           >
             <FaSignOutAlt />
             <span>Lock Vault</span>
           </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col bg-neutral-900">
        {selectedNote ? (
          <>
            <div className="p-6 border-b border-neutral-800 flex justify-between items-center">
              <input
                type="text"
                value={selectedNote.title}
                onChange={(e) => handleUpdateNote('title', e.target.value)}
                className="bg-transparent text-3xl font-bold focus:outline-none w-full placeholder-gray-600"
                placeholder="Note Title"
              />
              <div className="flex items-center space-x-4 text-sm text-gray-400">
                 <span>{statusMessage}</span>
                 <button
                   onClick={handleCopy}
                   className="p-2 bg-neutral-700 hover:bg-neutral-600 rounded-full transition-colors text-white"
                   title="Copy Content"
                 >
                   <FaCopy size={14} />
                 </button>

                 <div className="relative">
                   <button
                     onClick={() => setIsReminderOpen(!isReminderOpen)}
                     className="p-2 bg-neutral-700 hover:bg-neutral-600 rounded-full transition-colors text-white"
                     title="Set Reminder"
                   >
                     <FaBell size={14} />
                   </button>
                   {isReminderOpen && (
                     <div className="absolute right-0 top-10 bg-neutral-800 border border-neutral-600 p-4 rounded shadow-xl z-50 w-64">
                       <h4 className="text-sm font-bold mb-2">Set Reminder</h4>
                       <input
                         type="datetime-local"
                         className="w-full bg-neutral-900 border border-neutral-600 rounded px-2 py-1 mb-2 text-sm"
                         value={reminderTime}
                         onChange={(e) => setReminderTime(e.target.value)}
                       />
                       <button
                         onClick={handleAddReminder}
                         className="w-full bg-indigo-600 hover:bg-indigo-700 py-1 rounded text-sm"
                       >
                         Set
                       </button>
                     </div>
                   )}
                 </div>
              </div>
            </div>
            <textarea
              value={selectedNote.content}
              onChange={(e) => handleUpdateNote('content', e.target.value)}
              className="flex-1 w-full bg-transparent p-6 resize-none focus:outline-none text-gray-300 leading-relaxed text-lg"
              placeholder="Start typing..."
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-600">
            Select a note or create a new one
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
