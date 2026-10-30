import type { Role } from './contracts.js';

export const routes = ['beacon', 'drift'] as const;
export type Route = (typeof routes)[number];
export type ExpeditionScript = {
  acts: Record<Role, { title: string; objective: string }>;
  routes: Record<Route, { name: string; description: string; ending: string }>;
};
export type ExpeditionState = {
  phase: Role | 'choice' | 'complete';
  script: ExpeditionScript;
  contributors: Record<Role, string[]>;
  route: Route | null;
  votes: Record<string, Route>;
  ballotMs: number;
  milestones: { phase: Role | 'choice' | 'complete'; at: number }[];
  lastSignal: { id: string; role: Role } | null;
};
export type ExpeditionView = Omit<ExpeditionState, 'contributors' | 'votes'> & {
  contributors: Record<Role, number>;
  targets: Record<Role, number>;
  votes: Record<Route, number>;
};
export function expeditionTargets(crew: number, route: Route | null) {
  return {
    scout: crew,
    engineer: route === 'beacon' ? crew + 1 : route === 'drift' ? Math.max(2, crew - 1) : crew,
    pilot: route === 'drift' ? crew + 1 : route === 'beacon' ? Math.max(2, crew - 1) : crew,
  };
}
export function defaultExpedition(missionId?: string): ExpeditionScript {
  const story =
    missionId === 'last-garden'
      ? {
          scout: 'Find the seed ark',
          engineer: 'Shield the last garden',
          pilot: 'Carry life home',
          object: 'seed ark',
        }
      : missionId === 'homeward'
        ? {
            scout: 'Find the lost fleet',
            engineer: 'Reconnect the convoy',
            pilot: 'Guide the fleet home',
            object: 'lost fleet',
          }
        : {
            scout: 'Find the quiet signal',
            engineer: 'Restore the lifeline',
            pilot: 'Bring them home',
            object: 'stranded ark',
          };
  return {
    acts: {
      scout: {
        title: story.scout,
        objective: `Different scouts map the ${story.object} with !scan.`,
      },
      engineer: {
        title: story.engineer,
        objective: `Different engineers stabilize the ${story.object} with !repair.`,
      },
      pilot: {
        title: story.pilot,
        objective: `Different pilots guide the ${story.object} to safety with !boost.`,
      },
    },
    routes: {
      beacon: {
        name: 'The lighthouse',
        description: 'Rebuild the beacon: more engineers, fewer pilots.',
        ending: `The restored lighthouse shines as the ${story.object} reaches home.`,
      },
      drift: {
        name: 'The silent passage',
        description: 'Take the debris passage: fewer engineers, more pilots.',
        ending: `Your convoy slips through the debris and carries the ${story.object} to safety.`,
      },
    },
  };
}
export function expeditionHint(e: ExpeditionView) {
  if (e.phase === 'complete') return e.script.routes[e.route ?? 'beacon'].ending;
  if (e.phase === 'choice')
    return 'Choose our route: !route beacon or !route drift. One vote per person; you can change it.';
  const command = { scout: '!scan', engineer: '!repair', pilot: '!boost' }[e.phase];
  return `${e.script.acts[e.phase].title}: ${e.contributors[e.phase]}/${e.targets[e.phase]} different ${e.phase}s. Type ${command}; each person counts once in this act.`;
}
