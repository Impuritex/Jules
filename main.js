const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_FILE = path.join(app.getPath('userData'), 'notes.enc');
const AUTH_FILE = path.join(app.getPath('userData'), 'auth.enc');

let mainWindow;
let sessionKey = null;
let isDuressSession = false;
let failedAttempts = 0;
let authIndex = -1; // To track which header slot is active

// Crypto Constants
const ALGORITHM = 'aes-256-gcm';
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const MAX_PASSWORD_LENGTH = 128;
const HEADER_PAD_LENGTH = 64; // Fixed length for opaque headers

function deriveKey(password, salt) {
  if (typeof password !== 'string') {
    throw new Error('Password must be a string');
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`Password exceeds maximum length of ${MAX_PASSWORD_LENGTH} characters`);
  }
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenu(null);

  if (!app.isPackaged) {
      mainWindow.webContents.openDevTools();
  } else {
      mainWindow.webContents.on('devtools-opened', () => {
          mainWindow.webContents.closeDevTools();
      });
  }

  mainWindow.on('blur', () => {
    mainWindow.webContents.send('blur-app');
  });

  mainWindow.on('focus', () => {
    mainWindow.webContents.send('focus-app');
  });

  const indexPath = path.join(__dirname, 'dist', 'index.html');

  if (!fs.existsSync(indexPath)) {
      dialog.showErrorBox('Startup Error', `Application build not found at: ${indexPath}\n\nPlease run 'npm run build' before starting the application.`);
      return;
  }

  mainWindow.loadFile(indexPath).catch(e => {
      console.error('Failed to load index.html:', e);
      dialog.showErrorBox('Load Error', `Failed to load application: ${e.message}`);
  });
}

let inactivityTimer;
const INACTIVITY_LIMIT = 5 * 60 * 1000;

function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    console.log('Inactivity timeout. Quitting.');
    app.quit();
  }, INACTIVITY_LIMIT);
}

