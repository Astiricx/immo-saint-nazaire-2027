/**
 * Chiffrement de public/listings.enc.json, identique côté collecte (Node 20+) et côté navigateur.
 * AES-256-GCM, clé dérivée de la phrase secrète par PBKDF2-SHA256.
 * Sans la phrase secrète (secret LISTINGS_PASSPHRASE), le fichier publié est illisible.
 */

export const ENCRYPTED_FORMAT = 'immo-sn-2027/aes-256-gcm';

export interface EncryptedFile {
  format: typeof ENCRYPTED_FORMAT;
  version: 1;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  data: string;
}

const ITERATIONS = 310000;

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(value: unknown, passphrase: string): Promise<EncryptedFile> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plaintext as BufferSource),
  );
  return {
    format: ENCRYPTED_FORMAT,
    version: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(ciphertext),
  };
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('Phrase secrète incorrecte');
  }
}

export async function decryptJson<T>(file: EncryptedFile, passphrase: string): Promise<T> {
  const key = await deriveKey(passphrase, fromBase64(file.salt), file.iterations);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(file.iv) as BufferSource },
      key,
      fromBase64(file.data) as BufferSource,
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    // AES-GCM refuse le déchiffrement quand la clé ne correspond pas.
    throw new WrongPassphraseError();
  }
}

export function isEncryptedFile(value: unknown): value is EncryptedFile {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { format?: unknown }).format === ENCRYPTED_FORMAT
  );
}
