import type { ReactNode } from 'react';

/**
 * Primitives d'interface partagées. Une seule grammaire visuelle pour toute
 * l'app : cartes à filet fin, titres condensés, chiffres en tabulaire dans
 * les colonnes, accent spotlight réservé à ce qui demande l'attention.
 */

export const field =
  'w-full rounded-md border border-line bg-ink px-2.5 py-1.5 text-sm text-paper placeholder:text-paper/30 focus:border-spotlight/60 focus:outline-none';
export const label = 'block text-xs font-medium text-paper/55';
export const btnPrimary =
  'inline-flex items-center gap-1.5 rounded-md bg-spotlight px-3 py-1.5 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-40';
export const btnSecondary =
  'inline-flex items-center gap-1.5 rounded-md border border-line bg-raised px-3 py-1.5 text-sm text-paper transition hover:border-paper/30 disabled:opacity-40';
export const btnGhost =
  'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-paper/60 transition hover:bg-raised hover:text-paper';
export const btnDanger =
  'inline-flex items-center gap-1.5 rounded-md border border-signal/40 px-3 py-1.5 text-sm text-signal transition hover:bg-signal/10';
export const link = 'text-paper underline decoration-paper/25 underline-offset-2 hover:decoration-spotlight hover:text-spotlight';

export function PageHeader({
  eyebrow, title, description, actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-paper/45">{eyebrow}</div>}
        <h1 className="font-display text-3xl font-bold tracking-tight text-paper sm:text-4xl">{title}</h1>
        {description && <div className="mt-2 max-w-3xl text-sm leading-relaxed text-paper/60">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({
  title, subtitle, action, children, className = '', padded = true, id,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={`rounded-xl border border-line bg-surface ${className}`}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="font-display text-lg font-bold tracking-tight text-paper">{title}</h2>}
            {subtitle && <div className="mt-0.5 text-xs text-paper/50">{subtitle}</div>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

/** Tuile chiffre : libellé, valeur (proportionnelle, jamais tabulaire), aide. */
export function StatTile({
  label: tileLabel, value, hint, tone = 'default',
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'accent';
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
      <div className="text-xs font-medium text-paper/55">{tileLabel}</div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${tone === 'accent' ? 'text-spotlight' : 'text-paper'}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-paper/45">{hint}</div>}
    </div>
  );
}

const CHIP_TONES = {
  neutral: 'border-line bg-raised text-paper/75',
  accent: 'border-spotlight/40 bg-spotlight/10 text-spotlight',
  positive: 'border-pitch/50 bg-pitch/15 text-[#8fc79f]',
  negative: 'border-signal/50 bg-signal/10 text-[#e08a80]',
  muted: 'border-transparent bg-transparent text-paper/40',
} as const;

export function Chip({
  children, tone = 'neutral', title,
}: {
  children: ReactNode;
  tone?: keyof typeof CHIP_TONES;
  title?: string;
}) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${CHIP_TONES[tone]}`}>
      {children}
    </span>
  );
}

export function EmptyState({
  icon, title, children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="text-paper/30">{icon}</div>}
      <div className="font-display text-lg font-bold text-paper/80">{title}</div>
      {children && <div className="max-w-md text-sm text-paper/50">{children}</div>}
    </div>
  );
}

/** Monogramme d'un joueur (pas de photo : aucune source externe côté web). */
export function Monogram({ name, size = 'lg' }: { name: string; size?: 'sm' | 'lg' }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  const dims = size === 'lg' ? 'h-16 w-16 text-2xl' : 'h-8 w-8 text-xs';
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full border border-spotlight/40 bg-spotlight/10 font-display font-bold text-spotlight ${dims}`}>
      {initials}
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-paper/50">{children}</h3>
      {hint && <div className="text-xs text-paper/40">{hint}</div>}
    </div>
  );
}
