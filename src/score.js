import { gamesForSet } from 'livetennisapi';

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

// Only strings and finite numbers are shown. Anything else in a field (an
// object, null, a missing key) shows as empty instead of breaking the page.
function text(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

// A list answer is { data: [...], meta: {...} }. Drops list entries that are
// not objects. Returns null for anything else, and for a list where no entry
// survives, so a broken answer never replaces a good one.
export function cleanPage(page) {
  if (!page || typeof page !== 'object' || !Array.isArray(page.data)) return null;
  const data = page.data.filter((match) => match !== null && typeof match === 'object' && !Array.isArray(match));
  if (page.data.length > 0 && data.length === 0) return null;
  const meta = page.meta !== null && typeof page.meta === 'object' ? page.meta : {};
  return { data, meta };
}

// ATP first, then WTA, Challenger, ITF and juniors, then anything without a
// tour. Inside a tour, by tournament name, then by match id so the order is
// stable between refreshes.
export function sortMatches(matches) {
  return [...matches].sort((a, b) => {
    const tour = (TOUR_RANK.get(a.tour) ?? TOURS.length) - (TOUR_RANK.get(b.tour) ?? TOURS.length);
    if (tour !== 0) return tour;
    const name = text(a.tournament).localeCompare(text(b.tournament));
    if (name !== 0) return name;
    return number(a.id) - number(b.id);
  });
}

function hasGames(score) {
  return (
    score != null &&
    Array.isArray(score.games) &&
    score.games.length >= 2 &&
    Array.isArray(score.games[0]) &&
    Array.isArray(score.games[1]) &&
    score.games[0].length + score.games[1].length > 0
  );
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
    sets.push([text(p1), text(p2)]);
  }
  const points = known && Array.isArray(score.points) ? [text(score.points[0]), text(score.points[1])] : ['', ''];
  const games = sets.map(([p1, p2]) => `${p1}-${p2}`).join(' ');
  const server = score?.server === 1 || score?.server === 2 ? score.server : null;
  const tiebreak = known && score.is_tiebreak === true;

  return {
    tour: tourLabel(match.tour),
    tournament: text(match.tournament) || 'Unnamed tournament',
    round: text(match.round),
    doubles: match.draw === 'doubles',
    players: [text(match.players?.p1?.name) || 'TBA', text(match.players?.p2?.name) || 'TBA'],
    known,
    sets,
    points,
    server,
    tiebreak,
    stage: !known ? '' : tiebreak ? `Set ${setCount}, tiebreak` : `Set ${setCount}`,
    // The same text formatScore() from the client gives, built from the
    // checked values above: 6-4 3-6 4-3 (40-30).
    summary: points[0] || points[1] ? `${games} (${points[0]}-${points[1]})` : games,
  };
}
