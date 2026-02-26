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

// Crypto Constants
const ALGORITHM = 'aes-256-gcm';
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const MAX_PASSWORD_LENGTH = 128;

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

  mainWindow.on('blur', () => {
    mainWindow.webContents.send('blur-app');
  });

  mainWindow.on('focus', () => {
    mainWindow.webContents.send('focus-app');
  });

  const indexPath = path.join(__dirname, 'dist', 'index.html');
  console.log('Loading index from:', indexPath);

  if (!fs.existsSync(indexPath)) {
      console.error('Index file not found at:', indexPath);
      // In development, we might not have a build yet if started via just 'electron .' without build.
      // But we should warn the user.
      dialog.showErrorBox('Startup Error', `Application build not found at: ${indexPath}\n\nPlease run 'npm run build' before starting the application.`);
      // We can try to load a fallback or just quit, but let's try to load it anyway to let Electron's standard error handling kick in too if needed,
      // but the dialog is better.
      // app.quit(); // Better to let them see the dialog
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

function createAccountInternal(password, duressPassword = null) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(password, salt);

  // Verification Hash
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update('VALID', 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  let duressAuth = null;
  if (duressPassword) {
      const dSalt = crypto.randomBytes(SALT_LENGTH);
      const dKey = deriveKey(duressPassword, dSalt);
      const dIv = crypto.randomBytes(IV_LENGTH);
      const dCipher = crypto.createCipheriv(ALGORITHM, dKey, dIv);
      let dEncrypted = dCipher.update('DURESS_VALID', 'utf8', 'hex');
      dEncrypted += dCipher.final('hex');
      const dAuthTag = dCipher.getAuthTag();

      duressAuth = {
          salt: dSalt.toString('hex'),
          iv: dIv.toString('hex'),
          encrypted: dEncrypted,
          authTag: dAuthTag.toString('hex')
      };
  }

  const authData = JSON.stringify({
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    encrypted: encrypted,
    authTag: authTag.toString('hex'),
    duress: duressAuth
  });

  fs.writeFileSync(AUTH_FILE, authData);
  return key;
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
      // Honeypot Mode: Re-initialize with the WRONG password and fake notes
      const key = createAccountInternal(newPassword);
      const fakeNotes = [
          { id: 'fake1', title: 'Shopping List', content: 'Milk, Eggs, Bread', updatedAt: new Date().toISOString() },
          { id: 'fake2', title: 'Meeting Notes', content: 'Discussed Q3 goals. Need to improve performance by 10%.', updatedAt: new Date().toISOString() },
          { id: 'fake3', title: 'Ideas', content: 'App that tracks water intake. Game about a cat in space.', updatedAt: new Date().toISOString() }
      ];
      saveNotesInternal(fakeNotes, key);

      // Do NOT send wiped event. Let the user think they just failed the password.
      sessionKey = null;
  } else {
      // Just create garbage file to simulate encrypted data?
      // Or just leave it wiped (deleted).
      // Prompt says "filled with 'fake' realistic looking junk".
      // If no password provided (e.g. duress wipe?), we can't encrypt valid junk.
      // So just random bytes.
      fs.writeFileSync(DATA_FILE, crypto.randomBytes(1024));

      sessionKey = null;
      if (mainWindow) mainWindow.webContents.send('wiped');
  }
}

ipcMain.handle('check-account-exists', () => {
  return fs.existsSync(AUTH_FILE);
});

ipcMain.handle('create-account', async (event, password, duressPassword) => {
  try {
    const key = createAccountInternal(password, duressPassword);
    
    // Create empty notes file
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

  let success = false;
  let isMain = false;
  let isDuress = false;
  let key = null;

  // Num Lock Check
  if (isNumLockActive !== false) { // Assuming undefined/null means check skipped or not provided (backward compat? No, force it)
       // Actually, from requirements: "during password entry num lock must be active. otherwise even if the password is correct it will show up as incorrect."
       // So if isNumLockActive is false, we force failure.
  }

  // We'll proceed to check password anyway to distinguish between "Wrong Password" and "NumLock missing" logic internally if needed,
  // but strictly we should just treat it as wrong password.
  // However, we need to know IF the password WAS correct to know if we should increment failed attempts?
  // "otherwise even if the password is correct it will show up as incorrect."
  // This implies it counts as a failed attempt.

  if (isNumLockActive) {
      try {
        const authData = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));

        // 1. Try Main Password
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
        } catch (mainErr) {
            // Main password failed
        }

        // 2. Try Duress Password
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
            } catch (duressErr) {
                // Duress failed
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
      return { success: true };
  }

  failedAttempts++;
  console.log(`Failed attempt ${failedAttempts}/2`);

  if (failedAttempts >= 2) {
    // Honeypot time: Wipe and replace with junk encrypted by THIS wrong password
    wipeData(password);
    // Return standard error to mock 3 attempts (user thinks 1 remaining)
    return { success: false, error: 'Invalid password', remaining: 1 };
  }
  
  return { success: false, error: 'Invalid password', remaining: 3 - failedAttempts }; // Display 3, real limit 2
});

ipcMain.handle('load-notes', async () => {
  if (!sessionKey) throw new Error('Not authenticated');

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
    let modified = false;
    const initialCount = notes.length;

    notes = notes.filter(note => {
        if (note.security && note.security.validityDuration && note.security.lastRefreshedAt) {
            // validityDuration is in hours
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
});

ipcMain.handle('save-notes', async (event, notes) => {
  if (!sessionKey) throw new Error('Not authenticated');
  
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

    // We need to find the note. Since we don't store note passwords separately in backend,
    // we load the notes and check.
    // This assumes the frontend sends the password to verify against what we have in the DB.
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
             // If note has no password, verification is moot, but let's say success
             return { success: true };
        }

        // Check password
        // Since the database itself is encrypted, we store the note password in the security object.
        // We compare directly.
        if (note.security.password === password) {
            return { success: true };
        } else {
             // Wipe everything on wrong note password
             wipeData();
             return { success: false, wiped: true };
        }
    } catch (err) {
        console.error('Verify note password failed', err);
        // If decryption fails here, it's weird, but we should probably wipe.
        wipeData();
        return { success: false, wiped: true };
    }
});

ipcMain.handle('export-note', async (event, { noteId, password }) => {
   if (!sessionKey) throw new Error('Not authenticated');

   try {
     // Fetch fresh note data to ensure security flags are respected
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
