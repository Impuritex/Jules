const test = require('node:test');
const assert = require('node:assert');
const { deriveKey, KEY_LENGTH } = require('./cryptoUtils');

test('deriveKey should derive a key of correct length', () => {
  const password = 'password123';
  const salt = Buffer.alloc(16, 'salt');
  const key = deriveKey(password, salt);

  assert.strictEqual(key.length, KEY_LENGTH);
  assert.ok(Buffer.isBuffer(key));
});

test('deriveKey should be deterministic', () => {
  const password = 'password123';
  const salt = Buffer.alloc(16, 'salt');

  const key1 = deriveKey(password, salt);
  const key2 = deriveKey(password, salt);

  assert.deepStrictEqual(key1, key2);
});

test('deriveKey should produce different keys for different passwords', () => {
  const salt = Buffer.alloc(16, 'salt');

  const key1 = deriveKey('password1', salt);
  const key2 = deriveKey('password2', salt);

  assert.notDeepStrictEqual(key1, key2);
});

test('deriveKey should produce different keys for different salts', () => {
  const password = 'password123';
  const salt1 = Buffer.alloc(16, 'salt1');
  const salt2 = Buffer.alloc(16, 'salt2');

  const key1 = deriveKey(password, salt1);
  const key2 = deriveKey(password, salt2);

  assert.notDeepStrictEqual(key1, key2);
});

test('deriveKey should handle empty password', () => {
  const salt = Buffer.alloc(16, 'salt');
  const key = deriveKey('', salt);

  assert.strictEqual(key.length, KEY_LENGTH);
});

test('deriveKey should handle empty salt', () => {
  const password = 'password123';
  const salt = Buffer.alloc(0);
  const key = deriveKey(password, salt);

  assert.strictEqual(key.length, KEY_LENGTH);
});

test('deriveKey should throw if password is not a string or buffer', () => {
    assert.throws(() => {
        deriveKey(123, Buffer.alloc(16));
    });
});
