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

  onWiped: (callback) => ipcRenderer.on('wiped', callback),
  onBlur: (callback) => ipcRenderer.on('blur-app', callback),
  onFocus: (callback) => ipcRenderer.on('focus-app', callback),
});
