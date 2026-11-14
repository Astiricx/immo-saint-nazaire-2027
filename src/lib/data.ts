'use client';

import { useCallback, useEffect, useState } from 'react';
import { decryptJson, isEncryptedFile, WrongPassphraseError, type EncryptedFile } from './crypto';
import type { ListingsFile } from './types';

/** Préfixe du site sur GitHub Pages (/<nom-du-dépôt>), vide ailleurs. */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** Phrase secrète mémorisée sur cet appareil (si vous l'avez demandé). */
export const PASSPHRASE_KEY = 'immo-sn-2027:phrase-secrete';

export type DataState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'locked'; error?: string; unlocking?: boolean }
  | { status: 'ready'; data: ListingsFile };

async function fetchJson(path: string, signal: AbortSignal): Promise<unknown | null> {
  const response = await fetch(`${BASE_PATH}${path}`, { cache: 'no-store', signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function checkFile(data: unknown): ListingsFile {
  const file = data as ListingsFile;
  if (!file || !Array.isArray(file.listings)) throw new Error('format inattendu');
  return file;
}

const readStored = () => {
  try {
    return window.localStorage.getItem(PASSPHRASE_KEY);
  } catch {
    return null;
  }
};

/**
 * Charge les annonces publiées par la collecte quotidienne :
 * public/listings.enc.json (chiffré) s'il existe, sinon public/listings.json.
 * Relu sans cache à chaque visite.
 */
export function useListingsFile(): {
  state: DataState;
  unlock: (passphrase: string, remember: boolean) => Promise<void>;
  lock: () => void;
} {
  const [state, setState] = useState<DataState>({ status: 'loading' });
  const [encrypted, setEncrypted] = useState<EncryptedFile | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const sealed = await fetchJson('/listings.enc.json', controller.signal);
        if (sealed && isEncryptedFile(sealed)) {
          setEncrypted(sealed);
          const stored = readStored();
          if (stored) {
            try {
              setState({ status: 'ready', data: checkFile(await decryptJson(sealed, stored)) });
              return;
            } catch {
              // Phrase mémorisée périmée (changée depuis) : on la redemande.
            }
          }
          setState({ status: 'locked' });
          return;
        }
        const plain = await fetchJson('/listings.json', controller.signal);
        if (!plain) throw new Error('aucun fichier d’annonces publié');
        setState({ status: 'ready', data: checkFile(plain) });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => controller.abort();
  }, []);

  const unlock = useCallback(
    async (passphrase: string, remember: boolean) => {
      if (!encrypted) return;
      setState({ status: 'locked', unlocking: true });
      try {
        const data = checkFile(await decryptJson(encrypted, passphrase));
        try {
          if (remember) window.localStorage.setItem(PASSPHRASE_KEY, passphrase);
          else window.localStorage.removeItem(PASSPHRASE_KEY);
        } catch {
          // Stockage indisponible : il faudra ressaisir la phrase à la prochaine visite.
        }
        setState({ status: 'ready', data });
      } catch (error) {
        setState({
          status: 'locked',
          error:
            error instanceof WrongPassphraseError
              ? 'Phrase secrète incorrecte. Elle doit être identique au secret LISTINGS_PASSPHRASE du dépôt.'
              : 'Le fichier des annonces est illisible. Relancez la collecte depuis l’onglet Actions.',
        });
      }
    },
    [encrypted],
  );

  const lock = useCallback(() => {
    try {
      window.localStorage.removeItem(PASSPHRASE_KEY);
    } catch {
      // Rien à effacer.
    }
    if (encrypted) setState({ status: 'locked' });
  }, [encrypted]);

  return { state, unlock, lock };
}
