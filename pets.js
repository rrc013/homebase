// The kid's virtual pet: grows with every star earned, mood follows today's jobs
export const PETS = [
  { kind: 'puppy', emoji: '🐶', label: 'Puppy', name: 'Biscuit' },
  { kind: 'kitty', emoji: '🐱', label: 'Kitty', name: 'Whiskers' },
  { kind: 'bunny', emoji: '🐰', label: 'Bunny', name: 'Clover' },
  { kind: 'dragon', emoji: '🐲', label: 'Dragon', name: 'Sparky' },
  { kind: 'unicorn', emoji: '🦄', label: 'Unicorn', name: 'Twinkle' },
  { kind: 'panda', emoji: '🐼', label: 'Panda', name: 'Bamboo' },
  { kind: 'fox', emoji: '🦊', label: 'Fox', name: 'Ginger' },
  { kind: 'turtle', emoji: '🐢', label: 'Turtle', name: 'Shelly' },
];
export const petOf = (kind) => PETS.find((p) => p.kind === kind);

// stars earned (all time) needed for each level
const LEVELS = [0, 10, 25, 50, 80, 120, 170, 230, 300, 400, 520, 660];
// accessories unlocked as the pet grows
export const UNLOCKS = [
  { level: 2, emoji: '🎀', name: 'a bow' },
  { level: 3, emoji: '🧣', name: 'a cozy scarf' },
  { level: 4, emoji: '🕶️', name: 'cool sunglasses' },
  { level: 5, emoji: '🎈', name: 'a balloon' },
  { level: 6, emoji: '👑', name: 'a crown' },
  { level: 7, emoji: '🌈', name: 'a rainbow' },
  { level: 8, emoji: '🏰', name: 'a castle home' },
];

export function levelInfo(earned) {
  let lvl = 1;
  for (let i = 0; i < LEVELS.length; i++) if (earned >= LEVELS[i]) lvl = i + 1;
  const cur = LEVELS[lvl - 1], next = LEVELS[lvl] ?? cur + 150;
  const nextUnlock = UNLOCKS.find((u) => u.level > lvl);
  return { level: lvl, progress: Math.min(1, (earned - cur) / (next - cur)), toNext: next - earned, nextUnlock };
}

// mood from today's progress (0..1) and time of day
export function mood(ratio, asleep) {
  if (asleep) return { key: 'sleep', face: '💤', line: 'Zzz… sweet dreams' };
  if (ratio >= 1) return { key: 'happy', face: '💖', line: "I'm so full and happy! Thank you!" };
  if (ratio > 0) return { key: 'ok', face: '😋', line: 'Yum! Can we do another job?' };
  return { key: 'hungry', face: '🍽️', line: "I'm hungry! Let's do a job together!" };
}

export function petHtml(profile, earned, ratio, { asleep = false, size = 'lg' } = {}) {
  const pet = petOf(profile?.pet_kind);
  if (!pet) return `<div class="pet ${size}"><span class="pet-body">🥚</span></div>`;
  const { level } = levelInfo(earned);
  const m = mood(ratio, asleep);
  const scale = Math.min(1.35, 0.75 + level * 0.06);
  const acc = UNLOCKS.filter((u) => u.level <= level).map((u) => u.emoji);
  return `
    <div class="pet ${size} mood-${m.key}" style="--s:${scale}">
      ${acc.includes('🌈') ? '<span class="pet-bg">🌈</span>' : ''}
      ${acc.includes('🏰') ? '<span class="pet-home">🏰</span>' : ''}
      <span class="pet-body">${pet.emoji}</span>
      ${acc.includes('👑') ? '<span class="pet-hat">👑</span>' : acc.includes('🎀') ? '<span class="pet-hat bow">🎀</span>' : ''}
      ${acc.includes('🕶️') && !asleep ? '<span class="pet-glasses">🕶️</span>' : ''}
      ${acc.includes('🧣') ? '<span class="pet-scarf">🧣</span>' : ''}
      ${acc.includes('🎈') ? '<span class="pet-balloon">🎈</span>' : ''}
      <span class="pet-mood">${m.face}</span>
    </div>`;
}
