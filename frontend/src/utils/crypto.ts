// Web Crypto API-based P2P Cryptographic Utilities

/**
 * Generates a cryptographically secure 256-bit AES-GCM key.
 */
export async function generateEncryptionKey(): Promise<CryptoKey> {
  return await window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Exports a CryptoKey to a URL-safe Base64 string.
 */
export async function exportKey(key: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey('raw', key);
  const bytes = new Uint8Array(exported);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // Convert to Base64url
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Imports a CryptoKey from a URL-safe Base64 string.
 */
export async function importKey(keyStr: string): Promise<CryptoKey> {
  // Convert from Base64url to standard Base64
  let base64 = keyStr.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return await window.crypto.subtle.importKey(
    'raw',
    bytes.buffer,
    { name: 'AES-GCM' },
    false, // not extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a chunk of data (ArrayBuffer) using AES-GCM.
 * Prepends the 12-byte IV to the encrypted ciphertext.
 */
export async function encryptChunk(
  chunk: ArrayBuffer,
  key: CryptoKey
): Promise<ArrayBuffer> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    chunk
  );
  
  // Pack IV + Encrypted Data into a single ArrayBuffer
  const packed = new Uint8Array(iv.byteLength + encrypted.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(encrypted), iv.byteLength);
  return packed.buffer;
}

/**
 * Decrypts a packed chunk of data (containing 12-byte IV + AES-GCM ciphertext)
 */
export async function decryptChunk(
  packedChunk: ArrayBuffer,
  key: CryptoKey
): Promise<ArrayBuffer> {
  if (packedChunk.byteLength < 12) {
    throw new Error('Invalid chunk: size smaller than IV length');
  }
  
  const iv = new Uint8Array(packedChunk, 0, 12);
  const ciphertext = new Uint8Array(packedChunk, 12);
  
  return await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    ciphertext
  );
}

/**
 * Computes the SHA-256 hash of a single ArrayBuffer chunk.
 */
export async function hashSingleChunk(chunk: ArrayBuffer): Promise<ArrayBuffer> {
  return await window.crypto.subtle.digest('SHA-256', chunk);
}

/**
 * Combines an array of chunk hashes into a single SHA-256 verification string.
 * This avoids loading the whole file in memory by hashing hashes in order.
 */
export async function hashChunks(chunkHashes: ArrayBuffer[]): Promise<string> {
  // Calculate total byte size of concatenated hashes
  const totalLength = chunkHashes.reduce((sum, h) => sum + h.byteLength, 0);
  const concatenated = new Uint8Array(totalLength);
  
  let offset = 0;
  for (const hash of chunkHashes) {
    concatenated.set(new Uint8Array(hash), offset);
    offset += hash.byteLength;
  }
  
  // Hash the concatenated hashes
  const finalHashBuffer = await window.crypto.subtle.digest('SHA-256', concatenated.buffer);
  
  // Convert final hash to hex string
  const hashArray = Array.from(new Uint8Array(finalHashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
