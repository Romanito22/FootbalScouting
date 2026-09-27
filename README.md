# VIVIER

Moteur de décision de recrutement football — outil personnel, en local.
Pas un site de stats : chaque écran répond à « en quoi ça aide à choisir un joueur ? ».

## Démarrage

Prérequis : Docker, Node ≥ 20 + pnpm, [uv](https://docs.astral.sh/uv/) (Python 3.12).

```bash
cp .env.example .env
pnpm install
pnpm db:up          # Postgres 17 + pgvector (docker-compose, port 5433)
pnpm db:migrate     # applique packages/db/migrations (jamais drizzle-kit push, cf. CLAUDE.md)
cd pipeline && uv sync && cd ..
pnpm dev            # http://localhost:3000
```

La base est vide au premier lancement : voir « Alimenter la base ».

## Alimenter la base

Toutes les commandes pipeline se lancent depuis `pipeline/`. Chaque payload
brut est mis en cache sous `pipeline/data/raw/` (jamais versionné) avant
transformation : une ingestion rejouée ne re-télécharge rien.

**1. StatsBomb Open Data** — gratuit, événements complets, source principale
des métriques. Une compétition-saison par commande :

```bash
uv run python -m vivier_pipeline.jobs.ingest_statsbomb --competition-id 2 --season-id 27
```

Quelques couples utiles (liste complète : `data/raw/statsbomb/competitions.json`
après une première ingestion) :

| Compétition | competition-id | season-id |
|---|---|---|
| Premier League 2015/16 (saison complète) | 2 | 27 |
| La Liga / Bundesliga / Serie A / Ligue 1 2015/16 (complètes) | 11 / 9 / 12 / 7 | 27 |
| Coupe du monde 2022 · 2018 | 43 | 106 · 3 |
| Euro 2024 · 2020 | 55 | 282 · 43 |
| Copa América 2024 | 223 | 282 |
| CAN 2023 | 1267 | 107 |
| Ligue 1 2022/23 · 2021/22 (matchs du PSG) | 7 | 235 · 108 |
| Bundesliga 2023/24 (matchs de Leverkusen) | 9 | 281 |

**2. Transfermarkt** (âge, pied, taille, contrat, valeur marchande) — dataset
Kaggle `davidcariboo/player-scores`, à télécharger manuellement et dézipper
dans `pipeline/data/raw/transfermarkt/`, puis :

```bash
uv run python -m vivier_pipeline.jobs.ingest_transfermarkt
```

Sans cet import, âge, contrat et valeur restent inconnus (affichés comme tels,
alertes contrat inactives).

**3. FBref** (via soccerdata, limitation de débit intégrée — ne pas la désactiver) :

```bash
uv run python -m vivier_pipeline.jobs.ingest_fbref --leagues "ENG-Premier League" --seasons 2324
```

FBref ne crée jamais de joueur : un nom non rapproché part en file d'arbitrage
(`/admin/resolution-queue`), puis relancer l'ingestion.

**4. Recalculer les tables dérivées** — après toute ingestion :

```bash
pnpm pipeline:refresh    # force des championnats → percentiles → vecteurs
```

## Écrans

| Écran | Rôle |
|---|---|
| `/` Tableau de bord | contrats des joueurs suivis à échéance, nouveaux résultats des recherches sauvegardées, shortlists, dernières observations, fraîcheur des données |
| `/search` | filtres composables (poste, âge, pied, contrat, valeur, niveau, seuil de percentile contre le palier ou toutes compétitions), tri, mini-radar par ligne, sauvegarde |
| `/players`, `/players/[id]` | répertoire (recherche floue « mbape » → Mbappé), fiche : radar par poste, métriques par famille, force du championnat, niveau ajusté avec intervalles, notes |
| `/players/[id]/similar` | « qui pour le remplacer ? » — similaires en style et en niveau, sous contraintes (poste, âge, valeur, contrat) |
| `/compare` | jusqu'à 3 finalistes : cartes, radar superposé, table, niveau ajusté ; saison commune au choix |
| `/shortlists` | listes de travail, statuts, ordre, sélection → comparaison |
| `/players/[id]/report` | rapport de scouting imprimable / PDF |
| `/competitions` | coefficients de force des championnats et leurs intervalles |
| `/admin/resolution-queue` | arbitrage des identités ambiguës entre sources |
| `/health` | santé système (Postgres, pgvector, volumes) |

## Modèles et règles

Règles non négociables : `CLAUDE.md`. En résumé, et comment le code les tient :

- **Per-90 masquées sous 600 minutes** (`MIN_MINUTES`, `packages/metrics`).
- **Percentile = groupe de pairs explicite, affiché** : même poste, même
  palier, saisons ± 2, ≥ 600 min. Chaque percentile est rattaché à sa ligne de
  stats et à son groupe ; l'effectif réel du classement est affiché quand une
  source ne fournit pas une métrique à tous.
- **Force des championnats** (`pipeline/.../core/strength.py`) : un même joueur
  observé dans deux compétitions à ≤ 1 saison d'écart ; moindres carrés
  pondérés sur le log de son volume offensif, référence = 1. Publié seulement
  avec ≥ 5 joueurs de liaison et un chemin vers la référence ; **intervalle de
  confiance à 90 %** par bootstrap sur les joueurs, propagé aux percentiles
  « toutes compétitions ». Sinon : NULL, avec sa raison, à l'écran.
- **Vecteurs** style (proportions du jeu) et niveau (percentiles ajustés du
  championnat), pgvector + HNSW ; gardiens et joueurs de champ dans deux
  espaces séparés.
- **Définitions de métriques** : uniquement `packages/metrics`, exportées vers
  le pipeline par `pnpm metrics:export` (un test vérifie la synchronisation).

Limites connues, affichées dans l'app là où elles comptent : force des
championnats estimée sur un indice purement offensif et sensible au biais de
sélection des transferts ; « buts évités » des gardiens calculés sur xG
pré-tir (biais commun, à lire en percentile) ; les données StatsBomb ouvertes
de certaines saisons ne couvrent qu'une équipe.

## Tests

```bash
pnpm test           # vitest (registre de métriques, logique web) + pytest (pipeline)
pnpm typecheck
cd pipeline && uv run ruff check .
```

Les calculs de métriques, percentiles, force des championnats et vecteurs sont
couverts par des fixtures figées (`pipeline/tests/`).

## Structure

```
apps/web/          Next.js 15 (App Router) · TypeScript · Tailwind — lit la base, rien d'autre
packages/db/       Drizzle ORM · schéma · migrations (generate + migrate, jamais push)
packages/metrics/  définitions de métriques, radars par poste, paramètres partagés (source de vérité unique)
pipeline/          Python · providers · résolution d'identité · percentiles · force · vecteurs
```
