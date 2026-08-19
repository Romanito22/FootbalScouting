# VIVIER

Moteur de décision de recrutement football — outil personnel, en local.

## Démarrage

```bash
cp .env.example .env
pnpm install
pnpm db:up
pnpm db:generate
pnpm db:migrate
pnpm dev
```

`localhost:3000` affiche la page de santé : connexion Postgres, extensions,
comptage des tables, dernière ingestion.

## Structure

```
apps/web/         Next.js 15 (App Router) · TypeScript · Tailwind
packages/db/       Drizzle ORM · schéma · migrations
packages/metrics/  définitions de métriques partagées (source de vérité unique)
pipeline/          Python · providers de données · réconciliation d'identité
```

Voir `CLAUDE.md` pour les règles du projet.
