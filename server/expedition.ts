import { z } from 'zod';
import {
  defaultExpedition,
  expeditionTargets,
  type ExpeditionState,
  type ExpeditionScript,
  type ExpeditionView,
  type Route,
} from '../shared/expedition.js';
const text = (max: number) => z.string().trim().min(1).max(max);
const act = z.object({ title: text(64), objective: text(160) }).strict();
const route = z.object({ name: text(48), description: text(160), ending: text(220) }).strict();
export const expeditionScriptSchema = z
  .object({
    acts: z.object({ scout: act, engineer: act, pilot: act }).strict(),
    routes: z.object({ beacon: route, drift: route }).strict(),
  })
  .strict();
export const expeditionStateSchema = z.object({
  phase: z.enum(['scout', 'choice', 'engineer', 'pilot', 'complete']),
  script: expeditionScriptSchema,
  contributors: z.object({
    scout: z.array(z.string()).max(6),
    engineer: z.array(z.string()).max(6),
    pilot: z.array(z.string()).max(6),
  }),
  route: z.enum(['beacon', 'drift']).nullable(),
  votes: z
    .record(z.string(), z.enum(['beacon', 'drift']))
    .refine((v) => Object.keys(v).length <= 10000),
  ballotMs: z.number().min(0).max(20000),
  milestones: z
    .array(
      z.object({
        phase: z.enum(['scout', 'choice', 'engineer', 'pilot', 'complete']),
        at: z.number(),
      }),
    )
    .max(5),
  lastSignal: z.object({ id: z.string(), role: z.enum(['scout', 'engineer', 'pilot']) }).nullable(),
});
export function createExpedition(script: ExpeditionScript = defaultExpedition()): ExpeditionState {
  return {
    phase: 'scout',
    script,
    contributors: { scout: [], engineer: [], pilot: [] },
    route: null,
    votes: {},
    ballotMs: 20000,
    milestones: [],
    lastSignal: null,
  };
}
export function expeditionView(e: ExpeditionState, crew: number): ExpeditionView {
  return {
    ...e,
    contributors: {
      scout: e.contributors.scout.length,
      engineer: e.contributors.engineer.length,
      pilot: e.contributors.pilot.length,
    },
    targets: expeditionTargets(crew, e.route),
    votes: Object.values(e.votes).reduce(
      (n, route) => {
        n[route]++;
        return n;
      },
      { beacon: 0, drift: 0 },
    ),
  };
}
export function chooseRoute(e: ExpeditionState, now: number): Route {
  const tally = Object.values(e.votes).reduce(
    (n, r) => {
      n[r]++;
      return n;
    },
    { beacon: 0, drift: 0 },
  );
  e.route = tally.drift > tally.beacon ? 'drift' : 'beacon';
  e.phase = 'engineer';
  e.ballotMs = 0;
  e.milestones.push({ phase: 'engineer', at: now });
  return e.route;
}
