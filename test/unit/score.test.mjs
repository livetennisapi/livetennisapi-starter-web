import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { matchView, sortMatches, tourLabel } from '../../src/score.js';

const sample = JSON.parse(readFileSync(new URL('../../public/sample/live-matches.json', import.meta.url), 'utf8'));
const byId = (id) => sample.data.find((match) => match.id === id);

test('games are read player-major, set by set', () => {
  // games [[6, 3, 4], [4, 6, 3]] reads 6-4, 3-6, 4-3.
  const view = matchView(byId(101));
  assert.deepEqual(view.sets, [
    ['6', '4'],
    ['3', '6'],
    ['4', '3'],
  ]);
  assert.deepEqual(view.points, ['40', '30']);
  assert.equal(view.server, 1);
  assert.equal(view.stage, 'Set 3');
  assert.equal(view.summary, '6-4 3-6 4-3 (40-30)');
});

test('a tiebreak is labelled and its points shown', () => {
  const view = matchView(byId(102));
  assert.equal(view.tiebreak, true);
  assert.equal(view.stage, 'Set 2, tiebreak');
  assert.deepEqual(view.points, ['5', '4']);
  assert.equal(view.server, 2);
});

test('advantage comes through as the API sends it', () => {
  assert.deepEqual(matchView(byId(103)).points, ['40', 'AD']);
});

test('doubles are flagged from the draw field', () => {
  assert.equal(matchView(byId(105)).doubles, true);
  assert.equal(matchView(byId(101)).doubles, false);
});

test('a match with no score yet does not invent one', () => {
  const view = matchView({ id: 1, tournament: 'T', players: { p1: { name: 'A' }, p2: { name: 'B' } }, score: null });
  assert.equal(view.known, false);
  assert.deepEqual(view.sets, []);
  assert.equal(view.stage, '');
  assert.equal(view.server, null);
});

test('withheld games (null) are not shown as 0-0', () => {
  const view = matchView({ id: 2, players: {}, score: { sets: [0, 0], games: null, points: ['0', '0'], server: 1 } });
  assert.equal(view.known, false);
  assert.deepEqual(view.points, ['', '']);
  assert.deepEqual(view.players, ['TBA', 'TBA']);
});

test('tours sort ATP, WTA, Challenger, ITF, juniors, then the rest', () => {
  const order = sortMatches([...sample.data, { id: 7, tour: null, tournament: 'Exhibition' }]).map((m) => m.tour);
  assert.deepEqual(order, ['atp', 'atp', 'wta', 'challenger', 'itf', 'juniors', null]);
  assert.equal(tourLabel('itf'), 'ITF');
  assert.equal(tourLabel(null), 'Other');
});

test('sorting does not change the input array', () => {
  const copy = structuredClone(sample.data);
  sortMatches(sample.data);
  assert.deepEqual(sample.data, copy);
});
