import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateClan, calculateXp, makeRecord, isInteger, comparison } from '../src/calculations.js';
import { emptyState, loadState, saveState, STORAGE_KEY } from '../src/storage.js';

const member = (id, level, skill = 'tempo') => ({ id, name: id, level, skill, active: true });
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
  assert.equal(result.stats.tempo, 1);
  assert.equal(result.contributions.a.weight, 100);
  assert.equal(result.contributions.b.weight, 70);
  assert.equal(result.contributions.c.value, 0);
  assert.ok(Object.values(calculateClan([]).stats).every(value => value === 0));
});
test('Skills truncate after summing contributions, and XP uses whole skill values', () => {
  const players = ['assault', 'resilience', 'expansion', 'tempo', 'income'].flatMap(skill =>
    [member(`${skill}-a`, 3, skill), member(`${skill}-b`, 3, skill), member(`${skill}-c`, 3, skill)]);
  const { stats, contributions } = calculateClan(players);
  assert.ok(Object.values(stats).every(value => value === 4)); // 2 + 1.4 + 0.9 = 4.3
  assert.equal(contributions['tempo-b'].value, 1.4);
  assert.equal(contributions['tempo-c'].value, 0.9);
  const inputs = { territory: 100, walked: 10, neutral: 10, enemy: 10 };
  const fractional = Object.fromEntries(Object.keys(stats).map(key => [key, 4.99]));
  assert.deepEqual(calculateXp(inputs, fractional, players.length), calculateXp(inputs, stats, players.length));
  const record = makeRecord(players, inputs, 1);
  assert.deepEqual(record.stats, stats);
  close(record.xp.move, 60);
  close(record.xp.neutral, 46.4);
  close(record.xp.enemy, 92.8);
  close(record.xp.holding, 0.003 * 100 ** 0.7 * 288 / players.length * 1.12);
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
test('Inactive players contribute zero and do not occupy skill ranks', () => {
  const players = [member('leader', 101), member('second', 11), member('third', 6)];
  players[0].active = false;
  const { stats, contributions } = calculateClan(players);
  assert.equal(stats.tempo, 13);
  assert.deepEqual(contributions.leader, { points: 100, weight: 0, value: 0 });
  assert.equal(contributions.second.weight, 100);
  assert.equal(contributions.third.weight, 70);
  const inputs = { territory: 100, walked: 10, neutral: 0, enemy: 0 };
  const record = makeRecord(players, inputs, 1);
  assert.equal(record.members, 3);
  assert.deepEqual(record.xp, calculateXp(inputs, stats, 3));
  players[0].active = true;
  assert.equal(calculateClan(players).stats.tempo, 109);
  assert.equal(record.stats.tempo, 13);
  players.forEach(player => { player.active = false; });
  assert.ok(Object.values(calculateClan(players).stats).every(value => value === 0));
  assert.doesNotThrow(() => makeRecord(players, inputs, 2));
});
test('Legacy players default to active; saved inactivity survives reload', () => {
  const legacy = member('legacy', 11);
  delete legacy.active;
  const inactive = { ...member('inactive', 101), active: false };
  const saved = { version: 1, members: [legacy, inactive], inputs: zeroInputs() };
  const storage = { getItem() { return JSON.stringify(saved); } };
  const { state, error } = loadState(storage);
  assert.equal(error, '');
  assert.equal(state.members[0].active, true);
  assert.equal(state.members[1].active, false);
  assert.equal(calculateClan(state.members).stats.tempo, 10);
  assert.equal(calculateClan([legacy]).stats.tempo, 10);
  assert.throws(() => calculateClan([{ ...legacy, active: 'false' }]), RangeError);
});
test('Storage roundtrip saves only roster and inputs, never history', () => {
  const storage = { data: new Map(), getItem(key) { return this.data.get(key); }, setItem(key, value) { this.data.set(key, value); } };
  const state = { members: [member('a', 51), { ...member('b', 100), active: false }], inputs: zeroInputs(), history: [{ number: 1 }] };
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
