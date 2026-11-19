import { formatScore, gamesForSet } from 'livetennisapi';

const TOURS = [
  ['atp', 'ATP'],
  ['wta', 'WTA'],
  ['challenger', 'Challenger'],
  ['itf', 'ITF'],
  ['juniors', 'Juniors'],
];
const TOUR_LABEL = new Map(TOURS);
const TOUR_RANK = new Map(TOURS.map(([tour], index) => [tour, index]));

export function tourLabel(tour) {
  return TOUR_LABEL.get(tour) ?? 'Other';
}

// ATP first, then WTA, Challenger, ITF and juniors, then anything without a
// tour. Inside a tour, by tournament name, then by match id so the order is
// stable between refreshes.
export function sortMatches(matches) {
  return [...matches].sort((a, b) => {
    const tour = (TOUR_RANK.get(a.tour) ?? TOURS.length) - (TOUR_RANK.get(b.tour) ?? TOURS.length);
    if (tour !== 0) return tour;
    const name = String(a.tournament ?? '').localeCompare(String(b.tournament ?? ''));
    if (name !== 0) return name;
    return (a.id ?? 0) - (b.id ?? 0);
  });
}

function hasGames(score) {
  return (
    score != null &&
    Array.isArray(score.games) &&
    score.games.length >= 2 &&
    Array.isArray(score.games[0]) &&
    Array.isArray(score.games[1])
  );
}

function cell(value) {
  return value === undefined || value === null ? '' : String(value);
}

// Everything the card needs, read from one Match object. `score.games` is
// player-major ([[p1 set 1, p1 set 2], [p2 set 1, p2 set 2]]), so the sets
// are read through gamesForSet() from the client instead of by hand.
export function matchView(match) {
  const score = match.score ?? null;
  const known = hasGames(score);
  const setCount = known ? Math.max(score.games[0].length, score.games[1].length) : 0;
  const sets = [];
  for (let index = 0; index < setCount; index += 1) {
    const [p1, p2] = gamesForSet(score, index);
    sets.push([cell(p1), cell(p2)]);
  }
  const points = known && Array.isArray(score.points) ? score.points : [];
  const server = score?.server === 1 || score?.server === 2 ? score.server : null;
  const tiebreak = known && score.is_tiebreak === true;

  return {
    id: match.id,
    tour: tourLabel(match.tour),
    tournament: match.tournament || 'Unnamed tournament',
    round: match.round || '',
    doubles: match.draw === 'doubles',
    players: [match.players?.p1?.name || 'TBA', match.players?.p2?.name || 'TBA'],
    known,
    sets,
    points: [cell(points[0]), cell(points[1])],
    server,
    tiebreak,
    stage: !known ? '' : tiebreak ? `Set ${setCount}, tiebreak` : `Set ${setCount}`,
    summary: known ? formatScore(score) : '',
  };
}
