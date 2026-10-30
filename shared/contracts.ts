export const roles = ['scout', 'engineer', 'pilot'] as const;
export type Role = (typeof roles)[number];
export const roleInfo = {
  scout: {
    name: 'Scout',
    command: '!scan',
    system: 'Signal array',
    verb: 'mapped a signal',
    color: '#b6a0ff',
  },
  engineer: {
    name: 'Engineer',
    command: '!repair',
    system: 'Hull integrity',
    verb: 'restored the hull',
    color: '#f5bc75',
  },
  pilot: {
    name: 'Pilot',
    command: '!boost',
    system: 'Jump drive',
    verb: 'charged the drive',
    color: '#bff56b',
  },
};
export const missions = [
  {
    id: 'quiet-signal',
    name: 'The quiet signal',
    location: 'KEPLER EXCLUSION ZONE',
    description:
      'A stranded research vessel. One faint signal. Your entire community on the rescue crew.',
    goal: 24,
    minutes: 8,
  },
  {
    id: 'last-garden',
    name: 'The last garden',
    location: 'VERDANT ORBIT',
    description:
      'Carry the last seed vault through a solar storm. Every crew member keeps something alive.',
    goal: 32,
    minutes: 10,
  },
  {
    id: 'homeward',
    name: 'The long way home',
    location: 'THE OUTER REACH',
    description:
      'An incoming fleet needs a path home. Build a beacon together, one signal at a time.',
    goal: 40,
    minutes: 12,
  },
] as const;
export type Settings = {
  missionId: 'quiet-signal' | 'last-garden' | 'homeward';
  goal: number;
  durationMinutes: number;
  cooldownSeconds: number;
  welcomeBonus: boolean;
};
export type FeedItem = {
  id: string;
  at: number;
  kind: 'action' | 'system' | 'raid' | 'combo';
  name: string;
  text: string;
  role?: Role;
  first?: boolean;
};
type Player = { name: string; role: Role; actions: number; firstAt: number; lastAt: number };
export type MissionState = {
  schemaVersion: 1;
  id: string;
  status: 'ready' | 'active' | 'paused' | 'complete' | 'ended';
  source: 'rehearsal' | 'twitch';
  settings: Settings;
  startedAt: number | null;
  remainingMs: number;
  systems: Record<Role, number>;
  players: Record<string, Player>;
  feed: FeedItem[];
  actions: number;
  combos: number;
  welcomed: number;
  raid: { name: string; viewers: number; at: number; until: number } | null;
  comboWindow: { role: Role; userId: string; at: number }[];
};
export type MissionView = Omit<MissionState, 'players' | 'comboWindow'> & {
  crewCount: number;
  crew: (Player & { id: string })[];
  roleCounts: Record<Role, number>;
  progress: number;
  relay: Role[];
  catchup: string;
};
