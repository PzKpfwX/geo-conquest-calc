import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateClan, calculateXp, makeRecord, isInteger, comparison } from '../src/calculations.js';
import { emptyState, loadState, saveState, STORAGE_KEY } from '../src/storage.js';

const member = (id, level, skill = 'tempo') => ({ id, name: id, level, skill });
const zeroInputs = () => emptyState().inputs;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('Each skill has its own ranking, weights extend beyond the fourth member', () => {
  const members = [member('low', 11), member('income', 41, 'income'), member('high', 51),
    member('second', 41), member('third', 31), member('fourth', 21), member('sixth', 6)];
  const before = structuredClone(members);
  const { stats, contributions } = calculateClan(members);
  assert.equal(stats.tempo, 98);
  assert.equal(stats.income, 40);
  assert.equal(stats.assault, 0);
  assert.equal(contributions.income.weight, 100);
  assert.equal(contributions.low.weight, 10);
  assert.deepEqual(members, before);
});
test('Equal levels preserve roster order; level one contributes zero', () => {
  const result = calculateClan([member('a', 2), member('b', 2), member('c', 1)]);
  assert.equal(result.stats.tempo, 1.7);
  assert.equal(result.contributions.a.weight, 100);
  assert.equal(result.contributions.b.weight, 70);
  assert.equal(result.contributions.c.value, 0);
  assert.ok(Object.values(calculateClan([]).stats).every(value => value === 0));
});
test('Personal XP applies clan bonuses and divides only holding XP', () => {
  const stats = { assault: 200, resilience: 100, tempo: 10, expansion: 20, income: 30 };
  const result = calculateXp({ territory: 10000, walked: 10, neutral: 20, enemy: 30 }, stats, 2);
  assert.equal(result.move, 75);
  assert.equal(result.neutral, 144);
  assert.equal(result.enemy, 432);
  close(result.holding, 0.003 * 10000 ** 0.7 * 288 / 2 * 1.9);
  close(result.total, 651 + result.holding);
  const largerClan = calculateXp({ territory: 10000, walked: 10, neutral: 20, enemy: 30 }, stats, 4);
  assert.equal(largerClan.move, result.move);
  assert.equal(largerClan.holding, result.holding / 2);
  assert.deepEqual(calculateXp(zeroInputs(), stats, 1), { move: 0, neutral: 0, enemy: 0, holding: 0, total: 0 });
});
test('Input validation rejects missing, fractional, negative and unsafe values', () => {
  for (const value of ['', ' ', null, false, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.equal(isInteger(value), false);
  assert.equal(isInteger(0), true);
  assert.equal(isInteger(0, 1), false);
  assert.throws(() => calculateClan([member('a', 0)]), RangeError);
  assert.throws(() => calculateXp(zeroInputs(), calculateClan([]).stats, 0), RangeError);
});
test('Record snapshots remain unchanged after editing players and actions', () => {
  const players = [member('a', 51), member('b', 31)];
  const inputs = { ...zeroInputs(), walked: 100 };
  const record = makeRecord(players, inputs, 1, new Date('2026-11-08T12:00:00Z'));
  assert.equal(record.stats.tempo, 71);
  close(record.xp.move, 2275);
  players[0].level = 100;
  inputs.walked = 200;
  assert.equal(record.inputs.walked, 100);
  assert.equal(record.stats.tempo, 71);
  assert.equal(record.members, 2);
});
test('Comparison reflects displayed precision, not invisible floating-point differences', () => {
  assert.equal(comparison(1.001, 1.002), '');
  assert.equal(comparison(1.01, 1), 'up');
  assert.equal(comparison(1, 1.01), 'down');
  assert.equal(comparison(42, undefined), '');
});
test('Storage roundtrip saves only roster and inputs, never history', () => {
  const storage = { data: new Map(), getItem(key) { return this.data.get(key); }, setItem(key, value) { this.data.set(key, value); } };
  const state = { members: [member('a', 51)], inputs: zeroInputs(), history: [{ number: 1 }] };
  assert.equal(saveState(storage, state), '');
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).history, undefined);
  assert.deepEqual(loadState(storage).state, { members: state.members, inputs: state.inputs });
  storage.setItem(STORAGE_KEY, '{broken');
  assert.ok(loadState(storage).error);
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, members: [member('a', 2), member('a', 2)], inputs: zeroInputs() }));
  assert.ok(loadState(storage).error);
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(loadState(denied).state, emptyState());
  assert.ok(saveState(denied, state));
});
