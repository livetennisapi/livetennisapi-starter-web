import { messages } from './messages.js';
import { matchView, sortMatches } from './score.js';

// All text goes in through textContent, never innerHTML, so a player or
// tournament name can never inject markup into the page.
function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === false || value == null) continue;
    if (name === 'text') node.textContent = value;
    else node.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children) {
    if (child != null) node.append(child);
  }
  return node;
}

function hidden(text) {
  return el('span', { class: 'visually-hidden', text });
}

function playerRow(view, side) {
  const name = view.players[side];
  const serving = view.server === side + 1;
  const head = el(
    'th',
    { scope: 'row', class: 'player' },
    serving ? el('span', { class: 'serve', 'aria-hidden': 'true' }) : null,
    el('span', { class: 'name', text: name }),
    serving ? hidden(` (${messages.serving})`) : null,
  );
  const row = el('tr', { class: serving ? 'is-serving' : null }, head);
  view.sets.forEach((pair, index) => {
    const current = index === view.sets.length - 1;
    row.append(el('td', { class: current ? 'set current' : 'set', text: pair[side] }));
  });
  const points = view.points[side];
  row.append(el('td', { class: 'pts' }, points ? el('span', { text: points }) : null));
  return row;
}

function scoreTable(view) {
  // Short headers on screen, full words for screen readers.
  const short = (visible, spoken) => [el('span', { 'aria-hidden': 'true', text: visible }), hidden(spoken)];
  const columns = el('tr', {}, el('th', { scope: 'col' }, hidden(messages.playerColumn)));
  view.sets.forEach((_, index) => {
    columns.append(el('th', { scope: 'col', class: 'set' }, ...short(String(index + 1), messages.setColumn(index + 1))));
  });
  columns.append(
    el(
      'th',
      { scope: 'col', class: 'pts' },
      ...(view.tiebreak ? short(messages.tiebreakColumn, messages.tiebreakTitle) : short(messages.gameColumn, messages.gameTitle)),
    ),
  );
  return el(
    'table',
    { class: 'score' },
    el('caption', { class: 'visually-hidden', text: messages.scoreCaption(view.players[0], view.players[1], view.summary) }),
    el('thead', {}, columns),
    el('tbody', {}, playerRow(view, 0), playerRow(view, 1)),
  );
}

function matchCard(match) {
  const view = matchView(match);
  const titleId = `match-${view.id}`;
  const body = view.known
    ? scoreTable(view)
    : el(
        'div',
        { class: 'pending' },
        el('p', { class: 'pending-names', text: `${view.players[0]} / ${view.players[1]}` }),
        el('p', { class: 'muted', text: messages.noScore }),
      );
  return el(
    'li',
    { class: 'card' },
    el(
      'article',
      { 'aria-labelledby': titleId },
      el(
        'header',
        { class: 'card-head' },
        el('span', { class: 'tour', text: view.tour }),
        el(
          'div',
          { class: 'event' },
          el('h3', { id: titleId, text: view.tournament }),
          view.round ? el('p', { class: 'round', text: view.doubles ? `${view.round}, doubles` : view.round }) : null,
        ),
        view.stage ? el('span', { class: 'stage' }, el('span', { class: 'dot', 'aria-hidden': 'true' }), view.stage) : null,
      ),
      body,
    ),
  );
}

export function renderMatches(root, page, { mode, nextLabel }) {
  const matches = sortMatches(page?.data ?? []);
  const count = root.querySelector('#count');
  const note = root.querySelector('#partial');
  const list = root.querySelector('#list');
  const empty = root.querySelector('#empty');
  root.querySelector('#matches').hidden = false;

  count.textContent = mode === 'sample' ? messages.sampleCount(matches.length) : messages.liveCount(matches.length);
  const total = page?.meta?.total;
  const more = page?.meta?.has_more === true;
  note.textContent = more && typeof total === 'number' ? messages.partial(matches.length, total) : '';
  note.hidden = !note.textContent;

  list.replaceChildren(...matches.map(matchCard));
  empty.textContent = matches.length === 0 ? messages.empty(nextLabel ?? '') : '';
  empty.hidden = matches.length !== 0;
}

export function renderStatus(root, { mode, text }) {
  const badge = root.querySelector('#mode');
  badge.className = `badge ${mode}`;
  badge.textContent = mode === 'sample' ? messages.sampleBadge : mode === 'live' ? messages.liveBadge : '';
  badge.hidden = mode !== 'sample' && mode !== 'live';
  root.querySelector('#status-text').textContent = text;
}

export function renderAlert(root, text) {
  const alert = root.querySelector('#alert');
  alert.textContent = text ?? '';
  alert.hidden = !text;
}
