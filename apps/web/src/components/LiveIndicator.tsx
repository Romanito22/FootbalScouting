'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { LiveStatus } from '@/lib/live';
import { SOURCE_LABELS } from '@/lib/scope';

function ago(iso: string | null, now: number): string {
  if (!iso) return 'aucune donnée';
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `il y a ${hours} h` : `il y a ${Math.round(hours / 24)} j`;
}

/**
 * Données « en direct » : suit le flux /api/live ; quand un run se termine
 * avec succès, la page se recharge d'elle-même (router.refresh : les
 * composants serveur relisent la base, l'état des formulaires est conservé).
 */
export function LiveIndicator({ initial }: { initial: LiveStatus | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<LiveStatus | null>(initial);
  const [connected, setConnected] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const lastSuccess = useRef(initial?.lastSuccessAt ?? null);

  useEffect(() => {
    const source = new EventSource('/api/live');
    source.addEventListener('status', (event) => {
      const next = JSON.parse((event as MessageEvent<string>).data) as LiveStatus;
      setStatus(next);
      setConnected(true);
      if (next.lastSuccessAt && next.lastSuccessAt !== lastSuccess.current) {
        if (lastSuccess.current !== null) {
          router.refresh();
          setJustUpdated(true);
          window.setTimeout(() => setJustUpdated(false), 8000);
        }
        lastSuccess.current = next.lastSuccessAt;
      }
    });
    source.addEventListener('unavailable', () => setConnected(false));
    source.onerror = () => setConnected(false);
    source.onopen = () => setConnected(true);
    const tick = window.setInterval(() => setNow(Date.now()), 30000);
    return () => {
      source.close();
      window.clearInterval(tick);
    };
  }, [router]);

  const running = status?.running ?? [];
  const dot = !connected
    ? 'bg-paper/30'
    : running.length > 0
      ? 'bg-spotlight animate-pulse'
      : 'bg-[#6fbf85]';

  return (
    <div className="rounded-lg border border-line bg-ink/50 px-3 py-2 text-[11px] leading-relaxed" aria-live="polite">
      <div className="flex items-center gap-2 font-medium text-paper/80">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
        {!connected ? 'Hors ligne' : running.length > 0 ? 'Mise à jour en cours' : 'En direct'}
      </div>
      {running.length > 0 ? (
        <div className="mt-0.5 text-paper/55">
          {running.map((r) => (
            <div key={`${r.source}|${r.label}|${r.startedAt}`} className="truncate" title={r.label}>
              {SOURCE_LABELS[r.source] ?? r.source} · {r.label}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-0.5 text-paper/50">
          {justUpdated ? <span className="text-spotlight">Nouvelles données chargées</span> : <>Données {ago(status?.lastSuccessAt ?? null, now)}</>}
        </div>
      )}
      {status?.lastFailure && running.length === 0 && (
        <div className="mt-0.5 truncate text-[#e08a80]" title={status.lastFailure.label}>
          échec récent : {SOURCE_LABELS[status.lastFailure.source] ?? status.lastFailure.source}
        </div>
      )}
    </div>
  );
}
