import { expeditionScriptSchema } from './expedition.js';
import { z } from 'zod';
import { roles } from '../shared/contracts.js';

const text = (max: number) => z.string().trim().min(1).max(max);
export const directorBriefSchema = z
  .object({
    expedition: expeditionScriptSchema.optional(),
    title: text(64),
    location: text(64),
    briefing: text(360),
    welcome: text(260),
    conclusion: text(260),
    directive: z
      .object({
        title: text(64),
        objective: text(180),
        focusRole: z.enum(roles),
        targetContributors: z.number().int().min(2).max(6),
        durationSeconds: z.number().int().min(30).max(120),
        rewardPoints: z.number().int().min(1).max(3),
      })
      .strict(),
  })
  .strict();
export const directorCandidateSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  createdAt: z.number(),
  source: z.enum(['gemini', 'sample']),
  model: z.string(),
  brief: directorBriefSchema,
});
export const directiveRuntimeSchema = z.object({
  status: z.enum(['queued', 'active', 'complete', 'expired']),
  contributors: z.array(z.string()).max(6),
  remainingMs: z.number().nonnegative(),
});

// JSON Schema is kept explicit to match the provider's supported subset.
export const directorJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', maxLength: 64 },
    location: { type: 'string', maxLength: 64 },
    briefing: { type: 'string', maxLength: 360 },
    welcome: { type: 'string', maxLength: 260 },
    conclusion: { type: 'string', maxLength: 260 },
    directive: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string', maxLength: 64 },
        objective: { type: 'string', maxLength: 180 },
        focusRole: { type: 'string', enum: [...roles] },
        targetContributors: { type: 'integer', minimum: 2, maximum: 6 },
        durationSeconds: { type: 'integer', minimum: 30, maximum: 120 },
        rewardPoints: { type: 'integer', minimum: 1, maximum: 3 },
      },
      required: [
        'title',
        'objective',
        'focusRole',
        'targetContributors',
        'durationSeconds',
        'rewardPoints',
      ],
    },
  },
  required: ['title', 'location', 'briefing', 'welcome', 'conclusion', 'directive'],
};

const narrativeAct = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', maxLength: 64 },
    objective: { type: 'string', maxLength: 160 },
  },
  required: ['title', 'objective'],
};
const narrativeRoute = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', maxLength: 48 },
    description: { type: 'string', maxLength: 160 },
    ending: { type: 'string', maxLength: 220 },
  },
  required: ['name', 'description', 'ending'],
};
export const expeditionDirectorJsonSchema = {
  ...directorJsonSchema,
  properties: {
    ...directorJsonSchema.properties,
    expedition: {
      type: 'object',
      additionalProperties: false,
      properties: {
        acts: {
          type: 'object',
          additionalProperties: false,
          properties: { scout: narrativeAct, engineer: narrativeAct, pilot: narrativeAct },
          required: ['scout', 'engineer', 'pilot'],
        },
        routes: {
          type: 'object',
          additionalProperties: false,
          properties: { beacon: narrativeRoute, drift: narrativeRoute },
          required: ['beacon', 'drift'],
        },
      },
      required: ['acts', 'routes'],
    },
  },
  required: [...directorJsonSchema.required, 'expedition'],
};
