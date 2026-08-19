# VIVIER — Contexte projet

## Ce qu'on construit
Un moteur de décision de recrutement football. Pas un site de stats.
Chaque feature doit répondre à : "en quoi ça aide à choisir un joueur ?"

## Outil mono-utilisateur, tournant en local
Il n'y a qu'un seul utilisateur et l'app ne sera pas déployée.
Ne construis JAMAIS, sauf demande explicite :
- authentification, table users, colonne user_id, RLS
- onboarding, page de réglages, sélecteur de thème
- rate limiting applicatif, quotas, télémétrie
- gestion d'erreur défensive pour des entrées venant d'inconnus
Postgres tourne via docker-compose. Pas de base hébergée.

## Règles non négociables
- Toute métrique per-90 est masquée sous 600 minutes jouées.
- Un percentile est toujours relatif à un groupe de pairs explicite,
  affiché à l'utilisateur.
- Toute estimation issue d'un modèle est accompagnée de son intervalle
  de confiance dans l'UI.
- Les définitions de métriques vivent UNIQUEMENT dans packages/metrics.
  Aucune formule dupliquée dans le front ou le pipeline.
- Aucun appel direct à une source externe depuis apps/web.
  Le web lit la base, point.

## Migrations Drizzle & pgvector — piège connu
`drizzle-kit push` régénère les index HNSW **sans la classe d'opérateur**,
et Postgres refuse alors la création
(`no default operator class for access method "hnsw"`). Bug ouvert côté Drizzle.

Conséquence, à appliquer strictement :
- n'utilise **jamais** `drizzle-kit push` sur ce projet ;
- utilise `drizzle-kit generate` puis `drizzle-kit migrate` ;
- après chaque `generate`, vérifie que le SQL produit pour `pv_style_hnsw`
  et `pv_quality_hnsw` contient bien `vector_cosine_ops`. S'il manque,
  corrige le fichier de migration à la main avant de l'appliquer.

## Tests
Les calculs de métriques et de percentiles ont des tests unitaires avec
des fixtures figées. Un bug silencieux sur un percentile détruit la
crédibilité de tout le produit — c'est la zone à couvrir en priorité.

## Conventions
- TypeScript strict, pas de `any`.
- Python : uv, ruff, types annotés.
- Un commit par phase du plan de build.
- Les migrations Drizzle ne sont jamais éditées après application.

## Scraping
Rate limiting obligatoire (soccerdata gère la pause entre pages :
ne la désactive pas). Cache local systématique. Les payloads bruts sont
stockés avant transformation, pour pouvoir rejouer sans re-scraper.
