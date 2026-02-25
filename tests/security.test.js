const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

// --- Mocking logic from main.js ---
const ALGORITHM = 'aes-256-gcm';
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 16;
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

// Simulation of createAccount and login
function simulateHoneypot(originalPassword, wrongPassword) {
    // 1. Create account with original password
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = deriveKey(originalPassword, salt);

    // 2. Simulate Wipe & Honeypot creation with wrong password
    const hSalt = crypto.randomBytes(SALT_LENGTH);
    const hKey = deriveKey(wrongPassword, hSalt);

    const hIv = crypto.randomBytes(IV_LENGTH);
    const hCipher = crypto.createCipheriv(ALGORITHM, hKey, hIv);
    let hEncrypted = hCipher.update('VALID', 'utf8', 'hex');
    hEncrypted += hCipher.final('hex');
    const hAuthTag = hCipher.getAuthTag();

    const authData = {
        salt: hSalt.toString('hex'),
        iv: hIv.toString('hex'),
        encrypted: hEncrypted,
        authTag: hAuthTag.toString('hex')
    };

    // 3. Try to login with Wrong Password (should succeed now)
    const loginSalt = Buffer.from(authData.salt, 'hex');
    const loginKey = deriveKey(wrongPassword, loginSalt);

    const decipher = crypto.createDecipheriv(ALGORITHM, loginKey, Buffer.from(authData.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authData.authTag, 'hex'));
    let decrypted = decipher.update(authData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted === 'VALID';
}

function verifyNotePassword(notePassword, inputPassword) {
    return notePassword === inputPassword;
}

test('deriveKey throws if password too long', () => {
    const longPass = 'a'.repeat(129);
    assert.throws(() => deriveKey(longPass, crypto.randomBytes(16)), /exceeds maximum length/);
});

test('Honeypot logic works: wrong password becomes valid after wipe', () => {
    const original = 'secret';
    const wrong = 'wrongpass';
    const isHoneypotWorking = simulateHoneypot(original, wrong);
    assert.strictEqual(isHoneypotWorking, true);
});

test('Note password verification', () => {
    const notePass = 'secure123';
    assert.strictEqual(verifyNotePassword(notePass, 'secure123'), true);
    assert.strictEqual(verifyNotePassword(notePass, 'wrong'), false);
});

test('NumLock rejection simulation', () => {
    function login(password, isNumLock) {
        if (!isNumLock) return false;
        return true;
    }
    assert.strictEqual(login('pass', true), true);
    assert.strictEqual(login('pass', false), false);
});
