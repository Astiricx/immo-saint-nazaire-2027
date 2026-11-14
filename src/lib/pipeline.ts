import type { StatusId } from './types';

export interface Status {
  id: StatusId;
  label: string;
  hint: string;
}

/** Les étapes du suivi, dans l'ordre des colonnes du tableau Kanban. */
export const STATUSES: Status[] = [
  { id: 'a-analyser', label: 'À analyser', hint: 'À lire en détail' },
  { id: 'contacte', label: 'Contacté', hint: 'Message envoyé ou appel passé' },
  { id: 'visite', label: 'Visite planifiée', hint: 'Créneau fixé' },
  { id: 'dossier', label: 'Dossier envoyé', hint: 'En attente de réponse' },
  { id: 'refuse', label: 'Refusé', hint: 'Écarté ou dossier non retenu' },
  { id: 'coup-de-coeur', label: 'Coup de cœur', hint: 'À suivre de près' },
];

export const DEFAULT_STATUS: StatusId = 'a-analyser';

export function statusLabel(id: StatusId): string {
  return STATUSES.find((s) => s.id === id)?.label ?? id;
}

export function isStatusId(value: unknown): value is StatusId {
  return typeof value === 'string' && STATUSES.some((s) => s.id === value);
}
