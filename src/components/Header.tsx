'use client';

import { Kanban, LayoutGrid, Moon, Plus, Sun, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { STORAGE_KEYS } from '@/lib/storage';

export type Tab = 'annonces' | 'suivi';

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      window.localStorage.setItem(STORAGE_KEYS.theme, next ? 'dark' : 'light');
    } catch {
      // Le thème reste appliqué pour la session en cours.
    }
  };

  const label = dark ? 'Passer au thème clair' : 'Passer au thème sombre';
  return (
    <button type="button" className="btn btn-quiet px-2" onClick={toggle} aria-label={label} title={label}>
      {dark ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
    </button>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? 'bg-ink text-bg' : 'text-muted hover:bg-surface-2 hover:text-ink'
      }`}
    >
      <Icon className="size-4" aria-hidden />
      {label}
      <span className={`tabular-nums ${active ? 'opacity-70' : ''}`}>{count}</span>
    </button>
  );
}

export function Header({
  tab,
  onTab,
  listingCount,
  trackedCount,
  onAdd,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  listingCount: number;
  trackedCount: number;
  onAdd: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:gap-x-6 sm:px-6">
        <a href="#top" className="font-display text-xl font-semibold leading-none sm:text-2xl">
          Saint-Nazaire 2027
        </a>
        <nav aria-label="Vues" className="order-3 flex w-full gap-1 sm:order-none sm:w-auto">
          <TabButton
            active={tab === 'annonces'}
            onClick={() => onTab('annonces')}
            icon={LayoutGrid}
            label="Annonces"
            count={listingCount}
          />
          <TabButton
            active={tab === 'suivi'}
            onClick={() => onTab('suivi')}
            icon={Kanban}
            label="Suivi"
            count={trackedCount}
          />
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" className="btn btn-primary" onClick={onAdd}>
            <Plus className="size-4" aria-hidden />
            <span className="sm:hidden">Ajouter</span>
            <span className="hidden sm:inline">Ajouter une annonce</span>
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
