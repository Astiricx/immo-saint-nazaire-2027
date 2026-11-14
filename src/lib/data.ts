'use client';

import { useEffect, useState } from 'react';
import type { ListingsFile } from './types';

/** Préfixe du site sur GitHub Pages (/<nom-du-dépôt>), vide ailleurs. */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export type DataState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: ListingsFile };

/**
 * Charge public/listings.json, publié par la collecte quotidienne.
 * Le fichier est relu à chaque visite, sans cache : les nouvelles annonces apparaissent dès le déploiement.
 */
export function useListingsFile(): DataState {
  const [state, setState] = useState<DataState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${BASE_PATH}/listings.json`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as ListingsFile;
        if (!data || !Array.isArray(data.listings)) throw new Error('format inattendu');
        setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      });
    return () => controller.abort();
  }, []);

  return state;
}
