import type { Role } from './contracts.js';

export type DirectorBrief = {
  title: string;
  location: string;
  briefing: string;
  welcome: string;
  conclusion: string;
  directive: {
    title: string;
    objective: string;
    focusRole: Role;
    targetContributors: number;
    durationSeconds: number;
    rewardPoints: number;
  };
};
export type DirectorCandidate = {
  id: string;
  missionId: string;
  createdAt: number;
  source: 'gemini' | 'sample';
  model: string;
  brief: DirectorBrief;
};
export type DirectiveRuntime = {
  status: 'queued' | 'active' | 'complete' | 'expired';
  contributors: string[];
  remainingMs: number;
};
export type DirectorView = {
  configured: boolean;
  model: string;
  status: 'idle' | 'generating' | 'error';
  fallbackModel: string;
  activeModel: string | null;
  lastModel: string | null;
  fallbackReason: string | null;
  primaryReservationUsd: number;
  fallbackReservationUsd: number;
  error: string | null;
  pending: DirectorCandidate | null;
  budgetUsd: number;
  reservedUsd: number;
  estimatedUsd: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  successfulCalls: number;
  missionCalls: number;
  maxMissionCalls: number;
  nextCallAt: number;
  autoDraftOnRaid: boolean;
};
