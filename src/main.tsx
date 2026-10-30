import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  Crosshair,
  ExternalLink,
  Flag,
  FolderOpen,
  Gauge,
  Layers,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Menu,
  Orbit,
  Pause,
  Play,
  Plus,
  Radio,
  RadioTower,
  Rocket,
  RotateCcw,
  ScanLine,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Users,
  WandSparkles,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import {
  missions,
  roleInfo,
  roles,
  type MissionView,
  type Role,
  type Settings,
} from '../shared/contracts';
import type { Connection } from '../server/twitch';
import './styles.css';
import './readability.css';
import { Brand, TwitchIcon } from './components/Brand';
import { SpaceScene } from './components/SpaceScene';
import { AIDirectorPanel, AISettings, ActiveDirective } from './components/AIDirector';
import type { DirectorView } from '../shared/director';

type State = {
  mission: MissionView;
  connection: Connection;
  demoRunning: boolean;
  now: number;
  ai: DirectorView;
};
type Config = { clientId: string; overlayUrl: string };
type Tab = 'control' | 'plans' | 'recorder' | 'guide';
const roleIcons = { scout: ScanLine, engineer: ShieldCheck, pilot: Zap };
const labels = {
  ready: 'Ready to launch',
  active: 'Mission in progress',
  paused: 'Mission paused',
  complete: 'Rescue complete',
  ended: 'Mission ended',
};
const time = (ms: number) =>
  `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, '0')}:${Math.floor((ms % 60000) / 1000)
    .toString()
    .padStart(2, '0')}`;