app.whenReady().then(() => {
  createWindow();
  resetInactivityTimer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- Security / Data Logic ---

function encryptHeader(password, token) {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = deriveKey(password, salt);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Pad token to fixed length
    const tokenBuffer = Buffer.alloc(HEADER_PAD_LENGTH);
    tokenBuffer.write(token);

    let encrypted = cipher.update(tokenBuffer);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
        salt: salt.toString('hex'),
        iv: iv.toString('hex'),
        encrypted: encrypted.toString('hex'),
        authTag: authTag.toString('hex')
    };
}

function createFakeHeader() {
    // Generate random garbage that looks like a header
    // Encrypted length = HEADER_PAD_LENGTH for AES-GCM (no padding, but we padded input)
    // Actually AES-GCM output length = input length.
    return {
        salt: crypto.randomBytes(SALT_LENGTH).toString('hex'),
        iv: crypto.randomBytes(IV_LENGTH).toString('hex'),
        encrypted: crypto.randomBytes(HEADER_PAD_LENGTH).toString('hex'),
        authTag: crypto.randomBytes(AUTH_TAG_LENGTH).toString('hex')
    };
}

function createAccountInternal(password, duressPassword = null) {
  const mainHeader = encryptHeader(password, 'VALID');
  let duressHeader;

  if (duressPassword) {
      duressHeader = encryptHeader(duressPassword, 'DURESS_VALID');
  } else {
      duressHeader = createFakeHeader();
  }

  const headers = [mainHeader, duressHeader];
  // Shuffle to hide which is which
  if (Math.random() > 0.5) headers.reverse();

  fs.writeFileSync(AUTH_FILE, JSON.stringify(headers));

  // Return main key
  // Need to re-derive because we didn't keep it from encryptHeader helper
  const salt = Buffer.from(mainHeader.salt, 'hex');
  return deriveKey(password, salt);
}

function saveNotesInternal(notes, key) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(JSON.stringify(notes), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    const data = JSON.stringify({
      iv: iv.toString('hex'),
      encrypted: encrypted,
      authTag: authTag.toString('hex')
    });

    fs.writeFileSync(DATA_FILE, data);
}

function wipeData(newPassword = null) {
  console.log('WIPING ALL DATA due to security breach/failure.');
  const wipeFile = (file) => {
    if (fs.existsSync(file)) {
      const stat = fs.statSync(file);
      const garbage = crypto.randomBytes(stat.size);
      fs.writeFileSync(file, garbage);
      fs.unlinkSync(file);
    }
  };
  
  wipeFile(DATA_FILE);
  wipeFile(AUTH_FILE);
  
  if (newPassword) {
      // Honeypot Mode
      const key = createAccountInternal(newPassword);
      const fakeNotes = [
          { id: 'fake1', title: 'Shopping List', content: 'Milk, Eggs, Bread', updatedAt: new Date().toISOString() },
          { id: 'fake2', title: 'Meeting Notes', content: 'Discussed Q3 goals. Need to improve performance by 10%.', updatedAt: new Date().toISOString() },
          { id: 'fake3', title: 'Ideas', content: 'App that tracks water intake. Game about a cat in space.', updatedAt: new Date().toISOString() }
      ];
      saveNotesInternal(fakeNotes, key);

      sessionKey = null;
  } else {
      fs.writeFileSync(DATA_FILE, crypto.randomBytes(1024));
      sessionKey = null;
      if (mainWindow) mainWindow.webContents.send('wiped');
  }
}

function loadAndExpireNotes() {
    if (!sessionKey) return [];

    if (isDuressSession) {
        return [
            { id: 'fake1', title: 'Grocery List', content: 'Milk, Eggs, Bread, Butter', updatedAt: new Date().toISOString() },
            { id: 'fake2', title: 'Meeting Notes', content: 'Discussed project timeline. Everything is on track.', updatedAt: new Date().toISOString() },
            { id: 'fake3', title: 'Vacation Ideas', content: 'Hawaii or Bahamas? Maybe a cruise.', updatedAt: new Date().toISOString() }
        ];
    }

    if (!fs.existsSync(DATA_FILE)) return [];

    try {
        const fileContent = fs.readFileSync(DATA_FILE, 'utf8');
        let data;
        try {
            data = JSON.parse(fileContent);
        } catch(e) {
            throw new Error('Data corruption detected');
        }

        const decipher = crypto.createDecipheriv(ALGORITHM, sessionKey, Buffer.from(data.iv, 'hex'));
        decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));
        let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        let notes = JSON.parse(decrypted);

        // Auto-Disintegrate Logic (Dead Man's Switch)
        const now = Date.now();
        const initialCount = notes.length;

        notes = notes.filter(note => {
            if (note.security && note.security.validityDuration && note.security.lastRefreshedAt) {
                const expiry = note.security.lastRefreshedAt + (note.security.validityDuration * 60 * 60 * 1000);
                if (now > expiry) {
                    return false; // Wipe
                }
            }
            return true;
        });

        if (notes.length !== initialCount) {
            console.log(`Auto-disintegrated ${initialCount - notes.length} notes.`);
            saveNotesInternal(notes, sessionKey);
        }

        return notes;
    } catch (err) {
        console.error('Load notes failed', err);
        wipeData();
        throw new Error('Integrity check failed. Data wiped.');
    }
}

ipcMain.handle('check-account-exists', () => {
  return fs.existsSync(AUTH_FILE);
});

