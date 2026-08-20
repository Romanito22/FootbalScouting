"""Fixtures figées pour la résolution d'identité entre sources.

Les scores utilisés ici sont calculés une fois pour toutes avec rapidfuzz
(pas devinés, cf. docstring de core/identity.py pour la mesure complète) :
token_set_ratio matche parfaitement les mononymes et noms raccourcis
("Neymar" vs son nom légal complet, "Lionel Messi" vs son nom légal
complet), tandis qu'un nom réellement différent reste correctement bas."""

from datetime import date

from vivier_pipeline.core.identity import (
    IdentityCandidate,
    IdentityQuery,
    normalize_name,
    resolve_identity,
)

MBAPPE = IdentityCandidate(
    player_id=1, normalized_name=normalize_name("Kylian Mbappé Lottin"),
    birth_date=date(1998, 12, 20), nationality=["France"],
)
MESSI = IdentityCandidate(
    player_id=2, normalized_name=normalize_name("Lionel Andrés Messi Cuccittini"),
    birth_date=date(1987, 6, 24), nationality=["Argentina"],
)
NEYMAR = IdentityCandidate(
    player_id=3, normalized_name=normalize_name("Neymar da Silva Santos Júnior"),
    birth_date=date(1992, 2, 5), nationality=["Brazil"],
)


def test_normalize_name_strips_accents_and_case() -> None:
    assert normalize_name("Kylian Mbappé Lottin") == "kylian mbappe lottin"


def test_exact_normalized_name_and_birth_date_auto_resolves() -> None:
    query = IdentityQuery(raw_name="Kylian Mbappé Lottin", birth_date=date(1998, 12, 20))
    result = resolve_identity(query, [MBAPPE, MESSI])
    assert result.outcome == "auto_resolved"
    assert result.player_id == 1
    assert result.confidence == 1.0


def test_mononym_and_shortened_legal_name_auto_resolve() -> None:
    """token_set_ratio mesuré à 1.0 pour ces deux cas — c'est justement le
    problème que token_sort_ratio (mesuré à 0.34 et 0.57) ratait."""
    neymar_query = IdentityQuery(raw_name="Neymar")
    assert resolve_identity(neymar_query, [NEYMAR, MBAPPE, MESSI]).outcome == "auto_resolved"

    messi_query = IdentityQuery(raw_name="Lionel Messi")
    result = resolve_identity(messi_query, [NEYMAR, MBAPPE, MESSI])
    assert result.outcome == "auto_resolved"
    assert result.player_id == 2


def test_whitespace_variant_auto_resolves() -> None:
    query = IdentityQuery(raw_name="Kevin  De Bruyne")
    candidate = IdentityCandidate(player_id=4, normalized_name=normalize_name("Kevin De Bruyne"))
    result = resolve_identity(query, [candidate])
    assert result.outcome == "auto_resolved"
    assert result.player_id == 4


def test_abbreviated_initial_needs_review_not_auto_resolve() -> None:
    """Score réel mesuré : 0.80 pour 'K. Mbappé' — plausible mais pas assez
    sûr pour fusionner sans un humain, ne doit pas non plus être traité
    comme un nouveau joueur (le bon candidat existe déjà)."""
    query = IdentityQuery(raw_name="K. Mbappé")
    result = resolve_identity(query, [MBAPPE, MESSI])
    assert result.outcome == "needs_review"
    assert result.player_id is None
    assert result.candidates[0].player_id == 1


def test_unrelated_name_is_a_new_player_not_a_queue_entry() -> None:
    """Sans quoi, à l'échelle de Transfermarkt (~37 000 joueurs), tout
    joueur pas encore connu finirait à tort en file d'attente."""
    query = IdentityQuery(raw_name="Karim Benzema")
    result = resolve_identity(query, [MESSI])
    assert result.outcome == "new"
    assert result.player_id is None


def test_no_candidates_is_a_new_player() -> None:
    result = resolve_identity(IdentityQuery(raw_name="Personne Inconnue"), [])
    assert result.outcome == "new"
    assert result.candidates == []


def test_different_birth_date_disqualifies_even_a_similar_name() -> None:
    """Deux 'Antoine Dupont' nés à 20 ans d'écart : ce n'est pas la même
    personne, même si le nom matche parfaitement."""
    query = IdentityQuery(raw_name="Antoine Dupont", birth_date=date(2001, 1, 1))
    homonym = IdentityCandidate(
        player_id=9, normalized_name=normalize_name("Antoine Dupont"),
        birth_date=date(1980, 1, 1),
    )
    result = resolve_identity(query, [homonym])
    assert result.outcome == "new"
    assert result.candidates[0].score == 0.0


def test_missing_birth_date_on_either_side_does_not_disqualify() -> None:
    """StatsBomb Open Data ne fournit pas de date de naissance : l'absence
    d'un côté ne doit jamais bloquer un match par ailleurs solide."""
    query = IdentityQuery(raw_name="Kylian Mbappé Lottin", birth_date=None)
    result = resolve_identity(query, [MBAPPE])
    assert result.outcome == "auto_resolved"
    assert result.player_id == 1


def test_disjoint_nationality_penalizes_but_does_not_hard_disqualify() -> None:
    query = IdentityQuery(raw_name="Kylian Mbappé Lottin", nationality=["Belgium"])
    result = resolve_identity(query, [MBAPPE])
    assert result.candidates[0].score < 1.0
    assert result.candidates[0].score > 0.0


def test_candidates_are_ranked_best_first() -> None:
    query = IdentityQuery(raw_name="Kylian Mbappé")
    result = resolve_identity(query, [MESSI, MBAPPE])
    assert result.candidates[0].player_id == 1
    assert result.candidates[0].score >= result.candidates[1].score
