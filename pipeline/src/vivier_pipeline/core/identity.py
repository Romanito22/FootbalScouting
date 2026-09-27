"""Résolution d'identité entre sources — le module le plus important du
projet (cf. spec §1.2). « K. Mbappé » (FBref) / « Kylian Mbappé Lottin »
(StatsBomb) / player_id 342229 (Transfermarkt) doivent être fusionnés.

Trois issues possibles pour un enregistrement source :
1. `auto_resolved` — score >= AUTO_MATCH_THRESHOLD : fusionné directement,
   un alias est créé.
2. `needs_review` — score entre REVIEW_THRESHOLD et AUTO_MATCH_THRESHOLD :
   plausible mais pas assez sûr, part en file d'attente (`resolution_queue`)
   pour arbitrage humain. Ça arrivera par centaines, c'est prévu par le
   schéma, pas un échec du système.
3. `new` — aucun candidat suffisamment proche : ce n'est vraisemblablement
   pas un joueur déjà connu, on en crée un nouveau. Indispensable dès que la
   base grossit (Transfermarkt couvre ~37 000 joueurs) : sans cette
   troisième issue, absolument tout ce qui n'a pas déjà un jumeau exact
   finirait à tort en file d'attente.

Score de nom : `token_set_ratio` (rapidfuzz), pas `token_sort_ratio` — les
sources donnent des formes très inégales du même nom (« Neymar » vs
« Neymar da Silva Santos Júnior », « Lionel Messi » vs son nom légal
complet) et `token_set_ratio` ignore les tokens en trop d'un côté au lieu de
les faire compter contre le score, ce que confirment des mesures réelles
(sort=0.34 / set=1.00 pour le cas Neymar). Contrepartie assumée : un nom
réduit à un seul patronyme très commun ( « Silva » seul) matcherait à tort
n'importe quel « ... Silva » par pur chevauchement de tokens — la date de
naissance, quand elle est connue des deux côtés, reste le filet de
sécurité contre ce cas.

Disqualification stricte si les dates de naissance sont connues des deux
côtés et diffèrent (signal le plus fiable de deux personnes différentes) ;
pénalité si les nationalités sont connues des deux côtés et n'ont aucune
intersection.

Sans données réelles multi-sources à ce stade (Kaggle et FBref sont hors de
portée réseau dans l'environnement où ce module a été écrit), les seuils
ci-dessous sont un point de départ raisonné, pas des valeurs calibrées
empiriquement — à ajuster une fois la vraie file d'attente en main.
"""

import re
from dataclasses import dataclass
from datetime import date
from typing import Literal

from rapidfuzz import fuzz
from unidecode import unidecode

AUTO_MATCH_THRESHOLD = 0.92
REVIEW_THRESHOLD = 0.60
NATIONALITY_MISMATCH_PENALTY = 0.5
# Deux candidats à moins de cet écart du meilleur : ambigu, jamais fusionné seul.
AMBIGUITY_MARGIN = 0.02
# Deux noms de club normalisés « concordent » au-delà de ce score.
CLUB_MATCH_THRESHOLD = 0.85

Outcome = Literal["auto_resolved", "needs_review", "new"]


def normalize_name(full_name: str) -> str:
    return unidecode(full_name).lower().strip()


@dataclass
class IdentityCandidate:
    """Un joueur déjà en base, candidat à un rapprochement."""

    player_id: int
    normalized_name: str
    birth_date: date | None = None
    nationality: list[str] | None = None
    # clubs (noms normalisés) où le joueur a déjà des stats, club actuel compris
    clubs: list[str] | None = None


@dataclass
class IdentityQuery:
    """Le nouvel enregistrement d'une source externe à rapprocher."""

    raw_name: str
    birth_date: date | None = None
    nationality: list[str] | None = None
    # club(s) de l'enregistrement source (noms normalisés), s'il est connu
    clubs: list[str] | None = None

    @property
    def normalized_name(self) -> str:
        return normalize_name(self.raw_name)


@dataclass
class ScoredCandidate:
    player_id: int
    score: float


@dataclass
class ResolutionResult:
    outcome: Outcome
    player_id: int | None  # renseigné seulement si outcome == "auto_resolved"
    confidence: float | None  # idem
    candidates: list[ScoredCandidate]  # toujours renseigné, utile pour la file d'attente


_CLUB_AFFIXES = {"fc", "afc", "cf", "sc", "ac", "as", "ss", "us", "club", "de", "the", "calcio"}


def normalize_club(name: str) -> str:
    """« Paris Saint-Germain FC » -> « paris saint germain » : sans accents,
    ponctuation ni affixes juridiques, pour comparer des libellés de club
    qui varient d'une source à l'autre."""
    tokens = re.sub(r"[^a-z0-9]+", " ", unidecode(name).lower()).split()
    return " ".join(t for t in tokens if t not in _CLUB_AFFIXES)


def _clubs_agree(query_clubs: list[str], candidate_clubs: list[str]) -> bool:
    return any(
        fuzz.token_set_ratio(normalize_club(q), normalize_club(c)) / 100 >= CLUB_MATCH_THRESHOLD
        for q in query_clubs for c in candidate_clubs
    )


def _score(query: IdentityQuery, candidate: IdentityCandidate) -> float:
    if query.birth_date and candidate.birth_date and query.birth_date != candidate.birth_date:
        return 0.0

    name_score = fuzz.token_set_ratio(query.normalized_name, candidate.normalized_name) / 100

    if (
        query.nationality and candidate.nationality
        and not set(query.nationality) & set(candidate.nationality)
    ):
        name_score *= NATIONALITY_MISMATCH_PENALTY

    # Un nom d'un seul mot (« Danilo », « Rodri ») est contenu dans des
    # dizaines de noms complets : token_set_ratio y vaut 1.0. Sans date de
    # naissance, si les clubs sont connus des deux côtés et ne concordent
    # jamais, ce n'est plus qu'une présomption — au mieux un arbitrage.
    if (
        len(query.normalized_name.split()) == 1
        and not (query.birth_date and candidate.birth_date)
        and query.clubs and candidate.clubs
        and not _clubs_agree(query.clubs, candidate.clubs)
    ):
        name_score = min(name_score, REVIEW_THRESHOLD)

    return name_score


def resolve_identity(
    query: IdentityQuery,
    candidates: list[IdentityCandidate],
    auto_threshold: float = AUTO_MATCH_THRESHOLD,
    review_threshold: float = REVIEW_THRESHOLD,
) -> ResolutionResult:
    scored = sorted(
        (ScoredCandidate(c.player_id, _score(query, c)) for c in candidates),
        key=lambda s: s.score,
        reverse=True,
    )

    best = scored[0].score if scored else 0.0
    # Plusieurs candidats quasi ex aequo en tête : on ne choisit pas au hasard.
    ambiguous = len(scored) > 1 and best - scored[1].score < AMBIGUITY_MARGIN

    if best >= auto_threshold and not ambiguous:
        return ResolutionResult(
            outcome="auto_resolved", player_id=scored[0].player_id,
            confidence=scored[0].score, candidates=scored,
        )
    if best >= review_threshold:
        return ResolutionResult(
            outcome="needs_review", player_id=None, confidence=None, candidates=scored,
        )
    return ResolutionResult(outcome="new", player_id=None, confidence=None, candidates=scored)
