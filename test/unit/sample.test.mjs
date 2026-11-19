import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// The keyless sample must look like a real GET /matches?status=live answer
// (see Match and Score in https://docs.livetennisapi.com/openapi.yaml) and must
// never look like a real result: every player is a made-up name.
const sample = JSON.parse(readFileSync(new URL('../../public/sample/live-matches.json', import.meta.url), 'utf8'));

const TOURS = ['atp', 'wta', 'challenger', 'itf', 'juniors', null];
const isIntArray = (value) => Array.isArray(value) && value.every(Number.isInteger);

test('the sample is a list response with data and meta', () => {
  assert.ok(Array.isArray(sample.data));
  assert.ok(sample.data.length > 0);
  assert.equal(sample.meta.count, sample.data.length);
  assert.equal(sample.meta.has_more, false);
  assert.ok(Number.isInteger(sample.meta.limit));
});

test('every player name is clearly made up', () => {
  for (const match of sample.data) {
    for (const side of ['p1', 'p2']) {
      assert.match(match.players[side].name, /\(synthetic\)$/, `match ${match.id} ${side}`);
    }
  }
});

test('every tournament name is clearly a sample', () => {
  for (const match of sample.data) assert.match(match.tournament, /Sample/, `match ${match.id}`);
});

test('each match has the fields and types the API documents', () => {
  for (const match of sample.data) {
    const where = `match ${match.id}`;
    assert.ok(Number.isInteger(match.id), where);
    assert.equal(match.status, 'live', where);
    assert.ok(TOURS.includes(match.tour), where);
    assert.ok(['singles', 'doubles', null].includes(match.draw), where);
    assert.equal(typeof match.is_doubles, 'boolean', where);
    assert.ok(['BO3', 'BO5', null].includes(match.format), where);

    const { score } = match;
    assert.ok(isIntArray(score.sets) && score.sets.length === 2, where);
    assert.ok(Array.isArray(score.games) && score.games.length === 2, where);
    assert.ok(score.games.every(isIntArray), where);
    assert.equal(score.games[0].length, score.games[1].length, where);
    assert.ok(score.points.length === 2 && score.points.every((p) => typeof p === 'string'), where);
    assert.ok([1, 2, null].includes(score.server), where);
    assert.equal(typeof score.is_tiebreak, 'boolean', where);
    assert.ok(Number.isInteger(score.sequence), where);
  }
});
