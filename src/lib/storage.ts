'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { DEFAULT_STATUS, isStatusId } from './pipeline';
import type { Listing, StatusId } from './types';

export const STORAGE_KEYS = {
  tracker: 'immo-sn-2027:suivi',
  prefs: 'immo-sn-2027:preferences',
  theme: 'immo-sn-2027:theme',
} as const;

export interface TrackEntry {
  status: StatusId;
  notes: string;
  /** Date de visite (AAAA-MM-JJ), vide si aucune. */
  visitDate: string;
  updatedAt: string;
}

export interface TrackerState {
  version: 1;
  entries: Record<string, TrackEntry>;
  /** Annonces ajoutées à la main. */
  custom: Listing[];
}

export const EMPTY_TRACKER: TrackerState = { version: 1, entries: {}, custom: [] };

export const DEFAULT_ENTRY: TrackEntry = {
  status: DEFAULT_STATUS,
  notes: '',
  visitDate: '',
  updatedAt: '',
};

/** Valide un suivi lu dans le navigateur ou importé depuis un fichier. */
export function reviveTracker(value: unknown): TrackerState {
  if (!value || typeof value !== 'object') return EMPTY_TRACKER;
  const input = value as Partial<TrackerState>;
  const entries: Record<string, TrackEntry> = {};
  if (input.entries && typeof input.entries === 'object') {
    for (const [id, raw] of Object.entries(input.entries)) {
      if (!raw || typeof raw !== 'object') continue;
      const entry = raw as Partial<TrackEntry>;
      entries[id] = {
        status: isStatusId(entry.status) ? entry.status : DEFAULT_STATUS,
        notes: typeof entry.notes === 'string' ? entry.notes : '',
        visitDate: typeof entry.visitDate === 'string' ? entry.visitDate : '',
        updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : '',
      };
    }
  }
  const custom = Array.isArray(input.custom)
    ? input.custom.filter(
        (l): l is Listing =>
          !!l && typeof l === 'object' && typeof l.id === 'string' && typeof l.rent === 'number',
      )
    : [];
  return { version: 1, entries, custom };
}

/**
 * État React persisté dans localStorage.
 * Le premier rendu utilise la valeur initiale (identique au HTML statique),
 * puis la valeur enregistrée est chargée une fois la page montée.
 */
export function useStoredState<T>(
  key: string,
  initial: T,
  revive?: (value: unknown) => T,
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [state, setState] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored != null) {
        const parsed: unknown = JSON.parse(stored);
        setState(revive ? revive(parsed) : (parsed as T));
      }
    } catch {
      // Stockage indisponible ou contenu illisible : on garde la valeur initiale.
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Navigation privée ou quota dépassé : l'état reste en mémoire.
    }
  }, [key, state, hydrated]);

  return [state, setState, hydrated];
}