const api = async (path: string, body?: unknown) => {
  const response = await fetch(`/api/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Something went wrong. Try again.');
  return result;
};

function App() {
  const overlay = window.location.pathname === '/overlay';
  const [state, setState] = useState<State | null>(null);
  const [config, setConfig] = useState<Config>({ clientId: '', overlayUrl: '' });
  const [tab, setTab] = useState<Tab>('control');
  const [modal, setModal] = useState<'connect' | 'settings' | 'overlay' | 'ai' | 'confirm' | null>(
    null,
  );
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [streamError, setStreamError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [confirmation, setConfirmation] = useState<{
    title: string;
    message: string;
    action: string;
  } | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [clientId, setClientId] = useState(localStorage.getItem('rr_client_id') ?? '');
  const [form, setForm] = useState<Settings | null>(null);
  const [source, setSource] = useState<'rehearsal' | 'twitch'>('rehearsal');
  const [copied, setCopied] = useState(false);
  const [compact, setCompact] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get('key');
    const events = new EventSource(
      `/api/events${overlay ? `?key=${encodeURIComponent(key ?? '')}` : ''}`,
    );
    events.onmessage = (e) => {
      try {
        setState(JSON.parse(e.data));
        setStreamError(false);
      } catch {
        setStreamError(true);
      }
    };
    let lastRecovery = 0;
    events.onerror = () => {
      setStreamError(true);
      if (!overlay && Date.now() - lastRecovery > 10_000) {
        lastRecovery = Date.now();
        // Re-establish a local operator session after a server restart without
        // clearing a form the streamer may be filling in.
        void fetch('/', { cache: 'no-store' })
          .then((response) => (response.ok ? api('config') : Promise.reject()))
          .then(setConfig)
          .catch(() => {
            /* The explicit reload action stays available while offline. */
          });
      }
    };
    if (!overlay) {
      void api('config')
        .then((c: Config) => {
          setConfig(c);
          if (!clientId && c.clientId) setClientId(c.clientId);
        })
        .catch((e) => setError(e.message));
      if (window.location.pathname === '/auth/callback') {
        const hash = new URLSearchParams(window.location.hash.slice(1));
        window.history.replaceState({}, '', '/'); // Remove the token before rendering or loading anything else.
        const expected = sessionStorage.getItem('rr_oauth_state');
        const expires = Number(sessionStorage.getItem('rr_oauth_expires'));
        sessionStorage.removeItem('rr_oauth_state');
        sessionStorage.removeItem('rr_oauth_expires');
        if (hash.get('error'))
          setError('Twitch authorization was declined. You can continue in rehearsal.');
        else if (
          !expected ||
          hash.get('state') !== expected ||
          Date.now() > expires ||
          !hash.get('access_token')
        )
          setError('The Twitch login could not be verified. Start a new connection.');
        else {
          setBusy(true);
          void api('twitch/connect', {
            clientId: localStorage.getItem('rr_client_id'),
            token: hash.get('access_token'),
          })
            .then(setState)
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }
      }
    }
    return () => events.close();
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (modal) {
      previousFocus.current = document.activeElement as HTMLElement;
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
      previousFocus.current?.focus();
    }
  }, [modal]);
  async function act(path: string, body: unknown) {
    setBusy(true);
    setError('');
    try {
      const next = await api(path, body);
      setState(next);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function aiAction(path: string, body: unknown) {
    setAiBusy(true);
    setAiError('');
    try {
      setState(await api(path, body));
      return true;
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'The AI request failed.');
      return false;
    } finally {
      setAiBusy(false);
    }
  }
  function confirmControl(action: 'end' | 'reset') {
    setConfirmation({
      action,
      title: action === 'end' ? 'End this rescue?' : 'Start a fresh flight?',
      message:
        action === 'end'
          ? 'The crew will stop contributing. You can export this mission’s flight recorder before starting another.'
          : 'This clears the current crew, progress and approved AI story. Export the flight recorder first if you want to keep it.',
    });
    setModal('confirm');
  }
  function openSettings() {
    if (!state) return;
    setForm({ ...state.mission.settings });
    setSource(state.mission.source);
    setModal('settings');
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Clipboard unavailable. Select and copy the text directly.');
    }
  }
  function authorize() {
    if (!/^[a-zA-Z0-9]{10,100}$/.test(clientId)) {
      setError('Enter the public Client ID from your Twitch developer application.');
      return;
    }
    const csrf = crypto.randomUUID();
    sessionStorage.setItem('rr_oauth_state', csrf);
    sessionStorage.setItem('rr_oauth_expires', String(Date.now() + 10 * 60_000));
    localStorage.setItem('rr_client_id', clientId);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${location.origin}/auth/callback`,
      response_type: 'token',
      scope: 'user:read:chat',
      state: csrf,
      force_verify: 'true',
    });
    window.location.assign(`https://id.twitch.tv/oauth2/authorize?${params}`);
  }
  if (!state)
    return (
      <div className="loading-screen">
        <Brand />
        <LoaderCircle className="spin" />
        <p>
          {streamError
            ? 'Connection lost. Make sure RAID//RELAY is running on this computer.'
            : 'Establishing your orbital link…'}
        </p>
        {streamError && (
          <a className="button secondary" href={location.href}>
            Reload dashboard
          </a>
        )}
      </div>
    );
  const { mission: m, connection, now } = state;
  const flightPlan = missions.find((x) => x.id === m.settings.missionId)!;
  const currentMission = m.director
    ? {
        ...flightPlan,
        name: m.director.brief.title,
        location: m.director.brief.location,
        description: m.director.brief.briefing,
      }
    : flightPlan;
  const board = m.status === 'active' && m.raid && now < m.raid.until;
  const running = m.status === 'active';
  const locked = running || m.status === 'paused';
  const neededRole = roles.reduce((a, b) => (m.systems[a] <= m.systems[b] ? a : b));
  const rehearsal = m.source === 'rehearsal';
  const overlayUrl = config.overlayUrl + (compact ? '&layout=compact' : '');
  if (overlay)
    return (
      <div
        className={`obs-root ${new URLSearchParams(location.search).get('layout') === 'compact' ? 'compact' : ''}`}
      >
        {streamError && (
          <div className="obs-disconnected">Connection lost · mission data may be stale</div>
        )}
        <div className="obs-panel">
          <div className="obs-top">
            <Brand small />
            <span className={`tag ${rehearsal ? 'amber' : 'lime'}`}>
              {rehearsal ? 'SIMULATED REHEARSAL' : 'TWITCH LIVE'}
            </span>
            <span className="mono">{time(m.remainingMs)}</span>
          </div>
          <div className="obs-body">
            <div className="obs-world">
              <SpaceScene mission={m} now={now} />
            </div>
            <div className="obs-info">
              <span className="eyebrow">{labels[m.status]}</span>
              <h1>{currentMission.name}</h1>
              <p>
                {m.status === 'complete'
                  ? `Rescue complete. ${m.crewCount} people brought them home together.`
                  : m.status !== 'active'
                    ? m.status === 'paused'
                      ? 'Crew signals resume when the captain resumes the mission.'
                      : m.status === 'ended'
                        ? 'Flight recorder ready. Thank you for taking part.'
                        : 'Choose a role. The rescue begins when your captain launches.'
                    : board
                      ? (m.director?.brief.welcome ??
                        `Welcome, ${m.raid!.name}'s community. Pick a role and join the rescue.`)
                      : 'Three roles. One rescue. Type a command in chat.'}
              </p>
              <ActiveDirective mission={m} />
              {roles.map((r) => (
                <div className="obs-role" key={r}>
                  <span style={{ color: roleInfo[r].color }}>{roleInfo[r].name}</span>
                  <code>{roleInfo[r].command}</code>
                  <span>
                    {m.systems[r]}/{m.settings.goal}
                  </span>
                  <div className="meter">
                    <i
                      style={{
                        width: `${(m.systems[r] / m.settings.goal) * 100}%`,
                        background: roleInfo[r].color,
                      }}
                    />
                  </div>
                </div>
              ))}
              <small>
                {m.crewCount} crew · {m.combos} relays · different people + all 3 roles in 15s =
                bonus
              </small>
            </div>
          </div>
          {board && (
            <div className="obs-welcome">
              <Radio size={15} /> BOARDING OPEN · First action this mission gets{' '}
              {m.settings.welcomeBonus ? '+2' : '+1'} · {Math.ceil((m.raid!.until - now) / 1000)}s
            </div>
          )}
        </div>
      </div>
    );

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <Brand />
        <div className="workspace">
          <span className="workspace-avatar">Z</span>
          <div>
            <strong>{connection.channel || 'Your community'}</strong>
            <small>Streamer workspace</small>
          </div>
          <ChevronDown size={13} />
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Workspace">
          {(
            [
              ['control', Crosshair, 'Mission control', '01'],
              ['plans', Layers, 'Flight plans', '03'],
              ['recorder', FolderOpen, 'Flight recorder', ''],
              ['guide', CircleHelp, 'Field guide', ''],
            ] as const
          ).map(([id, Icon, label, count]) => (
            <button
              key={id}
              className={tab === id ? 'nav-item selected' : 'nav-item'}
              onClick={() => {
                setTab(id);
                setMobileNav(false);
              }}
            >
              <Icon size={17} />
              <span>{label}</span>
              {count && <small>{count}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="built-card">
            <span className="built-icon">
              <Sparkles size={16} />
            </span>
            <strong>Built with Codex.</strong>
            <p>Powered by your community.</p>
            <span className="tiny-link">
              TWITCHCON 2026 <ArrowUpRight size={11} />
            </span>
          </div>
          <button className="nav-item" onClick={() => setModal('connect')}>
            <Link2 size={17} />
            <span>Connections</span>
            <span className={`connection-light ${connection.status === 'live' ? 'on' : ''}`} />
          </button>
          <button className="nav-item" onClick={openSettings}>
            <Settings2 size={17} />
            <span>Mission settings</span>
          </button>
          <div className="local-status">
            <span className="status-dot" />
            <span>Running locally</span>
            <span>v0.1</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-toggle icon-button"
              aria-label="Toggle navigation"
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Menu size={19} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={12} />
            <strong>
              {
                {
                  control: 'Mission control',
                  plans: 'Flight plans',
                  recorder: 'Flight recorder',
                  guide: 'Field guide',
                }[tab]
              }
            </strong>
          </div>
          <div className="topbar-right">
            <span className="local-chip">
              <span className="status-dot" /> LOCAL SESSION
            </span>
            <span className="header-divider" />
            <span className="avatar">Z</span>
          </div>
        </header>
        <main>
          {streamError && (
            <div className="error-banner" role="alert">
              <Wifi size={16} /> Dashboard connection lost. Displayed data may be stale.{' '}
              <a className="button secondary" href="/">
                Reload dashboard
              </a>
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <Flag size={16} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError('')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="mini-line" /> YOUR CHAT. YOUR CREW.
              </div>
              <h1>
                {
                  {
                    control: 'Mission control',
                    plans: 'A new world, together.',
                    recorder: 'Every crew leaves a story.',
                    guide: 'Your first flight starts here.',
                  }[tab]
                }
              </h1>
              <p>
                {
                  {
                    control:
                      'Turn a raid into a shared adventure. Let everyone be part of the story.',
                    plans: 'Choose a rescue. Your community decides how the journey unfolds.',
                    recorder: 'The signals, the people, and the moment it all came together.',
                    guide: 'A few simple commands. A community-sized possibility.',
                  }[tab]
                }
              </p>
            </div>
            <div className="heading-actions">
              <button className="button secondary" onClick={() => setModal('ai')}>
                <Sparkles size={18} /> AI settings
              </button>
              <button className="button secondary" onClick={() => setModal('overlay')}>
                <RadioTower size={15} /> OBS overlay <ArrowUpRight size={13} />
              </button>
              <button
                className={`button ${connection.status === 'live' ? 'secondary' : 'twitch-button'}`}
                onClick={() => setModal('connect')}
              >
                <TwitchIcon />
                {connection.status === 'live' ? `@${connection.channel}` : 'Connect Twitch'}
              </button>
            </div>
          </div>

          {tab === 'control' && (
            <>
              <div className="mode-strip">
                <span className={`tag ${rehearsal ? 'amber' : 'lime'}`}>
                  <span className="status-dot" />
                  {rehearsal ? 'REHEARSAL MODE' : 'TWITCH MODE'}
                </span>
                <span>
                  {rehearsal
                    ? 'Your sandbox is ready. Try the whole experience before going live.'
                    : connection.message}
                </span>
                <button onClick={rehearsal ? () => setModal('connect') : openSettings}>
                  {rehearsal ? 'Go live' : 'Change mode'} <ArrowRight size={13} />
                </button>
              </div>
              {state.ai && (
                <AIDirectorPanel
                  mission={m}
                  ai={state.ai}
                  busy={aiBusy}
                  now={now}
                  error={aiError}
                  onAction={aiAction}
                  onSettings={() => setModal('ai')}
                />
              )}
              <div className="mission-grid">
                <section className="mission-card card">
                  <div className="mission-card-header">
                    <div>
                      <span className="eyebrow">
                        MISSION 0{missions.indexOf(flightPlan) + 1} <span>/</span>{' '}
                        {currentMission.location}
                      </span>
                      <h2>
                        {currentMission.name} <span className="tag dark">CO-OP RESCUE</span>
                      </h2>
                    </div>
                    <div className="mission-header-actions">
                      {m.status === 'ready' && (
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() => act('control', { action: 'start' })}
                        >
                          <Play size={12} fill="currentColor" /> Launch
                        </button>
                      )}
                      <button
                        className="icon-button bordered"
                        aria-label="Edit mission flight plan"
                        onClick={openSettings}
                      >
                        <Settings2 size={16} />
                      </button>
                    </div>
                  </div>
                  <SpaceScene mission={m} now={now} />
                  {m.director && (
                    <div className="approved-brief">
                      <span className="eyebrow">
                        {m.director.source === 'gemini'
                          ? 'AI TRANSMISSION · APPROVED'
                          : 'LOCAL SAMPLE STORY'}
                      </span>
                      <p>{m.director.brief.briefing}</p>
                    </div>
                  )}
                  <ActiveDirective mission={m} />
                  <div className="mission-transport">
                    <div className="transport-label">
                      <span className={`status-dot ${running ? 'pulse' : 'muted'}`} />
                      <strong>{labels[m.status]}</strong>
                      <span className="transport-time">
                        <Gauge size={14} />
                        {time(m.remainingMs)}
                      </span>
                    </div>
                    <div className="transport-buttons">
                      {m.status === 'ready' && (
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() => act('control', { action: 'start' })}
                        >
                          <Play size={14} fill="currentColor" /> Launch mission
                        </button>
                      )}
                      {running && (
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={() => act('control', { action: 'pause' })}
                        >
                          <Pause size={14} /> Pause
                        </button>
                      )}
                      {m.status === 'paused' && (
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() => act('control', { action: 'resume' })}
                        >
                          <Play size={14} /> Resume
                        </button>
                      )}
                      {locked && (
                        <button
                          className="icon-button bordered"
                          aria-label="End mission"
                          disabled={busy}
                          onClick={() => confirmControl('end')}
                        >
                          <Square size={13} />
                        </button>
                      )}
                      {['ended', 'complete'].includes(m.status) && (
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() => confirmControl('reset')}
                        >
                          <RotateCcw size={14} /> New flight
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="role-grid">
                    {roles.map((r) => {
                      const Icon = roleIcons[r];
                      return (
                        <div className={`role-card role-${r}`} key={r}>
                          <div className="role-heading">
                            <span className="role-icon" style={{ color: roleInfo[r].color }}>
                              <Icon size={16} />
                            </span>
                            <span>{roleInfo[r].system}</span>
                            <span className="role-count">
                              {m.roleCounts[r]} <Users size={11} />
                            </span>
                          </div>
                          <div className="role-progress">
                            <strong>
                              {Math.floor((m.systems[r] / m.settings.goal) * 100)}
                              <small>%</small>
                            </strong>
                            <code>{roleInfo[r].command}</code>
                          </div>
                          <div className="meter">
                            <i
                              style={{
                                width: `${(m.systems[r] / m.settings.goal) * 100}%`,
                                background: roleInfo[r].color,
                              }}
                            />
                          </div>
                          <div className="role-foot">
                            <span>{roleInfo[r].name.toUpperCase()}</span>
                            <span>
                              {m.systems[r]} / {m.settings.goal}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
                <aside className="crew-column">
                  <section className="card crew-card">
                    <div className="panel-header">
                      <h3>
                        <Users size={16} /> Crew manifest
                      </h3>
                      <span className="tag dark">{m.crewCount.toString().padStart(2, '0')}</span>
                    </div>
                    <div className="crew-stats">
                      <div>
                        <strong>{m.crewCount}</strong>
                        <span>on the crew</span>
                      </div>
                      <div>
                        <strong className="lime-text">{m.combos}</strong>
                        <span>relay combos</span>
                      </div>
                    </div>
                    <div className="crew-list">
                      {m.crew.length ? (
                        m.crew
                          .slice(-5)
                          .reverse()
                          .map((p, i) => (
                            <div className="crew-row" key={p.id}>
                              <span
                                className="crew-avatar"
                                style={{
                                  background: `${roleInfo[p.role].color}15`,
                                  color: roleInfo[p.role].color,
                                }}
                              >
                                {p.name.slice(0, 1).toUpperCase()}
                              </span>
                              <div>
                                <strong>{p.name}</strong>
                                <small>
                                  {roleInfo[p.role].name}{' '}
                                  <span>
                                    · {p.actions} {p.actions === 1 ? 'action' : 'actions'}
                                  </span>
                                </small>
                              </div>
                              {i === 0 && <span className="tiny-tag">LATEST</span>}
                              <span
                                className="crew-dot"
                                style={{ background: roleInfo[p.role].color }}
                              />
                            </div>
                          ))
                      ) : (
                        <div className="empty-crew">
                          <div className="empty-orbits">
                            <Users size={23} />
                          </div>
                          <strong>Room for everyone.</strong>
                          <p>
                            Your crew appears here when
                            <br />
                            they send their first command.
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="crew-card-foot">
                      <span className="status-dot" /> No sign-up. No paywall. Just chat.
                    </div>
                  </section>
                  <section className={`boarding-card ${board ? 'boarding-active' : ''}`}>
                    <div className="boarding-icon">
                      <Orbit size={19} />
                    </div>
                    <span className="eyebrow">
                      {board ? 'BOARDING WINDOW OPEN' : 'A WARMER WELCOME'}
                    </span>
                    <h3>{board ? `Hello, ${m.raid!.name}'s crew.` : 'New to the orbit?'}</h3>
                    <p>
                      {board
                        ? (m.director?.brief.welcome ??
                          `${m.raid!.viewers} viewers arrived. Everyone can jump in — no lore homework required.`)
                        : 'When a raid arrives, give the new crew a way in, not a wall of context.'}
                    </p>
                    <div className="boarding-instruction">
                      <span>
                        {board
                          ? `FIRST ACTION ${m.settings.welcomeBonus ? '×2' : '+1'} · ${Math.ceil((m.raid!.until - now) / 1000)}s LEFT`
                          : 'JOIN IN ONE MESSAGE'}
                      </span>
                      <strong>
                        {board
                          ? `${m.progress}% complete. ${roleInfo[neededRole].system} needs you most.`
                          : 'Pick a role. Type a command.'}
                      </strong>
                      <div>
                        {roles.map((r) => (
                          <code key={r} style={{ color: roleInfo[r].color }}>
                            {roleInfo[r].command}
                          </code>
                        ))}
                      </div>
                    </div>
                    <div className="boarding-footer">
                      <Sparkles size={12} />
                      {board
                        ? `${m.welcomed} first-time mission contributors welcomed`
                        : 'Auto catch-up when a raid lands'}
                    </div>
                  </section>
                </aside>
              </div>
              <div className="bottom-grid">
                <section className="card activity-card">
                  <div className="panel-header">
                    <h3>
                      <Activity size={16} /> Mission activity{' '}
                      <span className="tiny-tag">{rehearsal ? 'SIMULATED' : 'TWITCH'}</span>
                    </h3>
                    <span className="activity-label">
                      <span className={`status-dot ${running ? 'pulse' : 'muted'}`} />
                      {running ? 'LISTENING' : 'STANDING BY'}
                    </span>
                  </div>
                  <div className="feed" aria-live="polite" aria-relevant="additions">
                    {m.feed.length ? (
                      m.feed.slice(0, 5).map((item) => (
                        <div className={`feed-row feed-${item.kind}`} key={item.id}>
                          <span
                            className="feed-icon"
                            style={item.role ? { color: roleInfo[item.role].color } : {}}
                          >
                            {item.kind === 'raid' ? (
                              <Users size={13} />
                            ) : item.kind === 'combo' ? (
                              <Sparkles size={13} />
                            ) : item.kind === 'system' ? (
                              <Radio size={13} />
                            ) : (
                              <Zap size={13} />
                            )}
                          </span>
                          <div>
                            <strong>{item.name}</strong> <span>{item.text}</span>
                            {item.first && <span className="first-badge">FIRST SIGNAL</span>}
                          </div>
                          <time>
                            {new Date(item.at).toLocaleTimeString('en-GB', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </time>
                        </div>
                      ))
                    ) : (
                      <div className="empty-feed">
                        <AudioLines size={22} />
                        <p>
                          A little quiet out here.
                          <br />
                          <span>Launch a mission to hear your community come alive.</span>
                        </p>
                      </div>
                    )}
                  </div>
                </section>
                <section className="card rehearsal-card">
                  <div className="panel-header">
                    <h3>
                      <WandSparkles size={16} />
                      {rehearsal ? 'Rehearsal deck' : 'Live telemetry'}
                    </h3>
                    <span className={`tag ${rehearsal ? 'amber' : 'lime'}`}>
                      {rehearsal ? 'SANDBOX' : 'EVENTSUB'}
                    </span>
                  </div>
                  {rehearsal ? (
                    <>
                      <p>
                        See what your community could make happen.
                        <br />
                        <span>All events here are simulated.</span>
                      </p>
                      <div className="simulation-buttons">
                        <button
                          className="button secondary"
                          disabled={!running || busy}
                          onClick={() => act('rehearsal', { action: 'crew' })}
                        >
                          <Plus size={14} /> Add crew
                        </button>
                        <button
                          className="button secondary"
                          disabled={!running || busy}
                          onClick={() => act('rehearsal', { action: 'raid' })}
                        >
                          <Users size={14} /> Simulate raid
                        </button>
                      </div>
                      <button
                        className={`autoplay-button ${state.demoRunning ? 'playing' : ''}`}
                        disabled={!running || busy}
                        onClick={() =>
                          act('rehearsal', { action: state.demoRunning ? 'stop' : 'autoplay' })
                        }
                      >
                        {state.demoRunning ? <Pause size={13} /> : <Play size={13} />}{' '}
                        {state.demoRunning ? 'Pause simulated chat' : 'Play a simulated community'}
                        <span>
                          {state.demoRunning ? 'RUNNING' : 'TRY IT OUT'} <ArrowRight size={13} />
                        </span>
                      </button>
                    </>
                  ) : (
                    <>
                      <p>{connection.message}</p>
                      <div className="telemetry">
                        <span>
                          Subscriptions <b>{connection.subscriptions}/2</b>
                        </span>
                        <span>
                          API calls this connection <b>{connection.apiCalls}</b>
                        </span>
                        <span>
                          EventSub notifications <b>{connection.received}</b>
                        </span>
                      </div>
                      <p className="muted-note">Read-only integration. No messages sent to chat.</p>
                    </>
                  )}
                </section>
              </div>
              <div className="insight-strip">
                <span>
                  <Zap size={14} /> Live relay
                </span>
                <div className="relay-chain">
                  {roles.map((r) => (
                    <span
                      key={r}
                      className={m.relay.includes(r) ? 'filled' : ''}
                      style={{ color: m.relay.includes(r) ? roleInfo[r].color : undefined }}
                    >
                      {m.relay.includes(r) ? <Check size={10} /> : <span className="relay-empty" />}
                      {roleInfo[r].name}
                    </span>
                  ))}
                </div>
                <p>
                  Three different people. Three roles. Within 15 seconds.{' '}
                  <strong>That’s a relay: +2 to every system.</strong>
                </p>
                <button onClick={() => setTab('guide')}>
                  How it works <ArrowUpRight size={12} />
                </button>
              </div>
            </>
          )}

          {tab === 'plans' && (
            <>
              <div className="plans-grid">
                {missions.map((plan, index) => (
                  <section
                    className={`card plan-card ${m.settings.missionId === plan.id ? 'chosen' : ''}`}
                    key={plan.id}
                  >
                    <div className={`plan-art plan-art-${index}`}>
                      <Orbit size={110} strokeWidth={0.55} />
                      <span>EXPEDITION / 0{index + 1}</span>
                      <span className="plan-planet" />
                    </div>
                    <div className="plan-content">
                      <span className="eyebrow">{plan.location}</span>
                      <h2>{plan.name}</h2>
                      <p>{plan.description}</p>
                      <div className="plan-meta">
                        <span>
                          <Users size={13} /> All crew sizes
                        </span>
                        <span>
                          <Gauge size={13} />
                          {plan.minutes} minutes
                        </span>
                      </div>
                      <button
                        className={`button ${m.settings.missionId === plan.id ? 'secondary' : 'primary'}`}
                        disabled={locked || busy}
                        onClick={async () => {
                          if (
                            await act('settings', {
                              settings: {
                                ...m.settings,
                                missionId: plan.id,
                                goal: plan.goal,
                                durationMinutes: plan.minutes,
                              },
                              source: m.source,
                            })
                          ) {
                            setTab('control');
                            setNotice(
                              'Flight plan loaded. Your community is ready for a new story.',
                            );
                          }
                        }}
                      >
                        {m.settings.missionId === plan.id ? (
                          <Check size={15} />
                        ) : (
                          <ArrowRight size={15} />
                        )}{' '}
                        {m.settings.missionId === plan.id
                          ? 'Load current plan'
                          : 'Load flight plan'}
                      </button>
                    </div>
                  </section>
                ))}
              </div>
              <div className="info-box">
                <ShieldCheck size={18} />
                <p>
                  {locked
                    ? 'End your current mission before loading another flight plan.'
                    : 'Every flight plan uses the same three-role rescue mechanic with its own story, duration, and goal. Tune the crew goal in Mission settings for your community.'}
                </p>
              </div>
            </>
          )}

          {tab === 'recorder' && (
            <>
              <section className="card recorder-hero">
                <div>
                  <span className={`tag ${rehearsal ? 'amber' : 'lime'}`}>
                    {rehearsal ? 'REHEARSAL · SIMULATED DATA' : 'TWITCH SESSION'}
                  </span>
                  <h2>
                    {m.status === 'complete'
                      ? 'You brought them home.'
                      : 'Your community’s flight recorder.'}
                  </h2>
                  <p>
                    {currentMission.name} · {labels[m.status]}
                    <br />A local record of this mission. Export it before loading the next flight.
                  </p>
                  <a className="button primary" href="/api/recorder" download>
                    <ArrowDownToLine size={15} /> Export flight recorder
                  </a>
                </div>
                <div className="recorder-symbol">
                  <RadioTower size={130} strokeWidth={0.7} />
                </div>
              </section>
              <div className="recorder-stats">
                {[
                  [m.crewCount, 'People who contributed'],
                  [m.actions, 'Accepted crew actions'],
                  [m.combos, 'Three-person relays'],
                  [m.welcomed, 'Boarding-window newcomers'],
                ].map(([n, title]) => (
                  <div className="card metric-card" key={title}>
                    <strong>{n}</strong>
                    <span>{title}</span>
                  </div>
                ))}
              </div>
              <section className="card story-card">
                <span className="eyebrow">THE STORY SO FAR</span>
                <h3>
                  {m.crewCount
                    ? `${m.crewCount} people, one shared signal.`
                    : 'Every story starts with a first signal.'}
                </h3>
                <p>
                  {m.status === 'complete' && m.director ? m.director.brief.conclusion : m.catchup}
                </p>
                <div className="info-box">
                  <LockKeyhole size={16} />
                  <p>
                    Stored on your computer. No raw chat history. “Newcomer” means a first
                    contribution to this mission; Twitch does not identify everyone who arrived with
                    a raid.
                  </p>
                </div>
              </section>
            </>
          )}

          {tab === 'guide' && (
            <div className="guide-grid">
              <section className="card guide-card">
                <span className="eyebrow">THE 60-SECOND BRIEFING</span>
                <h2>A community, not a command spammer.</h2>
                <p>
                  Fill all three systems before the rescue window closes. Each chat message is a
                  small action. Collaboration is the multiplier.
                </p>
                {roles.map((r) => {
                  const Icon = roleIcons[r];
                  return (
                    <div className="guide-role" key={r}>
                      <span style={{ color: roleInfo[r].color }}>
                        <Icon size={23} />
                      </span>
                      <div>
                        <h3>{roleInfo[r].name}</h3>
                        <p>
                          Type <code>{roleInfo[r].command}</code> to power the{' '}
                          {roleInfo[r].system.toLowerCase()}.
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div className="guide-callout">
                  <Sparkles size={20} />
                  <div>
                    <strong>The relay moment</strong>
                    <p>
                      Three different people use the three different commands within 15 seconds.
                      Everyone’s system gets +2. One person cannot trigger a relay alone.
                    </p>
                  </div>
                </div>
                <p>
                  One accepted action per person every {m.settings.cooldownSeconds} seconds, across
                  all roles. You can switch roles any time. No subscriptions, Bits, channel points
                  or viewer installation required.
                </p>
              </section>
              <section className="card guide-card">
                <span className="eyebrow">GOING LIVE</span>
                <h2>From sandbox to stream.</h2>
                {[
                  [
                    '01',
                    'Rehearse your rescue',
                    'Launch a mission, play the simulated community, then simulate a raid. Watch the newcomer boarding window.',
                  ],
                  [
                    '02',
                    'Connect your broadcaster account',
                    'Register a Twitch application, add the callback URL in Connections, and authorize read-only chat access.',
                  ],
                  [
                    '03',
                    'Add your OBS browser source',
                    'Copy the overlay URL. Set width 1920 and height 1080, with browser-source audio disabled.',
                  ],
                  [
                    '04',
                    'Start a fresh Twitch mission',
                    'Connect Twitch after ending your rehearsal. Launch the live mission and ask real chat to send the three commands.',
                  ],
                ].map(([n, title, description]) => (
                  <div className="guide-step" key={n}>
                    <span>{n}</span>
                    <div>
                      <h3>{title}</h3>
                      <p>{description}</p>
                    </div>
                  </div>
                ))}
                <button className="button primary" onClick={() => setModal('connect')}>
                  <Link2 size={15} /> Set up Twitch <ArrowRight size={14} />
                </button>
              </section>
            </div>
          )}
          <footer className="page-footer">
            <span>
              <span className="status-dot" /> All systems local. All moments shared.
            </span>
            <span>
              AI DIRECTOR · GEMINI <span>·</span> BUILT WITH OPENAI CODEX
            </span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
      <dialog
        ref={dialogRef}
        onCancel={() => setModal(null)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setModal(null);
        }}
      >
        <div className="modal">
          <button
            className="modal-close icon-button"
            aria-label="Close dialog"
            onClick={() => setModal(null)}
          >
            <X size={20} />
          </button>
          {modal === 'ai' && state.ai && (
            <>
              <AISettings
                ai={state.ai}
                busy={aiBusy}
                onAction={aiAction}
                onSaved={() => {
                  setModal(null);
                  setNotice(
                    'AI settings updated. Generate your first mission to verify Gemini access.',
                  );
                }}
              />
              {aiError && (
                <p className="modal-error" role="alert">
                  {aiError}
                </p>
              )}
            </>
          )}
          {modal === 'confirm' && confirmation && (
            <>
              <span className="modal-symbol">
                <Flag size={24} />
              </span>
              <h2>{confirmation.title}</h2>
              <p>{confirmation.message}</p>
              <div className="confirm-actions">
                <button className="button secondary" onClick={() => setModal(null)}>
                  Keep this flight
                </button>
                <a className="button secondary" href="/api/recorder" download>
                  <ArrowDownToLine size={17} /> Export recorder
                </a>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={async () => {
                    if (await act('control', { action: confirmation.action })) {
                      setModal(null);
                      setConfirmation(null);
                    }
                  }}
                >
                  {confirmation.action === 'end' ? 'End mission' : 'Start new flight'}
                </button>
              </div>
            </>
          )}
          {modal === 'connect' && (
            <>
              <span className="modal-symbol">
                <TwitchIcon />
              </span>
              <span className="eyebrow">CONNECT YOUR COMMUNITY</span>
              <h2>Your chat is the controller.</h2>
              <p>
                Sign in as the broadcaster. RAID//RELAY listens to chat and incoming raids using
                Twitch EventSub.
              </p>
              <div
                className={`connection-status ${connection.status === 'live' ? 'connected' : ''}`}
              >
                <Wifi size={17} />
                <div>
                  <strong>
                    {connection.status === 'live'
                      ? `Connected to @${connection.channel}`
                      : connection.status === 'connecting'
                        ? 'Connecting…'
                        : 'Twitch is not connected'}
                  </strong>
                  <small>{connection.message}</small>
                </div>
              </div>
              {connection.status === 'live' ? (
                <>
                  <p className="muted-note">
                    {connection.subscriptions} subscriptions · {connection.apiCalls} API calls this
                    connection · {connection.received} notifications
                  </p>
                  <button
                    className="button secondary full-width"
                    disabled={busy}
                    onClick={async () => {
                      if (await act('twitch/disconnect', {}))
                        setNotice('Twitch disconnected. The mission is paused.');
                    }}
                  >
                    <X size={15} /> Disconnect Twitch
                  </button>
                </>
              ) : (
                <>
                  <label className="field-label" htmlFor="client-id">
                    Twitch application Client ID <span>PUBLIC IDENTIFIER</span>
                  </label>
                  <input
                    id="client-id"
                    value={clientId}
                    placeholder="Paste your application Client ID"
                    onChange={(e) => setClientId(e.target.value)}
                    autoComplete="off"
                  />
                  <div className="setup-help">
                    <a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noreferrer">
                      Register a Twitch application <ExternalLink size={12} />
                    </a>
                    <span>Set this exact OAuth redirect URL:</span>
                    <code>{location.origin}/auth/callback</code>
                    <button
                      className="text-button"
                      onClick={() => copy(`${location.origin}/auth/callback`)}
                    >
                      <Copy size={12} /> Copy callback URL
                    </button>
                  </div>
                  {locked && (
                    <div className="info-box">
                      <Flag size={16} />
                      <p>
                        End your current mission before connecting. You’ll start with a fresh Twitch
                        flight.
                      </p>
                    </div>
                  )}
                  <button
                    className="button twitch-button full-width"
                    disabled={busy || locked}
                    onClick={authorize}
                  >
                    <TwitchIcon /> Authorize with Twitch <ArrowUpRight size={14} />
                  </button>
                </>
              )}
              <div className="privacy-note">
                <LockKeyhole size={14} />
                <span>
                  One scope: <code>user:read:chat</code>. Tokens stay in server memory, never in
                  your flight recorder. No messages are sent to chat. You’ll reconnect after
                  restarting.
                </span>
              </div>
            </>
          )}
          {modal === 'settings' && form && (
            <>
              <span className="modal-symbol">
                <Settings2 size={22} />
              </span>
              <span className="eyebrow">TUNE YOUR FLIGHT</span>
              <h2>Make room for your crew.</h2>
              <p>Set a reachable goal for your community. Changes load a fresh mission.</p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await act('settings', { settings: form, source })) {
                    setModal(null);
                    setNotice('Flight plan updated.');
                  }
                }}
              >
                <fieldset disabled={locked || busy}>
                  <label className="field-label" htmlFor="mission-select">
                    Flight plan
                  </label>
                  <select
                    id="mission-select"
                    value={form.missionId}
                    onChange={(e) => {
                      const plan = missions.find((p) => p.id === e.target.value)!;
                      setForm({
                        ...form,
                        missionId: plan.id,
                        goal: plan.goal,
                        durationMinutes: plan.minutes,
                      });
                    }}
                  >
                    {missions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <div className="form-row">
                    <div>
                      <label className="field-label" htmlFor="goal">
                        Goal per system
                      </label>
                      <input
                        id="goal"
                        type="number"
                        min="6"
                        max="1000"
                        required
                        value={form.goal}
                        onChange={(e) => setForm({ ...form, goal: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="field-label" htmlFor="duration">
                        Duration (minutes)
                      </label>
                      <input
                        id="duration"
                        type="number"
                        min="1"
                        max="60"
                        required
                        value={form.durationMinutes}
                        onChange={(e) =>
                          setForm({ ...form, durationMinutes: Number(e.target.value) })
                        }
                      />
                    </div>
                  </div>
                  <label className="field-label" htmlFor="cooldown">
                    Per-person cooldown (seconds)
                  </label>
                  <input
                    id="cooldown"
                    type="number"
                    min="1"
                    max="60"
                    required
                    value={form.cooldownSeconds}
                    onChange={(e) => setForm({ ...form, cooldownSeconds: Number(e.target.value) })}
                  />
                  <small className="field-hint">
                    Across all roles. Collaboration wins; message volume doesn’t.
                  </small>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.welcomeBonus}
                      onChange={(e) => setForm({ ...form, welcomeBonus: e.target.checked })}
                    />
                    <span>
                      <strong>Welcome bonus</strong>
                      <small>
                        First action this mission gives +2 during the 90-second boarding window.
                      </small>
                    </span>
                  </label>
                  <label className="field-label" htmlFor="source">
                    Event source
                  </label>
                  <select
                    id="source"
                    value={source}
                    onChange={(e) => setSource(e.target.value as typeof source)}
                  >
                    <option value="rehearsal">Rehearsal · simulated events</option>
                    <option value="twitch">Twitch · real events only</option>
                  </select>
                  <button className="button primary full-width" type="submit">
                    <Check size={15} /> Save flight plan
                  </button>
                </fieldset>
              </form>
              {locked && (
                <div className="info-box">
                  <LockKeyhole size={15} />
                  <p>End the current mission before editing the flight plan.</p>
                </div>
              )}
            </>
          )}
          {modal === 'overlay' && (
            <>
              <span className="modal-symbol">
                <RadioTower size={24} />
              </span>
              <span className="eyebrow">BRING THE STORY ON STREAM</span>
              <h2>Your orbit. In OBS.</h2>
              <p>
                A transparent browser source that follows this mission in real time. It can display
                the mission; it can’t control it.
              </p>
              <div className="overlay-mini-preview">
                <Orbit size={85} strokeWidth={0.8} />
                <div>
                  <Brand small />
                  <span>{currentMission.name}</span>
                  <div className="preview-bars">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={compact}
                  onChange={(e) => setCompact(e.target.checked)}
                />
                <span>
                  <strong>Compact overlay</strong>
                  <small>Hide the world scene and keep the crew systems.</small>
                </span>
              </label>
              <label className="field-label" htmlFor="overlay-url">
                Browser source URL
              </label>
              <div className="copy-field">
                <input id="overlay-url" readOnly value={overlayUrl} />
                <button
                  className="icon-button"
                  aria-label="Copy overlay URL"
                  onClick={() => copy(overlayUrl)}
                >
                  {copied ? <Check size={17} /> : <Copy size={17} />}
                </button>
              </div>
              <div className="overlay-specs">
                <span>
                  WIDTH <strong>1920</strong>
                </span>
                <span>
                  HEIGHT <strong>1080</strong>
                </span>
                <span>
                  BACKGROUND <strong>Transparent</strong>
                </span>
              </div>
              <a
                className="button primary full-width"
                href={overlayUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={15} /> Preview overlay
              </a>
              <div className="privacy-note">
                <LockKeyhole size={14} />
                <span>
                  This local read-only URL changes when you restart the server. Recopy it into OBS
                  after restarting. A rehearsal label stays visible on simulated missions.
                </span>
              </div>
            </>
          )}
          {error && (
            <p className="modal-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </dialog>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
