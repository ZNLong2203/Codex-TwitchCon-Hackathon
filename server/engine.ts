import {
  createExpedition,
  expeditionStateSchema,
  expeditionView,
  chooseRoute,
} from './expedition.js';
import { expeditionTargets, expeditionHint, defaultExpedition } from '../shared/expedition.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { DirectorCandidate } from '../shared/director.js';
import { directorCandidateSchema, directiveRuntimeSchema } from './director-schema.js';

import {
  roles,
  roleInfo,
  missions,
  type Role,
  type Settings,
  type FeedItem,
  type MissionState,
  type MissionView,
} from '../shared/contracts.js';
export * from '../shared/contracts.js';

export const settingsSchema = z.object({
  mode: z.enum(['classic', 'expedition']).optional().default('classic'),
  crewPerAct: z.number().int().min(2).max(5).optional().default(3),
  missionId: z.enum(['quiet-signal', 'last-garden', 'homeward']),
  goal: z.number().int().min(6).max(1000),
  durationMinutes: z.number().int().min(1).max(60),
  cooldownSeconds: z.number().int().min(1).max(60),
  welcomeBonus: z.boolean(),
});

export class MissionEngine {
  state: MissionState;
  private seen = new Map<string, number>();
  private lastSweep = 0;
  private lastTick: number;
  constructor(
    private clock: () => number = Date.now,
    mode: 'classic' | 'expedition' = 'classic',
  ) {
    this.lastTick = clock();
    this.state = this.fresh(
      {
        mode,
        crewPerAct: 3,
        missionId: 'quiet-signal',
        goal: 24,
        durationMinutes: 8,
        cooldownSeconds: 6,
        welcomeBonus: true,
      },
      'rehearsal',
    );
  }
  private fresh(settings: Settings, source: MissionState['source']): MissionState {
    return {
      schemaVersion: 1,
      id: randomUUID(),
      status: 'ready',
      source,
      settings,
      startedAt: null,
      remainingMs: settings.durationMinutes * 60_000,
      systems: { scout: 0, engineer: 0, pilot: 0 },
      players: {},
      feed: [],
      actions: 0,
      combos: 0,
      welcomed: 0,
      raid: null,
      comboWindow: [],
      expedition:
        settings.mode === 'expedition'
          ? createExpedition(defaultExpedition(settings.missionId))
          : null,
      director: null,
      directive: null,
    };
  }
  private log(kind: FeedItem['kind'], name: string, text: string, extras: Partial<FeedItem> = {}) {
    this.state.feed.unshift({ id: randomUUID(), at: this.clock(), kind, name, text, ...extras });
    this.state.feed = this.state.feed.slice(0, 40);
  }
  reset(settings = this.state.settings, source = this.state.source) {
    this.state = this.fresh(settingsSchema.parse(settings), source);
    this.seen.clear();
    this.lastTick = this.clock();
    this.log('system', 'Mission control', 'Flight plan loaded. Ready when you are.');
  }
  restore(raw: unknown) {
    // Persist only the public mission state; credentials and deduplication data never go to disk.
    const checked = z
      .object({
        schemaVersion: z.literal(1),
        settings: settingsSchema,
        source: z.enum(['rehearsal', 'twitch']),
        id: z.string(),
        status: z.enum(['ready', 'active', 'paused', 'complete', 'ended']),
        startedAt: z.number().nullable(),
        remainingMs: z.number().nonnegative(),
        systems: z.object({
          scout: z.number().nonnegative(),
          engineer: z.number().nonnegative(),
          pilot: z.number().nonnegative(),
        }),
        players: z.record(
          z.string(),
          z.object({
            name: z.string(),
            role: z.enum(roles),
            actions: z.number(),
            firstAt: z.number(),
            lastAt: z.number(),
          }),
        ),
        feed: z
          .array(
            z.object({
              id: z.string(),
              at: z.number(),
              kind: z.enum(['action', 'system', 'raid', 'combo', 'director']),
              name: z.string(),
              text: z.string(),
              role: z.enum(roles).optional(),
              first: z.boolean().optional(),
            }),
          )
          .max(40),
        actions: z.number(),
        combos: z.number(),
        welcomed: z.number(),
        expedition: expeditionStateSchema.nullable().optional().default(null),
        director: directorCandidateSchema.nullable().optional().default(null),
        directive: directiveRuntimeSchema.nullable().optional().default(null),
        raid: z
          .object({ name: z.string(), viewers: z.number(), at: z.number(), until: z.number() })
          .nullable(),
      })
      .parse(raw);
    if ((checked.settings.mode === 'expedition') !== !!checked.expedition)
      throw new Error('Invalid expedition snapshot.');
    if (checked.expedition) {
      const e = checked.expedition;
      const targets = expeditionTargets(checked.settings.crewPerAct ?? 3, e.route);
      const index = ['scout', 'choice', 'engineer', 'pilot', 'complete'].indexOf(e.phase);
      if (index >= 2 !== !!e.route || (e.phase === 'complete') !== (checked.status === 'complete'))
        throw new Error('Invalid expedition phase.');
      for (const [i, role] of roles.entries()) {
        const completed = index > [0, 2, 3][i]!;
        if (index < [0, 2, 3][i]! && e.contributors[role].length)
          throw new Error('Locked act already has contributions.');
        if (
          new Set(e.contributors[role]).size !== e.contributors[role].length ||
          e.contributors[role].length > targets[role] ||
          (completed && e.contributors[role].length !== targets[role])
        )
          throw new Error('Invalid expedition contributors.');
      }
    }

    this.state = { ...checked, comboWindow: [] };
    if (this.state.status === 'active') this.state.status = 'paused';
    this.lastTick = this.clock();
  }
  control(action: 'start' | 'pause' | 'resume' | 'end') {
    if (action === 'start' && this.state.status === 'ready') {
      this.state.status = 'active';
      this.state.startedAt = this.clock();
      if (this.state.directive?.status === 'queued') this.state.directive.status = 'active';
      this.log('system', 'Mission control', 'Rescue initiated. All hands, stations ready.');
    } else if (action === 'pause' && this.state.status === 'active') {
      this.tick();
      if (this.state.status === 'active') this.state.status = 'paused';
    } else if (action === 'resume' && this.state.status === 'paused') this.state.status = 'active';
    else if (action === 'end' && ['active', 'paused'].includes(this.state.status)) {
      this.state.status = 'ended';
      if (this.state.directive && ['queued', 'active'].includes(this.state.directive.status))
        this.state.directive.status = 'expired';
      this.log('system', 'Mission control', 'Mission ended by the captain. Flight recorder saved.');
    }
    this.lastTick = this.clock();
  }
  tick() {
    const now = this.clock();
    if (this.state.status === 'active') {
      const elapsed = Math.max(0, now - this.lastTick);
      if (this.state.expedition?.phase === 'choice') {
        this.state.expedition.ballotMs = Math.max(
          0,
          this.state.expedition.ballotMs - Math.min(elapsed, this.state.remainingMs),
        );
        if (!this.state.expedition.ballotMs && elapsed < this.state.remainingMs) this.lockRoute();
      }
      if (this.state.directive?.status === 'active') {
        this.state.directive.remainingMs = Math.max(0, this.state.directive.remainingMs - elapsed);
        if (!this.state.directive.remainingMs) {
          this.state.directive.status = 'expired';
          this.log('director', 'Directive window closed', 'No penalty. The main rescue continues.');
        }
      }
      this.state.remainingMs = Math.max(
        0,
        this.state.remainingMs - Math.max(0, now - this.lastTick),
      );
      if (!this.state.remainingMs) {
        this.state.status = 'ended';
        if (this.state.directive?.status === 'active') this.state.directive.status = 'expired';
        this.log(
          'system',
          'Mission control',
          'The rescue window closed. Every contribution is in the flight recorder.',
        );
      }
    }
    this.lastTick = now;
  }
  private duplicate(id: string) {
    const now = this.clock();
    if (now - this.lastSweep >= 30_000) {
      for (const [key, at] of this.seen) if (now - at > 600_000) this.seen.delete(key);
      this.lastSweep = now;
    }
    if (this.seen.has(id)) return true;
    this.seen.set(id, now);
    if (this.seen.size > 10_000) this.seen.delete(this.seen.keys().next().value!);
    return false;
  }
  chat(event: { id: string; userId: string; name: string; text: string }): {
    accepted: boolean;
    reason?: string;
    role?: Role;
    points?: number;
    first?: boolean;
  } {
    this.tick();
    if (this.state.status !== 'active') return { accepted: false, reason: 'inactive' };
    const command = event.text.trim().toLowerCase();
    if (this.state.expedition) return this.expeditionChat(event, command);
    const role = roles.find((r) => roleInfo[r].command === command);
    if (!role) return { accepted: false, reason: 'unknown-command' };
    if (this.duplicate(event.id)) return { accepted: false, reason: 'duplicate' };
    // Prefix keys so untrusted IDs such as __proto__ cannot address object prototypes.
    const key = `u:${event.userId}`;
    const existing = this.state.players[key];
    const now = this.clock();
    if (existing && now - existing.lastAt < this.state.settings.cooldownSeconds * 1000)
      return { accepted: false, reason: 'cooldown' };
    if (!existing && Object.keys(this.state.players).length >= 10_000)
      return { accepted: false, reason: 'crew-capacity' };
    const first = !existing;
    const boarding = !!this.state.raid && now < this.state.raid.until;
    const points = first && boarding && this.state.settings.welcomeBonus ? 2 : 1;
    const player = existing ?? {
      name: event.name.slice(0, 25),
      role,
      actions: 0,
      firstAt: now,
      lastAt: now,
    };
    player.role = role;
    player.lastAt = now;
    player.actions++;
    this.state.players[key] = player;
    this.state.systems[role] = Math.min(
      this.state.settings.goal,
      this.state.systems[role] + points,
    );
    this.state.actions++;
    if (first && boarding) this.state.welcomed++;
    this.log('action', player.name, `${roleInfo[role].verb} +${points}`, { role, first });
    // A relay needs three DIFFERENT people, one of each role, within 15 seconds.
    this.state.comboWindow = this.state.comboWindow.filter(
      (a) => now - a.at <= 15_000 && a.userId !== key && a.role !== role,
    );
    this.state.comboWindow.push({ role, userId: key, at: now });
    if (this.state.comboWindow.length === 3) {
      this.state.combos++;
      for (const r of roles)
        this.state.systems[r] = Math.min(this.state.settings.goal, this.state.systems[r] + 2);
      this.state.comboWindow = [];
      this.log('combo', 'Relay synchronized', 'Three roles. Three people. +2 to every system.');
    }
    const directive = this.state.directive;
    const objective = this.state.director?.brief.directive;
    if (
      directive?.status === 'active' &&
      objective?.focusRole === role &&
      !directive.contributors.includes(key)
    ) {
      directive.contributors.push(key);
      if (directive.contributors.length >= objective.targetContributors) {
        directive.status = 'complete';
        for (const r of roles)
          this.state.systems[r] = Math.min(
            this.state.settings.goal,
            this.state.systems[r] + objective.rewardPoints,
          );
        this.log(
          'director',
          'Rescue directive complete',
          `${directive.contributors.length} different crew members coordinated. +${objective.rewardPoints} to every system.`,
        );
      }
    }
    if (roles.every((r) => this.state.systems[r] >= this.state.settings.goal)) {
      this.state.status = 'complete';
      if (this.state.directive?.status === 'active') this.state.directive.status = 'expired';
      this.log(
        'system',
        'Signal delivered',
        'Rescue complete. This is what a community can do together.',
      );
    }
    return { accepted: true, role, points, first };
  }
  lockRoute() {
    const e = this.state.expedition;
    if (this.state.status !== 'active' || e?.phase !== 'choice') return false;
    const route = chooseRoute(e, this.clock());
    this.log(
      'system',
      'Route locked',
      `${e.script.routes[route].name}. Engineers, your turn: !repair.`,
    );
    return true;
  }
  private expeditionChat(
    event: { id: string; userId: string; name: string; text: string },
    command: string,
  ) {
    const e = this.state.expedition!;
    const key = `u:${event.userId}`;
    const vote = /^!route (beacon|drift)$/.exec(command);
    if (vote) {
      if (e.phase !== 'choice') return { accepted: false, reason: 'ballot-closed' };
      if (this.duplicate(event.id)) return { accepted: false, reason: 'duplicate' };
      if (!e.votes[key] && Object.keys(e.votes).length >= 10000)
        return { accepted: false, reason: 'vote-capacity' };
      e.votes[key] = vote[1] as 'beacon' | 'drift';
      return { accepted: true, reason: 'vote' };
    }
    const role = roles.find((r) => roleInfo[r].command === command);
    if (!role) return { accepted: false, reason: 'unknown-command' };
    if (role !== e.phase) return { accepted: false, reason: 'role-locked' };
    if (this.duplicate(event.id)) return { accepted: false, reason: 'duplicate' };
    if (e.contributors[role].includes(key))
      return { accepted: false, reason: 'already-contributed' };
    const now = this.clock();
    const existing = this.state.players[key];
    if (existing && now - existing.lastAt < this.state.settings.cooldownSeconds * 1000)
      return { accepted: false, reason: 'cooldown' };
    if (!existing && Object.keys(this.state.players).length >= 10000)
      return { accepted: false, reason: 'crew-capacity' };
    const first = !existing;
    this.state.players[key] = {
      name: event.name.slice(0, 25),
      role,
      actions: (existing?.actions ?? 0) + 1,
      firstAt: existing?.firstAt ?? now,
      lastAt: now,
    };
    e.contributors[role].push(key);
    e.lastSignal = { id: event.id, role };
    const target = expeditionTargets(this.state.settings.crewPerAct ?? 3, e.route)[role];
    this.state.systems[role] = Math.round(
      (e.contributors[role].length / target) * this.state.settings.goal,
    );
    this.state.actions++;
    if (first && this.state.raid && now < this.state.raid.until) this.state.welcomed++;
    this.log(
      'action',
      event.name.slice(0, 25),
      `${roleInfo[role].verb} · ${e.contributors[role].length}/${target} different crew`,
      { role, first },
    );
    if (e.contributors[role].length >= target) {
      e.phase = role === 'scout' ? 'choice' : role === 'engineer' ? 'pilot' : 'complete';
      e.milestones.push({ phase: e.phase, at: now });
      this.log(
        'system',
        'Act complete',
        e.phase === 'choice'
          ? 'Signal found. Vote !route beacon or !route drift. Ballot closes in 20 seconds.'
          : e.phase === 'pilot'
            ? 'Lifeline restored. Pilots, extract the ark with !boost.'
            : e.script.routes[e.route!].ending,
      );
      if (e.phase === 'complete') this.state.status = 'complete';
    }
    return { accepted: true, role, points: 1, first };
  }
  raid(event: { id: string; name: string; viewers: number }) {
    this.tick();
    if (this.state.status !== 'active' || this.duplicate(event.id)) return false;
    const now = this.clock();
    this.state.raid = {
      name: event.name.slice(0, 25),
      viewers: Math.max(0, Math.min(1_000_000, Math.floor(event.viewers))),
      at: now,
      until: now + 90_000,
    };
    this.log(
      'raid',
      this.state.raid.name,
      `${this.state.raid.viewers} viewers arrived. Boarding window open for 90 seconds.`,
    );
    return true;
  }
  approveDirector(raw: DirectorCandidate) {
    const candidate = directorCandidateSchema.parse(raw);
    if (candidate.missionId !== this.state.id)
      throw new Error('This draft belongs to a previous mission. Generate a fresh draft.');
    if (candidate.id === this.state.director?.id)
      throw new Error('This draft was already published. Generate a new objective.');
    if (!['ready', 'active', 'paused'].includes(this.state.status))
      throw new Error('Load a new flight before approving a director draft.');
    if (candidate.source === 'sample' && this.state.source !== 'rehearsal')
      throw new Error('Sample directives cannot be published to Twitch missions.');
    if (this.state.expedition) {
      if (this.state.status !== 'ready')
        throw new Error(
          'Review the three-act script before launch. Load a new flight to change it.',
        );
      if (!candidate.brief.expedition)
        throw new Error('This draft is missing its three-act rescue script.');
      this.state.expedition = createExpedition(candidate.brief.expedition);
      this.state.director = candidate;
      this.state.directive = null;
      this.log(
        'director',
        candidate.source === 'gemini' ? 'AI expedition · approved' : 'Sample expedition · approved',
        candidate.brief.title,
      );
      return;
    }
    if (this.state.directive && ['queued', 'active'].includes(this.state.directive.status))
      throw new Error('Finish or let the current directive expire before publishing another.');
    this.tick();
    if (this.state.status === 'ended')
      throw new Error('The mission ended before this draft could be approved.');
    this.state.director = candidate;
    this.state.directive = {
      status: this.state.status === 'ready' ? 'queued' : 'active',
      contributors: [],
      remainingMs: candidate.brief.directive.durationSeconds * 1000,
    };
    this.log(
      'director',
      candidate.source === 'gemini' ? 'AI director · approved' : 'Sample director · approved',
      candidate.brief.directive.title,
    );
  }
  view(): MissionView {
    const {
      players,
      comboWindow: _,
      directive,
      expedition: privateExpedition,
      ...rest
    } = this.state;
    const values = Object.entries(players);
    const roleCounts = { scout: 0, engineer: 0, pilot: 0 };
    for (const [, p] of values) roleCounts[p.role]++;
    const weakest = roles.reduce((a, b) => (rest.systems[a] <= rest.systems[b] ? a : b));
    const mission = missions.find((m) => m.id === rest.settings.missionId)!;
    const catchup =
      rest.status === 'complete'
        ? `${mission.name}: rescue complete. ${values.length} crew members sent ${rest.actions} signals and synchronized ${rest.combos} relays. All three systems are ready. Export the flight recorder to keep this story.`
        : rest.status === 'ended'
          ? `${mission.name}: this flight has ended at ${Math.floor((roles.reduce((n, r) => n + rest.systems[r], 0) / (rest.settings.goal * 3)) * 100)}% progress. Export the flight recorder, then start a new mission.`
          : rest.status === 'paused'
            ? `${mission.name}: the captain has paused this rescue. Contributions resume when the mission does.`
            : `${mission.name}: ${mission.description} Fill all three systems to complete the rescue. ${roleInfo[weakest].system} needs you most — type ${roleInfo[weakest].command} in chat. A scout, engineer and pilot acting within 15 seconds creates a relay bonus.`;
    const expedition = privateExpedition
      ? expeditionView(privateExpedition, rest.settings.crewPerAct ?? 3)
      : null;
    return {
      ...rest,
      expedition,
      directive: directive ? { ...directive, contributors: directive.contributors.length } : null,
      crewCount: values.length,
      crew: values.slice(-80).map(([id, p]) => ({ id, ...p })),
      roleCounts,
      progress: Math.floor(
        expedition
          ? (roles.reduce((n, r) => n + expedition.contributors[r] / expedition.targets[r], 0) /
              3) *
              100
          : (roles.reduce((n, r) => n + rest.systems[r], 0) / (rest.settings.goal * 3)) * 100,
      ),
      relay: this.state.comboWindow.filter((a) => this.clock() - a.at <= 15_000).map((a) => a.role),
      catchup: expedition
        ? `${rest.status === 'paused' ? 'Mission paused. ' : rest.status === 'ended' ? 'Rescue window closed. ' : ''}${expeditionHint(expedition)}`
        : catchup,
    };
  }
}
