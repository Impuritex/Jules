const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  checkAccountExists: () => ipcRenderer.invoke('check-account-exists'),
  createAccount: (password, duressPassword) => ipcRenderer.invoke('create-account', password, duressPassword),
  login: (password, isNumLockActive) => ipcRenderer.invoke('login', password, isNumLockActive),
  loadNotes: () => ipcRenderer.invoke('load-notes'),
  saveNotes: (notes) => ipcRenderer.invoke('save-notes', notes),
  activityDetected: () => ipcRenderer.invoke('activity-detected'),
  wipeData: () => ipcRenderer.invoke('wipe-data'),
  verifyNotePassword: (noteId, password) => ipcRenderer.invoke('verify-note-password', noteId, password),
  exportNote: (noteId, password) => ipcRenderer.invoke('export-note', { noteId, password }),
  importNote: (password) => ipcRenderer.invoke('import-note', password),
  changePassword: (oldPassword, newPassword) => ipcRenderer.invoke('change-password', oldPassword, newPassword),

  checkNumLockRhythm: () => ipcRenderer.invoke('check-numlock-rhythm'),
  resetNumLockRhythm: () => ipcRenderer.invoke('reset-numlock-rhythm'),

  onWiped: (callback) => {
      const subscription = (event, ...args) => callback(...args);
      ipcRenderer.on('wiped', subscription);
      return () => ipcRenderer.removeListener('wiped', subscription);
  },
  onBlur: (callback) => {
      const subscription = (event, ...args) => callback(...args);
      ipcRenderer.on('blur-app', subscription);
      return () => ipcRenderer.removeListener('blur-app', subscription);
  },
  onFocus: (callback) => {
      const subscription = (event, ...args) => callback(...args);
      ipcRenderer.on('focus-app', subscription);
      return () => ipcRenderer.removeListener('focus-app', subscription);
  },
});
