export const SKILLS = [
  { id: 'assault', name: 'Натиск', symbol: '↗', hint: 'Шанс захвата территории' },
  { id: 'resilience', name: 'Стойкость', symbol: '◇', hint: 'Защита территории' },
  { id: 'expansion', name: 'Экспансия', symbol: '⌘', rate: 4, hint: 'к опыту за захват' },
  { id: 'tempo', name: 'Темп', symbol: '»', rate: 5, hint: 'к опыту за движение' },
  { id: 'income', name: 'Доход', symbol: '◈', rate: 3, hint: 'к опыту за удержание' },
];
export const INPUTS = [
  { id: 'territory', name: 'Территория клана', hint: 'Удерживаемые ячейки · за сутки' },
  { id: 'walked', name: 'Пройдено ячеек', hint: 'Ваши действия' },
  { id: 'neutral', name: 'Захвачено нейтральных', hint: 'Только успешные захваты' },
  { id: 'enemy', name: 'Захвачено чужих', hint: 'Только успешные захваты' },
];
export const XP_LABELS = {
  move: 'Движение', neutral: 'Нейтральный захват', enemy: 'Чужой захват',
  holding: 'Удержание за сутки', total: 'Всего опыта',
};
export function isInteger(value, min = 0) {
  return (typeof value === 'number' || typeof value === 'string') &&
    String(value).trim() !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= min;
}
export function validMember(member) {
  return member && typeof member.id === 'string' && member.id.length > 0 &&
    typeof member.name === 'string' && member.name.trim().length > 0 &&
    isInteger(member.level, 1) && SKILLS.some(s => s.id === member.skill);
}
export function calculateClan(members) {
  if (!members.every(validMember)) throw new RangeError('Некорректные данные игрока');
  const stats = {};
  const contributions = {};
  for (const skill of SKILLS) {
    // Stable sort preserves roster order when levels match.
    const ranked = members.filter(m => m.skill === skill.id).toSorted((a, b) => b.level - a.level);
    let weightedPoints = 0;
    ranked.forEach((member, index) => {
      const weight = [100, 70, 45, 25][index] ?? 10;
      const points = Number(member.level) - 1;
      weightedPoints += points * weight;
      contributions[member.id] = { points, weight, value: points * weight / 100 };
    });
    stats[skill.id] = weightedPoints / 100;
  }
  return { stats, contributions };
}
export function calculateXp(inputs, stats, memberCount) {
  if (!isInteger(memberCount, 1) || !INPUTS.every(f => isInteger(inputs[f.id]))) {
    throw new RangeError('Нужны участники и целые неотрицательные количества ячеек');
  }
  if (!SKILLS.every(s => Number.isFinite(stats[s.id]) && stats[s.id] >= 0)) {
    throw new RangeError('Некорректные навыки');
  }
  const result = {
    move: 5 * inputs.walked * (1 + 0.05 * stats.tempo),
    neutral: 4 * inputs.neutral * (1 + 0.04 * stats.expansion),
    enemy: 8 * inputs.enemy * (1 + 0.04 * stats.expansion),
    holding: 0.003 * inputs.territory ** 0.7 * 288 / memberCount * (1 + 0.03 * stats.income),
  };
  result.total = Object.values(result).reduce((sum, value) => sum + value, 0);
  return result;
}
export function makeRecord(members, inputs, number, date = new Date()) {
  const { stats } = calculateClan(members);
  return {
    number, date: date.toISOString(), inputs: { ...inputs }, members: members.length,
    stats, xp: calculateXp(inputs, stats, members.length),
  };
}
export const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
export const formatNumber = value => numberFormat.format(value);
export function comparison(current, previous) {
  if (previous === undefined || formatNumber(current) === formatNumber(previous)) return '';
  return current > previous ? 'up' : 'down';
}
