import type { PropertyType } from './types';

const MONTHS_SHORT = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

/** Formatage maison plutôt qu'Intl : rendu identique côté serveur et côté navigateur. */
export function euro(amount: number): string {
  const rounded = Math.round(amount);
  const grouped = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${rounded < 0 ? '-' : ''}${grouped} €`;
}

export function formatSurface(surface: number): string {
  return `${String(surface).replace('.', ',')} m²`;
}

export function formatDate(iso: string, withYear = true): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return iso;
  const dayLabel = day === 1 ? '1er' : String(day);
  return `${dayLabel} ${MONTHS_SHORT[month - 1]}${withYear ? ` ${year}` : ''}`;
}

export function formatAvailability(availableFrom: string | null): string {
  return availableFrom ? formatDate(availableFrom) : 'Libre de suite';
}

export function formatKm(km: number): string {
  return `${km.toFixed(1).replace('.', ',')} km`;
}

const TYPE_LABELS: Record<PropertyType, string> = {
  studio: 'Studio',
  T1: 'T1',
  T2: 'T2',
  'T3+': 'T3 ou plus',
  chambre: 'Chambre',
  maison: 'Maison',
};

export function typeLabel(type: PropertyType): string {
  return TYPE_LABELS[type];
}