ipcMain.handle('create-account', async (event, password, duressPassword) => {
  if (typeof password !== 'string') throw new Error('Invalid password type');
  if (duressPassword !== null && typeof duressPassword !== 'string') throw new Error('Invalid duress password type');

  try {
    const key = createAccountInternal(password, duressPassword);
    saveNotesInternal([], key);
    sessionKey = key;
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('login', async (event, password, isNumLockActive) => {
  if (!fs.existsSync(AUTH_FILE)) return { success: false, error: 'No account found' };
  if (typeof password !== 'string') return { success: false, error: 'Invalid password type' };

  let success = false;
  let isMain = false;
  let isDuress = false;
  let key = null;

  if (isNumLockActive !== false) {
      try {
        const authContent = fs.readFileSync(AUTH_FILE, 'utf8');
        const authData = JSON.parse(authContent);

        // Handle New Format (Array of Headers)
        if (Array.isArray(authData)) {
            for (let i = 0; i < authData.length; i++) {
                const h = authData[i];
                try {
                    const salt = Buffer.from(h.salt, 'hex');
                    const derivedKey = deriveKey(password, salt);

                    const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, Buffer.from(h.iv, 'hex'));
                    decipher.setAuthTag(Buffer.from(h.authTag, 'hex'));
                    let decrypted = decipher.update(h.encrypted, 'hex');
                    decrypted = Buffer.concat([decrypted, decipher.final()]);

                    // Check start of buffer (removing null padding)
                    const token = decrypted.toString('utf8').replace(/\0/g, '');

                    if (token === 'VALID') {
                        key = derivedKey;
                        isMain = true;
                        success = true;
                        authIndex = i;
                        break;
                    } else if (token === 'DURESS_VALID') {
                        key = derivedKey;
                        isDuress = true;
                        success = true;
                        authIndex = i;
                        break;
                    }
                } catch (e) {
                    // Decryption failed for this header
                }
            }
        }
        // Handle Legacy Format (Object)
        else {
             // ... Old Logic for fallback ...
             try {
                const salt = Buffer.from(authData.salt, 'hex');
                const derivedKey = deriveKey(password, salt);

                const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, Buffer.from(authData.iv, 'hex'));
                decipher.setAuthTag(Buffer.from(authData.authTag, 'hex'));
                let decrypted = decipher.update(authData.encrypted, 'hex', 'utf8');
                decrypted += decipher.final('utf8');

                if (decrypted === 'VALID') {
                  key = derivedKey;
                  isMain = true;
                  success = true;
                }
            } catch (mainErr) {}

            if (!success && authData.duress) {
                try {
                    const dSalt = Buffer.from(authData.duress.salt, 'hex');
                    const dKey = deriveKey(password, dSalt);
                    const dDecipher = crypto.createDecipheriv(ALGORITHM, dKey, Buffer.from(authData.duress.iv, 'hex'));
                    dDecipher.setAuthTag(Buffer.from(authData.duress.authTag, 'hex'));
                    let dDecrypted = dDecipher.update(authData.duress.encrypted, 'hex', 'utf8');
                    dDecrypted += dDecipher.final('utf8');

                    if (dDecrypted === 'DURESS_VALID') {
                        key = dKey;
                        isDuress = true;
                        success = true;
                    }
                } catch (duressErr) {}
            }
        }

      } catch (err) {
        console.error('Login failed (crypto error or wrong password)', err.message);
      }
  }

  if (success) {
      sessionKey = key;
      failedAttempts = 0;
      isDuressSession = isDuress;
      try {
          loadAndExpireNotes();
      } catch (e) {
          sessionKey = null;
          return { success: false, error: 'Vault corrupted or tampered' };
      }
      return { success: true };
  }

  failedAttempts++;
  console.log(`Failed attempt ${failedAttempts}/2`);

  if (failedAttempts >= 2) {
    wipeData(password);
    return { success: false, error: 'Invalid password', remaining: 1 };
  }
  
  return { success: false, error: 'Invalid password', remaining: 3 - failedAttempts };
});

ipcMain.handle('change-password', async (event, oldPassword, newPassword) => {
    if (!sessionKey) throw new Error('Not authenticated');
    if (isDuressSession) throw new Error('Cannot change password in Restricted Mode');
    if (typeof oldPassword !== 'string' || typeof newPassword !== 'string') throw new Error('Invalid arguments');

    // With new format, we need to know authIndex.
    if (authIndex === -1) throw new Error('Session state invalid (index unknown)');

    try {
        const notes = loadAndExpireNotes();
        const authContent = fs.readFileSync(AUTH_FILE, 'utf8');
        const authData = JSON.parse(authContent);

        if (!Array.isArray(authData)) throw new Error('Legacy account format. Please re-create account to upgrade security.');

        // 1. Create new Header for current slot
        const newHeader = encryptHeader(newPassword, 'VALID');

        // 2. Update authData array
        authData[authIndex] = newHeader;

        // 3. Save Auth
        fs.writeFileSync(AUTH_FILE, JSON.stringify(authData));

        // 4. Re-encrypt notes with new key
        const salt = Buffer.from(newHeader.salt, 'hex');
        const newKey = deriveKey(newPassword, salt);

        saveNotesInternal(notes, newKey);
        sessionKey = newKey;

        return { success: true };
    } catch (err) {
        console.error('Change password failed', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('load-notes', async () => {
  if (!sessionKey) throw new Error('Not authenticated');
  return loadAndExpireNotes();
});

ipcMain.handle('save-notes', async (event, notes) => {
  if (!sessionKey) throw new Error('Not authenticated');
  if (!Array.isArray(notes)) throw new Error('Invalid notes format');
  try {
    saveNotesInternal(notes, sessionKey);
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('activity-detected', () => {
  resetInactivityTimer();
});

ipcMain.handle('wipe-data', () => {
    wipeData();
});

ipcMain.handle('verify-note-password', async (event, noteId, password) => {
    if (!sessionKey) throw new Error('Not authenticated');
    if (typeof noteId !== 'string' || typeof password !== 'string') throw new Error('Invalid arguments');

    try {
        const fileContent = fs.readFileSync(DATA_FILE, 'utf8');
        const data = JSON.parse(fileContent);
        const decipher = crypto.createDecipheriv(ALGORITHM, sessionKey, Buffer.from(data.iv, 'hex'));
        decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));
        let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        const notes = JSON.parse(decrypted);

        const note = notes.find(n => n.id === noteId);
        if (!note || !note.security || !note.security.password) {
             return { success: true };
        }

        if (note.security.password === password) {
            return { success: true };
        } else {
             wipeData();
             return { success: false, wiped: true };
        }
    } catch (err) {
        console.error('Verify note password failed', err);
        wipeData();
        return { success: false, wiped: true };
    }
});

ipcMain.handle('export-note', async (event, { noteId, password }) => {
   if (!sessionKey) throw new Error('Not authenticated');
   if (typeof noteId !== 'string' || typeof password !== 'string') throw new Error('Invalid arguments');

   try {
     const fileContent = fs.readFileSync(DATA_FILE, 'utf8');
     const data = JSON.parse(fileContent);
     const decipher = crypto.createDecipheriv(ALGORITHM, sessionKey, Buffer.from(data.iv, 'hex'));
     decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));
     let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
     decrypted += decipher.final('utf8');
     const notes = JSON.parse(decrypted);

     const note = notes.find(n => n.id === noteId);
     if (!note) throw new Error('Note not found');

     if (note.security && note.security.exportable === false) {
         throw new Error('This note is not allowed to be exported.');
     }

     const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Note',
        defaultPath: `note-${Date.now()}.safe`,
        filters: [{ name: 'Secure Note', extensions: ['safe'] }]
     });

     if (!filePath) return { success: false, cancelled: true };

     const salt = crypto.randomBytes(SALT_LENGTH);
     const key = deriveKey(password, salt);
     
     const iv = crypto.randomBytes(IV_LENGTH);
     const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
     let encrypted = cipher.update(JSON.stringify(note), 'utf8', 'hex');
     encrypted += cipher.final('hex');
     const authTag = cipher.getAuthTag();
     
     const exportData = JSON.stringify({
       salt: salt.toString('hex'),
       iv: iv.toString('hex'),
       encrypted: encrypted,
       authTag: authTag.toString('hex')
     });
     
     fs.writeFileSync(filePath, exportData);
     return { success: true };
   } catch (err) {
     return { success: false, error: err.message };
   }
});

ipcMain.handle('import-note', async (event, password) => {
    if (typeof password !== 'string') throw new Error('Invalid password');
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Import Note',
        properties: ['openFile'],
        filters: [{ name: 'Secure Note', extensions: ['safe'] }]
    });

    if (filePaths && filePaths.length > 0) {
        const filePath = filePaths[0];
        try {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            let data;
            try {
                data = JSON.parse(fileContent);
            } catch (e) {
                 throw new Error('File corrupted');
            }
            
            const salt = Buffer.from(data.salt, 'hex');
            const key = deriveKey(password, salt);
            
            const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(data.iv, 'hex'));
            decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));
            let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return { success: true, note: JSON.parse(decrypted) };
        } catch (err) {
            console.error('Import failed', err);
            try {
                const stat = fs.statSync(filePath);
                const garbage = crypto.randomBytes(stat.size);
                fs.writeFileSync(filePath, garbage);
                fs.unlinkSync(filePath);
            } catch (cleanupErr) {
                console.error('Failed to wipe file', cleanupErr);
            }
            
            return { success: false, error: 'Invalid password. File destroyed.' };
        }
    }
    return { success: false, cancelled: true };
});
