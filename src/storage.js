import { INPUTS, isInteger, validMember } from './calculations.js';

export const STORAGE_KEY = 'geoconquest-calculator-v1';
export const emptyState = () => ({ members: [], inputs: Object.fromEntries(INPUTS.map(f => [f.id, 0])) });
export function loadState(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { state: emptyState(), error: '' };
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || !Array.isArray(saved.members) || !saved.members.every(validMember) ||
        new Set(saved.members.map(m => m.id)).size !== saved.members.length ||
        !INPUTS.every(f => isInteger(saved.inputs?.[f.id]))) throw new Error('Invalid saved data');
    return { state: {
      members: saved.members.map(m => ({ id: m.id, name: m.name.trim(), level: Number(m.level), skill: m.skill })),
      inputs: Object.fromEntries(INPUTS.map(f => [f.id, Number(saved.inputs[f.id])])),
    }, error: '' };
  } catch {
    return { state: emptyState(), error: 'Не удалось загрузить сохранённые данные. Можно продолжить с пустым списком.' };
  }
}
export function saveState(storage, state) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, members: state.members, inputs: state.inputs }));
    return '';
  } catch {
    return 'Не удалось сохранить данные в браузере. До закрытия страницы они доступны.';
  }
}
