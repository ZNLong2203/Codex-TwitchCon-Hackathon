import { randomUUID } from 'node:crypto';
import { z } from 'zod';

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
  constructor(private clock: () => number = Date.now) {
    this.lastTick = clock();
    this.state = this.fresh(
      {
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
              kind: z.enum(['action', 'system', 'raid', 'combo']),
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
        raid: z
          .object({ name: z.string(), viewers: z.number(), at: z.number(), until: z.number() })
          .nullable(),
      })
      .parse(raw);
    this.state = { ...checked, comboWindow: [] };
    if (this.state.status === 'active') this.state.status = 'paused';
    this.lastTick = this.clock();
  }
  control(action: 'start' | 'pause' | 'resume' | 'end') {
    if (action === 'start' && this.state.status === 'ready') {
      this.state.status = 'active';
      this.state.startedAt = this.clock();
      this.log('system', 'Mission control', 'Rescue initiated. All hands, stations ready.');
    } else if (action === 'pause' && this.state.status === 'active') {
      this.tick();
      if (this.state.status === 'active') this.state.status = 'paused';
    } else if (action === 'resume' && this.state.status === 'paused') this.state.status = 'active';
    else if (action === 'end' && ['active', 'paused'].includes(this.state.status)) {
      this.state.status = 'ended';
      this.log('system', 'Mission control', 'Mission ended by the captain. Flight recorder saved.');
    }
    this.lastTick = this.clock();
  }
  tick() {
    const now = this.clock();
    if (this.state.status === 'active') {
      this.state.remainingMs = Math.max(
        0,
        this.state.remainingMs - Math.max(0, now - this.lastTick),
      );
      if (!this.state.remainingMs) {
        this.state.status = 'ended';
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
  chat(event: { id: string; userId: string; name: string; text: string }) {
    this.tick();
    if (this.state.status !== 'active') return { accepted: false, reason: 'inactive' };
    const command = event.text.trim().toLowerCase();
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
    if (roles.every((r) => this.state.systems[r] >= this.state.settings.goal)) {
      this.state.status = 'complete';
      this.log(
        'system',
        'Signal delivered',
        'Rescue complete. This is what a community can do together.',
      );
    }
    return { accepted: true, role, points, first };
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
  view(): MissionView {
    const { players, comboWindow: _, ...rest } = this.state;
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
    return {
      ...rest,
      crewCount: values.length,
      crew: values.slice(-80).map(([id, p]) => ({ id, ...p })),
      roleCounts,
      progress: Math.floor(
        (roles.reduce((n, r) => n + rest.systems[r], 0) / (rest.settings.goal * 3)) * 100,
      ),
      relay: this.state.comboWindow.filter((a) => this.clock() - a.at <= 15_000).map((a) => a.role),
      catchup,
    };
  }
}
