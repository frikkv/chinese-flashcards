/**
 * In-session XP combo system.
 *
 * First 3 correct in a row: +1 XP each (normal).
 * 4th+ correct in a row: +2, +3, +4, ... XP (combo bonus).
 * Any wrong answer resets the combo to 0.
 *
 * Formula: combo < 4 → 1 XP, combo >= 4 → (combo - 2) XP.
 */
export function comboXp(combo: number): number {
  return combo >= 4 ? combo - 2 : 1
}
