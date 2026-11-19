// Every sentence the script shows, in one place, so the copy is easy to change.
// The fixed text (header, notice, footer) is in index.html.
// `time` is a short local clock time such as 21:55.

export const messages = {
  loading: 'Loading live matches.',
  sampleBadge: 'Sample data',
  liveBadge: 'Live',
  sampleStatus: 'Made-up players and scores. This mode does not refresh.',
  updated: (updated, next) => `Updated ${updated}. Next refresh ${next}.`,
  waiting: (next) => `Next refresh ${next}.`,
  paused: 'Refresh paused while this tab is hidden.',

  liveCount: (count) => (count === 1 ? '1 live match' : `${count} live matches`),
  sampleCount: (count) => (count === 1 ? '1 sample match' : `${count} sample matches`),
  partial: (shown, total) => `Showing the first ${shown} of ${total}.`,
  partialUnknown: (shown) => `Showing the first ${shown}. More matches are live.`,
  empty: 'No matches are live right now.',
  noScore: 'No score yet.',
  serving: 'serving',
  playerColumn: 'Player',
  gameColumn: 'Game',
  gameTitle: 'Points in this game',
  tiebreakColumn: 'TB',
  tiebreakTitle: 'Tiebreak points',
  setColumn: (n) => `Set ${n}`,
  scoreCaption: (p1, p2, summary) => (summary ? `${p1} against ${p2}, ${summary}` : `${p1} against ${p2}`),

  errors: {
    auth: 'The API did not accept this key. Check LIVETENNISAPI_KEY, then build again.',
    plan: 'The plan on this API key does not cover live matches. Plans are listed at livetennisapi.com/pricing.',
    daily: (next) => `This API key has used its requests for today. The page tries again at ${next}.`,
    throttled: (next) => `The API has paused this key for calling too often. The page tries again at ${next}.`,
    busy: (next) => `The API asked the page to slow down. It tries again at ${next}.`,
    failed: (next) => `Could not load live matches. The page tries again at ${next}.`,
    sample: 'Could not load the sample data. Run npm run build, then serve the dist folder.',
  },
};
