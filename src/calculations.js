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
const BOOST_POINTS = 10;
const HOLDING_TICKS_PER_DAY = 288;
const BOOSTED_HOLDING_TICKS = 24;

export function validMember(member) {
  return member && typeof member.id === 'string' && member.id.length > 0 &&
    typeof member.name === 'string' && member.name.trim().length > 0 &&
    isInteger(member.level, 1) && SKILLS.some(s => s.id === member.skill) &&
    (member.active === undefined || typeof member.active === 'boolean') &&
    (member.boosted === undefined || typeof member.boosted === 'boolean');
}
export function calculateClan(members, { includeBoosts = true } = {}) {
  if (!members.every(validMember)) throw new RangeError('Некорректные данные игрока');
  const stats = {};
  const contributions = {};
  for (const member of members) {
    const points = Number(member.level) - 1 + (includeBoosts && member.boosted ? BOOST_POINTS : 0);
    contributions[member.id] = { points, weight: 0, value: 0 };
  }
  for (const skill of SKILLS) {
    // Stable sort preserves roster order when effective skill values match.
    const ranked = members.filter(m => m.active !== false && m.skill === skill.id)
      .toSorted((a, b) => contributions[b.id].points - contributions[a.id].points);
    let weightedPoints = 0;
    ranked.forEach((member, index) => {
      const weight = [100, 70, 45, 25][index] ?? 10;
      const { points } = contributions[member.id];
      weightedPoints += points * weight;
      contributions[member.id] = { points, weight, value: points * weight / 100 };
    });
    // Truncate only the final sum, preserving each member's fractional contribution.
    stats[skill.id] = Math.floor(weightedPoints / 100);
  }
  return { stats, contributions };
}
export function calculateXp(inputs, stats, memberCount, baseIncome = stats.income) {
  if (!isInteger(memberCount, 1) || !INPUTS.every(f => isInteger(inputs[f.id]))) {
    throw new RangeError('Нужны участники и целые неотрицательные количества ячеек');
  }
  if (!SKILLS.every(s => Number.isFinite(stats[s.id]) && stats[s.id] >= 0) ||
      !Number.isFinite(baseIncome) || baseIncome < 0 || baseIncome > stats.income) {
    throw new RangeError('Некорректные навыки');
  }
  const baseHoldingMultiplier = 1 + 0.03 * Math.floor(baseIncome);
  const boostedIncomeBonus = 0.03 * (Math.floor(stats.income) - Math.floor(baseIncome));
  const holdingMultiplier = baseHoldingMultiplier + boostedIncomeBonus * BOOSTED_HOLDING_TICKS / HOLDING_TICKS_PER_DAY;
  const result = {
    move: 5 * inputs.walked * (1 + 0.05 * Math.floor(stats.tempo)),
    neutral: 4 * inputs.neutral * (1 + 0.04 * Math.floor(stats.expansion)),
    enemy: 8 * inputs.enemy * (1 + 0.04 * Math.floor(stats.expansion)),
    holding: 0.003 * inputs.territory ** 0.7 * HOLDING_TICKS_PER_DAY / memberCount * holdingMultiplier,
  };
  result.total = Object.values(result).reduce((sum, value) => sum + value, 0);
  return result;
}
export function makeRecord(members, inputs, number, date = new Date()) {
  const { stats } = calculateClan(members);
  const { stats: baseStats } = calculateClan(members, { includeBoosts: false });
  return {
    number, date: date.toISOString(), inputs: { ...inputs }, members: members.length,
    stats, xp: calculateXp(inputs, stats, members.length, baseStats.income),
  };
}
export const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
export const formatNumber = value => numberFormat.format(value);
export function comparison(current, previous) {
  if (previous === undefined || formatNumber(current) === formatNumber(previous)) return '';
  return current > previous ? 'up' : 'down';
}
