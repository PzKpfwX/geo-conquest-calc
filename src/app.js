import { SKILLS, INPUTS, XP_LABELS, isInteger, calculateClan, makeRecord, formatNumber as fmt, comparison } from './calculations.js';
import { loadState, saveState } from './storage.js';

const $ = selector => document.querySelector(selector);
// Access through a wrapper also catches browsers that deny the localStorage getter.
const storage = { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) };
const loaded = loadState(storage);
const state = loaded.state;
let history = [];
let sequence = 0;
let deleted = null;
let undoTimer;
const escapeHtml = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const skillOptions = selected => SKILLS.map(s => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${s.name}</option>`).join('');
function showStorageError(message) {
  $('#storage-warning').hidden = !message;
  $('#storage-warning').textContent = message;
}
function persist() { showStorageError(saveState(storage, state)); }
function errorFor(input) {
  if (input.name === 'name') return input.value.trim() ? '' : 'Укажите имя игрока';
  if (input.name === 'skill') return SKILLS.some(s => s.id === input.value) ? '' : 'Выберите навык';
  return isInteger(input.value, input.name === 'level' ? 1 : 0) ? '' :
    input.name === 'level' ? 'Введите целый уровень от 1' : 'Введите целое число от 0';
}
function validate(input) {
  const message = errorFor(input);
  input.setAttribute('aria-invalid', String(Boolean(message)));
  const error = input.closest('label').querySelector('.field-error');
  error.textContent = message;
  return !message;
}
function updateAvailability() {
  const invalid = $('#roster [aria-invalid="true"], #xp-fields [aria-invalid="true"]');
  $('#calculate').disabled = !state.members.length || Boolean(invalid);
  $('#calculation-hint').textContent = !state.members.length ? 'Добавьте хотя бы одного игрока' : invalid ? 'Исправьте отмеченные поля' : 'Результат появится в журнале ниже';
}
function renderStats() {
  const { stats, contributions } = calculateClan(state.members);
  $('#member-count').textContent = `Игроков: ${state.members.length}`;
  $('#stats').innerHTML = SKILLS.map(s => `<article class="stat-card ${s.id}"><div class="stat-heading"><span>${s.name}</span><span class="stat-icon" aria-hidden="true">${s.symbol}</span></div><div class="stat-value">${fmt(stats[s.id])}</div><div class="stat-description">${s.rate ? `<strong>+${fmt(stats[s.id] * s.rate)}%</strong> ${s.hint}` : s.hint}</div></article>`).join('');
  for (const row of document.querySelectorAll('[data-member]')) {
    const item = contributions[row.dataset.member];
    row.querySelector('[data-points]').textContent = fmt(item.points);
    row.querySelector('[data-contribution]').innerHTML = `<span>${fmt(item.points)} × ${item.weight}% =</span> <strong>${fmt(item.value)}</strong>`;
  }
  $('#holding-note').textContent = state.members.length ? `Опыт за удержание делится поровну на всех участников клана: ${state.members.length}.` : 'Опыт за удержание делится поровну между участниками клана.';
  updateAvailability();
}
function renderRoster() {
  const drafts = new Map([...document.querySelectorAll('[data-member]')].map(row => [row.dataset.member,
    [...row.querySelectorAll('input:not([type="checkbox"]),select')].map(input => ({ name: input.name, value: input.value }))]));
  $('#roster').innerHTML = state.members.length ? `<div class="table-header"><span>Имя</span><span>Уровень</span><span>Навык</span><span>Значение</span><span>Вклад в клан</span><span></span></div>${state.members.map(m => `<div class="member-row" data-member="${escapeHtml(m.id)}">
    <label><span class="sr-only mobile-label">Имя</span><input name="name" value="${escapeHtml(m.name)}" aria-label="Имя игрока" aria-describedby="name-error-${escapeHtml(m.id)}" required><span id="name-error-${escapeHtml(m.id)}" class="field-error"></span></label>
    <label><span class="sr-only mobile-label">Уровень</span><input name="level" type="number" min="1" step="1" inputmode="numeric" value="${m.level}" aria-label="Уровень игрока" aria-describedby="level-error-${escapeHtml(m.id)}" required><span id="level-error-${escapeHtml(m.id)}" class="field-error"></span></label>
    <label><span class="sr-only mobile-label">Навык</span><select name="skill" aria-label="Навык игрока">${skillOptions(m.skill)}</select><span class="field-error"></span></label>
    <div class="points-cell"><span class="mobile-only subtle">Значение навыка</span><span data-points></span><label class="activity-control"><input name="active" type="checkbox" ${m.active !== false ? 'checked' : ''}>Активен</label></div>
    <div class="contribution-cell"><span class="mobile-only subtle">Вклад в клан</span><span data-contribution></span></div>
    <button type="button" class="delete-member" aria-label="Удалить игрока ${escapeHtml(m.name)}" title="Удалить игрока">×</button>
  </div>`).join('')}` : '<div class="empty-roster"><span class="empty-symbol" aria-hidden="true">♧</span><h3>Большие планы начинаются с команды</h3><p>Добавьте первого игрока, чтобы рассчитать навыки клана.</p></div>';
  for (const row of document.querySelectorAll('[data-member]')) {
    for (const draft of drafts.get(row.dataset.member) ?? []) {
      const input = row.querySelector(`[name="${draft.name}"]`);
      input.value = draft.value;
      validate(input);
    }
  }
  renderStats();
}
function renderInputs() {
  $('#xp-fields').innerHTML = INPUTS.map(f => `<label for="input-${f.id}">${f.name}<span class="input-hint">${f.hint}</span><div class="input-with-unit"><input id="input-${f.id}" name="${f.id}" type="number" min="0" step="1" inputmode="numeric" value="${state.inputs[f.id]}" aria-describedby="error-${f.id}" required><span aria-hidden="true">ячеек</span></div><span class="field-error" id="error-${f.id}"></span></label>`).join('');
}
function colored(value, previous) {
  const direction = comparison(value, previous);
  return `<span class="${direction}" ${direction ? `title="${direction === 'up' ? 'Выросло' : 'Уменьшилось'}: ранее ${fmt(previous)}"` : ''}>${direction ? `<span aria-hidden="true">${direction === 'up' ? '↑' : '↓'}</span><span class="sr-only">${direction === 'up' ? 'Рост:' : 'Снижение:'}</span> ` : ''}${fmt(value)}</span>`;
}
function renderHistory() {
  $('#history-count').textContent = history.length;
  $('#clear-history').disabled = !history.length;
  $('#history').innerHTML = history.length ? history.toReversed().map((record, reverseIndex) => {
    const previous = history[history.length - reverseIndex - 2];
    return `<article class="panel history-card"><div class="history-card-heading"><h3>Расчёт №${record.number}${reverseIndex === 0 ? '<span class="latest-tag">Последний</span>' : ''}</h3><time datetime="${record.date}">${new Date(record.date).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></div>
      <div class="history-stats">${SKILLS.map(s => `<div>${s.name} <strong>${colored(record.stats[s.id], previous?.stats[s.id])}</strong></div>`).join('')}</div>
      <div class="xp-results">${Object.entries(XP_LABELS).map(([key, label]) => `<div class="xp-result ${key === 'total' ? 'total' : ''}"><span>${label}</span><strong>${colored(record.xp[key], previous?.xp[key])} <small>XP</small></strong></div>`).join('')}</div>
      <details><summary>Исходные данные</summary><dl>${INPUTS.map(f => `<div><dt>${f.name}</dt><dd>${fmt(record.inputs[f.id])}</dd></div>`).join('')}<div><dt>Участников клана</dt><dd>${record.members}</dd></div><div><dt>Период удержания</dt><dd>24 часа</dd></div></dl></details></article>`;
  }).join('') : '<div class="empty-history"><span class="empty-symbol" aria-hidden="true">≋</span><h3>Здесь будет история ваших решений</h3><p>Введите количество ячеек и нажмите «Расчёт».<br>Меняйте состав клана и сравнивайте результаты.</p></div>';
}
function closeAdd() {
  $('#add-form').hidden = true;
  $('#show-add').setAttribute('aria-expanded', 'false');
  $('#show-add').focus();
}
$('#add-form select').insertAdjacentHTML('beforeend', skillOptions(''));
$('#show-add').addEventListener('click', () => {
  const form = $('#add-form');
  if (!form.hidden) return closeAdd();
  form.hidden = false;
  $('#show-add').setAttribute('aria-expanded', 'true');
  form.elements.name.focus();
});
$('#cancel-add').addEventListener('click', closeAdd);
$('#add-form').addEventListener('input', event => { if (event.target.matches('input,select')) validate(event.target); });
$('#add-form').addEventListener('submit', event => {
  event.preventDefault();
  const fields = [...event.currentTarget.querySelectorAll('input,select')];
  if (!fields.map(validate).every(Boolean)) { fields.find(f => f.getAttribute('aria-invalid') === 'true').focus(); return; }
  const data = new FormData(event.currentTarget);
  state.members.push({ id: crypto.randomUUID(), name: data.get('name').trim(), level: Number(data.get('level')), skill: data.get('skill'), active: true });
  event.currentTarget.reset();
  fields.forEach(f => f.removeAttribute('aria-invalid'));
  closeAdd(); renderRoster(); persist();
});
$('#roster').addEventListener('input', event => {
  const input = event.target;
  if (!input.matches('input,select')) return;
  if (input.name === 'active') {
    const member = state.members.find(m => m.id === input.closest('[data-member]').dataset.member);
    member.active = input.checked;
    persist(); renderStats();
    return;
  }
  if (validate(input)) {
    const member = state.members.find(m => m.id === input.closest('[data-member]').dataset.member);
    member[input.name] = input.name === 'level' ? Number(input.value) : input.value.trim();
    if (input.name === 'name') input.closest('[data-member]').querySelector('.delete-member').setAttribute('aria-label', `Удалить игрока ${member.name}`);
    persist(); renderStats();
  }
  updateAvailability();
});
$('#roster').addEventListener('click', event => {
  if (!event.target.closest('.delete-member')) return;
  const row = event.target.closest('[data-member]');
  const index = state.members.findIndex(m => m.id === row.dataset.member);
  deleted = { member: state.members[index], index };
  state.members.splice(index, 1);
  renderRoster(); persist();
  $('#toast').hidden = false;
  $('#undo-delete').focus();
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { $('#toast').hidden = true; deleted = null; }, 10000);
});
$('#undo-delete').addEventListener('click', () => {
  if (!deleted) return;
  state.members.splice(deleted.index, 0, deleted.member);
  deleted = null; clearTimeout(undoTimer); $('#toast').hidden = true;
  renderRoster(); persist(); $('#show-add').focus();
});
$('#xp-fields').addEventListener('input', event => {
  if (!event.target.matches('input')) return;
  if (validate(event.target)) { state.inputs[event.target.name] = Number(event.target.value); persist(); }
  updateAvailability();
});
$('#xp-form').addEventListener('submit', event => {
  event.preventDefault();
  const fields = [...document.querySelectorAll('#roster input:not([type="checkbox"]), #roster select, #xp-fields input')];
  if (!fields.map(validate).every(Boolean) || !state.members.length) { updateAvailability(); return; }
  history.push(makeRecord(state.members, state.inputs, ++sequence));
  renderHistory();
  $('#history-announcement').textContent = `Расчёт №${sequence}: всего ${fmt(history.at(-1).xp.total)} XP`;
  $('#history-title').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
});
$('#clear-history').addEventListener('click', () => $('#clear-dialog').showModal());
$('#clear-dialog').addEventListener('close', () => {
  if ($('#clear-dialog').returnValue !== 'clear') return;
  history = []; sequence = 0; renderHistory();
  $('#history-announcement').textContent = 'Журнал очищен';
  $('#calculate').focus();
});
renderRoster(); renderInputs(); renderHistory(); showStorageError(loaded.error);
