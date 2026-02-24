const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Derives a cryptographic key from a password and salt using PBKDF2.
 * @param {string|Buffer} password - The password to derive the key from.
 * @param {Buffer} salt - The salt for the derivation.
 * @returns {Buffer} The derived key.
 */
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
}

module.exports = {
  ALGORITHM,
  PBKDF2_ITERATIONS,
  KEY_LENGTH,
  SALT_LENGTH,
  IV_LENGTH,
  AUTH_TAG_LENGTH,
  deriveKey
};
