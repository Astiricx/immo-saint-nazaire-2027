'use client';

import { Download, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { reviveTracker, type TrackerState } from '@/lib/storage';

/** Sauvegarde et restauration du suivi : localStorage ne quitte pas ce navigateur. */
export function Footer({
  tracker,
  onImport,
}: {
  tracker: TrackerState;
  onImport: (tracker: TrackerState) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');

  const exportTracker = () => {
    const blob = new Blob([JSON.stringify(tracker, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `suivi-saint-nazaire-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage('Suivi exporté.');
  };

  const importTracker = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || !('entries' in parsed)) {
        throw new Error('format');
      }
      const revived = reviveTracker(parsed);
      onImport(revived);
      setMessage(
        `Suivi importé : ${Object.keys(revived.entries).length} annonces suivies, ${revived.custom.length} ajoutées à la main.`,
      );
    } catch {
      setMessage('Ce fichier n’est pas un export de suivi valide. Rien n’a été modifié.');
    }
  };

  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-6 text-sm text-muted sm:px-6">
        <p className="max-w-xl leading-relaxed">
          Étapes, notes et annonces ajoutées sont enregistrées dans ce navigateur uniquement.
          Exportez votre suivi pour le sauvegarder ou le reprendre sur un autre appareil.
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" className="btn" onClick={exportTracker}>
            <Download className="size-4" aria-hidden />
            Exporter le suivi
          </button>
          <button type="button" className="btn" onClick={() => inputRef.current?.click()}>
            <Upload className="size-4" aria-hidden />
            Importer un suivi
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            onChange={importTracker}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
          />
        </div>
        <p className="w-full text-ink" role="status">
          {message}
        </p>
      </div>
    </footer>
  );
}
