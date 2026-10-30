import { useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  ExternalLink,
  Eye,
  EyeOff,
  FlaskConical,
  KeyRound,
  LoaderCircle,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  Zap,
} from 'lucide-react';
import type { MissionView } from '../../shared/contracts';
import { roleInfo } from '../../shared/contracts';
import type { DirectorView } from '../../shared/director';
import { normalizeGeminiKey, geminiKeyError } from '../../shared/api-key';

export type AIAction = (path: string, body: unknown) => Promise<boolean>;
export function AIDirectorPanel({
  mission,
  ai,
  busy,
  now,
  error,
  onAction,
  onSettings,
}: {
  mission: MissionView;
  ai: DirectorView;
  busy: boolean;
  now: number;
  error: string;
  onAction: AIAction;
  onSettings(): void;
}) {
  const [theme, setTheme] = useState('A hopeful rescue beyond the last lighthouse');
  const [language, setLanguage] = useState<'en' | 'vi'>('en');
  const [expanded, setExpanded] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const loading = busy || ai.status === 'generating';
  const candidate = ai.pending;
  const cool = Math.max(0, Math.ceil((ai.nextCallAt - now) / 1000));
  const ended = ['ended', 'complete'].includes(mission.status);
  const directiveRunning =
    mission.directive && ['queued', 'active'].includes(mission.directive.status);
  return (
    <section className="card ai-director" id="ai-director" aria-labelledby="director-heading">
      <div className="ai-header">
        <div className="ai-title">
          <span className="ai-symbol">
            <Sparkles size={23} />
          </span>
          <div>
            <h2 id="director-heading">AI Mission Director</h2>
            <p>
              {ai.configured
                ? 'Turn your community’s story into a playable rescue.'
                : 'Give your crew an original story and an adaptive objective.'}
            </p>
          </div>
        </div>
        <div className="ai-header-actions">
          <span className={`tag ${ai.configured ? 'lime' : 'dark'}`}>
            {loading
              ? 'GENERATING'
              : ai.successfulCalls
                ? 'GEMINI VERIFIED'
                : ai.configured
                  ? 'KEY CONFIGURED'
                  : 'SETUP NEEDED'}
          </span>
          <button className="button secondary" onClick={onSettings}>
            <Settings2 size={17} /> AI settings
          </button>
          <button
            className="icon-button"
            aria-label={expanded ? 'Collapse AI director' : 'Expand AI director'}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="ai-content">
          <div className="ai-compose">
            <div className="ai-theme-field">
              <label htmlFor="ai-theme">What kind of adventure?</label>
              <input
                id="ai-theme"
                maxLength={240}
                minLength={3}
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="A cozy rescue through a bioluminescent nebula"
              />
            </div>
            <div className="ai-language-field">
              <label htmlFor="ai-language">Story language</label>
              <select
                id="ai-language"
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'en' | 'vi')}
              >
                <option value="en">English</option>
                <option value="vi">Tiếng Việt</option>
              </select>
            </div>
            <button
              className="button primary ai-generate"
              disabled={loading || ended || !ai.configured || cool > 0 || theme.trim().length < 3}
              onClick={() => onAction('ai/generate', { theme, language })}
            >
              {loading ? <LoaderCircle size={17} className="spin" /> : <Sparkles size={17} />}{' '}
              {loading
                ? 'Directing your rescue…'
                : cool > 0
                  ? `New draft in ${cool}s`
                  : 'Generate AI mission'}
            </button>
          </div>
          {!ai.configured && (
            <div className="ai-setup-line">
              <KeyRound size={16} />
              <span>Connect your Gemini key to generate a real mission.</span>
              <button className="text-button" onClick={onSettings}>
                Set up Gemini <ArrowRight size={15} />
              </button>
            </div>
          )}
          {loading && (
            <div className="ai-working" role="status">
              <span className="status-dot pulse" />
              {ai.activeModel === ai.fallbackModel
                ? 'Trying the fallback model. Your crew can keep playing.'
                : 'Gemini 3.8 Flash is directing your rescue. Your crew can keep playing.'}
            </div>
          )}
          {error && (
            <div className="ai-inline-error" role="alert">
              {error}
            </div>
          )}
          {!error && ai.error && (
            <div className="ai-inline-error" role="alert">
              {ai.error}
            </div>
          )}
          {ai.fallbackReason && (
            <div className="ai-fallback-note" role="status">
              {ai.fallbackReason}{' '}
              {ai.lastModel === ai.fallbackModel
                ? `Draft generated with ${ai.fallbackModel}.`
                : `Fallback: ${ai.fallbackModel}.`}
            </div>
          )}
          {candidate && (
            <div className="ai-draft">
              <div className="ai-draft-top">
                <span className={`tag ${candidate.source === 'gemini' ? 'lime' : 'amber'}`}>
                  {candidate.source === 'gemini'
                    ? `${candidate.model} · DRAFT`
                    : 'LOCAL SAMPLE · NO AI CALL'}
                </span>
                <button
                  className="icon-button"
                  aria-label="Discard director draft"
                  disabled={loading}
                  onClick={() => onAction('ai/discard', {})}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="ai-draft-grid">
                <div className="ai-story">
                  <span className="eyebrow">{candidate.brief.location}</span>
                  <h3>{candidate.brief.title}</h3>
                  <p>{candidate.brief.briefing}</p>
                  <details>
                    <summary>Read newcomer welcome & ending</summary>
                    <p>
                      <strong>Welcome:</strong> {candidate.brief.welcome}
                    </p>
                    <p>
                      <strong>Ending:</strong> {candidate.brief.conclusion}
                    </p>
                  </details>
                </div>
                <div className="ai-objective-preview">
                  <span className="eyebrow">A PLAYABLE CREW OBJECTIVE</span>
                  <h3>{candidate.brief.directive.title}</h3>
                  <p>{candidate.brief.directive.objective}</p>
                  <div className="ai-objective-specs">
                    <span>
                      <Users size={15} />
                      {candidate.brief.directive.targetContributors} different people
                    </span>
                    <code style={{ color: roleInfo[candidate.brief.directive.focusRole].color }}>
                      {roleInfo[candidate.brief.directive.focusRole].command}
                    </code>
                    <span>{candidate.brief.directive.durationSeconds}s</span>
                    <span>
                      <Zap size={14} />+{candidate.brief.directive.rewardPoints} / system
                    </span>
                  </div>
                </div>
              </div>
              <div className="ai-draft-actions">
                <span>
                  <ShieldCheck size={16} /> Review before anything appears on stream.
                </span>
                <button
                  className="button primary"
                  disabled={loading || !!directiveRunning || ended}
                  onClick={() => onAction('ai/approve', { draftId: candidate.id })}
                >
                  <Check size={17} /> Publish mission & objective
                </button>
              </div>
              {directiveRunning && (
                <p className="ai-hint">
                  Finish the current objective or let its timer expire before publishing another.
                  You can keep this draft for later.
                </p>
              )}
            </div>
          )}
          <div className="ai-cost-row">
            <span className="ai-model-route">
              Primary: {ai.model} <ArrowRight size={13} /> Fallback: {ai.fallbackModel}
            </span>
            <span>
              {ai.missionCalls}/{ai.maxMissionCalls} requests this flight
            </span>
            <span>
              Estimated ${ai.estimatedUsd.toFixed(4)} · cap ${ai.budgetUsd.toFixed(2)}
            </span>
            <button
              className="text-button"
              aria-expanded={showDetails}
              onClick={() => setShowDetails(!showDetails)}
            >
              <CircleHelp size={14} /> Usage details
            </button>
            {mission.source === 'rehearsal' && (
              <button
                className="text-button sample-button"
                disabled={loading || ended}
                onClick={() => onAction('ai/sample', {})}
              >
                <FlaskConical size={14} /> Try a labeled local sample
              </button>
            )}
          </div>
          {showDetails && (
            <div className="ai-usage-details">
              <p>
                Only your theme and aggregate game state go to Gemini. No raw chat, viewer names,
                IDs or Twitch tokens.
              </p>
              <p>
                {ai.inputTokens.toLocaleString()} input tokens · {ai.outputTokens.toLocaleString()}{' '}
                output/thinking tokens · {ai.successfulCalls} validated responses. The local guard
                reserves ${ai.primaryReservationUsd.toFixed(2)} per primary attempt and $
                {ai.fallbackReservationUsd.toFixed(2)} per fallback attempt ($
                {ai.reservedUsd.toFixed(2)} used). Failed requests keep their reservation; your
                provider’s invoice is authoritative. Limits reset with this server process.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function AISettings({
  ai,
  busy,
  onAction,
  onSaved,
}: {
  ai: DirectorView;
  busy: boolean;
  onAction: AIAction;
  onSaved(): void;
}) {
  const [key, setKey] = useState('');
  const [reveal, setReveal] = useState(false);
  const [budget, setBudget] = useState(String(ai.budgetUsd));
  const [validationError, setValidationError] = useState('');
  const [auto, setAuto] = useState(ai.autoDraftOnRaid);
  const [setup, setSetup] = useState(false);
  return (
    <>
      <span className="modal-symbol">
        <Sparkles size={25} />
      </span>
      <span className="eyebrow">YOUR COMMUNITY’S STORYTELLER</span>
      <h2>Connect Gemini.</h2>
      <p>
        Generate an original mission, then review its crew objective before publishing it to your
        stream.
      </p>
      <div className="connection-status">
        <KeyRound size={19} />
        <div>
          <strong>{ai.configured ? 'API key is configured' : 'Add your Gemini API key'}</strong>
          <small>
            {ai.successfulCalls
              ? `${ai.successfulCalls} validated Gemini responses this session`
              : 'Provider access is verified when you generate your first mission.'}
          </small>
        </div>
      </div>
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setValidationError('');
          const normalized = normalizeGeminiKey(key);
          const keyProblem = normalized || !ai.configured ? geminiKeyError(key) : null;
          const amount = Number(budget.trim().replace(',', '.'));
          if (keyProblem) {
            setValidationError(keyProblem);
            return;
          }
          if (!Number.isFinite(amount) || amount < Math.max(0.01, ai.reservedUsd) || amount > 10) {
            setValidationError(
              'Enter an AI budget between $0.01 and $10, and at least the amount already reserved. For example: 0.25.',
            );
            return;
          }
          const saved = await onAction('ai/configure', {
            ...(normalized ? { apiKey: normalized } : {}),
            budgetUsd: amount,
            autoDraftOnRaid: auto,
          });
          if (saved) {
            setKey('');
            onSaved();
          }
        }}
      >
        <label className="field-label" htmlFor="gemini-key">
          Gemini API key <span>SERVER MEMORY ONLY</span>
        </label>
        <div className="secret-field">
          <input
            id="gemini-key"
            type={reveal ? 'text' : 'password'}
            value={key}
            required={!ai.configured}
            minLength={20}
            maxLength={1024}
            autoComplete="off"
            spellCheck={false}
            placeholder={
              ai.configured
                ? 'Leave blank to keep your current key'
                : 'Paste your key here, never in chat'
            }
            onChange={(e) => setKey(e.target.value)}
          />
          <button
            type="button"
            className="icon-button"
            aria-label={reveal ? 'Hide API key' : 'Show API key'}
            onClick={() => setReveal(!reveal)}
          >
            {reveal ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <button
          className="text-button ai-key-help"
          type="button"
          onClick={() => setSetup(!setup)}
          aria-expanded={setup}
        >
          Where do I get a key? <ChevronDown size={15} />
        </button>
        {setup && (
          <div className="ai-key-instructions">
            <ol>
              <li>
                Open{' '}
                <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noreferrer">
                  Google AI Studio <ExternalLink size={13} />
                </a>{' '}
                and sign in.
              </li>
              <li>Create an API key for a Google project with Gemini API access.</li>
              <li>Copy it into this field. Check your project quota and billing in AI Studio.</li>
            </ol>
            <p>
              Free-tier availability varies. Google’s free-tier terms may use submitted content to
              improve its products; this app sends aggregate state only.
            </p>
          </div>
        )}
        <label className="field-label" htmlFor="ai-budget">
          Local budget guard (USD per server session)
        </label>
        <input
          id="ai-budget"
          type="text"
          inputMode="decimal"
          required
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
        />
        <small className="field-hint">
          Default $0.25. Eight requests per mission, 20 seconds between requests. Estimates are not
          a provider billing limit.
        </small>
        <label className="checkbox-label">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          <span>
            <strong>Draft a new mission beat when a raid arrives</strong>
            <small>
              Uses one bounded Gemini request when limits allow. It remains a draft until you
              approve it.
            </small>
          </span>
        </label>
        {validationError && (
          <p className="modal-error" role="alert">
            {validationError}
          </p>
        )}
        <button className="button primary full-width" disabled={busy} type="submit">
          {busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />} Save AI
          settings
        </button>
      </form>
      {ai.configured && (
        <button
          className="button secondary full-width"
          disabled={busy}
          onClick={async () => {
            if (await onAction('ai/disconnect', {})) {
              setKey('');
              onSaved();
            }
          }}
        >
          <X size={16} /> Remove key from this server
        </button>
      )}
      <div className="privacy-note">
        <ShieldCheck size={16} />
        <span>
          Your key is never returned to the browser, saved in localStorage, included in the recorder
          or committed to Git. You can also configure <code>GEMINI_API_KEY</code> in your ignored
          local <code>.env</code>.
        </span>
      </div>
    </>
  );
}

export function ActiveDirective({ mission }: { mission: MissionView }) {
  const approved = mission.director;
  const runtime = mission.directive;
  if (!approved || !runtime) return null;
  const d = approved.brief.directive;
  const role = roleInfo[d.focusRole];
  return (
    <div className={`active-directive directive-${runtime.status}`}>
      <div className="directive-heading">
        <span>
          <Sparkles size={18} />
          {approved.source === 'gemini' ? 'AI DIRECTOR' : 'LOCAL SAMPLE · NO AI CALL'}
        </span>
        <strong>
          {runtime.status === 'queued'
            ? 'Starts at launch'
            : runtime.status === 'complete'
              ? 'Objective complete'
              : runtime.status === 'expired'
                ? 'Window closed · no penalty'
                : mission.status === 'paused'
                  ? 'Paused'
                  : `${Math.ceil(runtime.remainingMs / 1000)}s left`}
        </strong>
      </div>
      <h3>{d.title}</h3>
      <p>{d.objective}</p>
      <div className="directive-progress">
        <span>
          {runtime.contributors} / {d.targetContributors} different people
        </span>
        <code style={{ color: role.color }}>{role.command}</code>
        <span>+{d.rewardPoints} to every system</span>
      </div>
      <div className="meter">
        <i
          style={{
            width: `${(runtime.contributors / d.targetContributors) * 100}%`,
            background: role.color,
          }}
        />
      </div>
    </div>
  );
}
