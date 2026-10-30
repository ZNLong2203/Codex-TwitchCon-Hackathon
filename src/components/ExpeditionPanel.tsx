import { Check, LockKeyhole, Route as RouteIcon, Users } from 'lucide-react';
import { roleInfo, roles, type MissionView } from '../../shared/contracts';
import { expeditionHint, expeditionTargets, routes } from '../../shared/expedition';

export function ExpeditionPanel({
  mission,
  busy = false,
  operator = false,
  onAction,
}: {
  mission: MissionView;
  busy?: boolean;
  operator?: boolean;
  onAction?: (path: string, body: unknown) => unknown;
}) {
  const e = mission.expedition;
  if (!e) return null;
  const active = mission.status === 'active';
  return (
    <section
      className={`expedition-panel ${operator ? '' : 'expedition-spectator'}`}
      aria-label="Three-act rescue"
    >
      <div className="expedition-topline">
        <span className="eyebrow">THREE ACTS · ONE COMMUNITY</span>
        <span className="tag dark">
          {e.route ? e.script.routes[e.route].name : 'Route undecided'}
        </span>
      </div>
      <ol className="expedition-acts">
        {roles.map((role, index) => {
          const done = e.contributors[role] >= e.targets[role];
          const current = e.phase === role;
          return (
            <li
              key={role}
              className={done ? 'done' : current ? 'current' : 'locked'}
              aria-current={current ? 'step' : undefined}
            >
              <span className="act-number" style={{ color: roleInfo[role].color }}>
                {done ? <Check size={16} /> : current ? index + 1 : <LockKeyhole size={14} />}
              </span>
              <div>
                <strong>{e.script.acts[role].title}</strong>
                <span>
                  {roleInfo[role].command} · {e.contributors[role]}/{e.targets[role]} people
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      {e.phase !== 'complete' && (
        <p className="expedition-next" aria-live="polite">
          {['paused', 'ended'].includes(mission.status)
            ? `${mission.status === 'paused' ? 'Paused' : 'Flight ended'}. `
            : ''}
          {expeditionHint(e)}
        </p>
      )}
      {roles.includes(e.phase as (typeof roles)[number]) && operator && (
        <p className="expedition-objective">
          {e.script.acts[e.phase as (typeof roles)[number]].objective}
        </p>
      )}
      {e.phase === 'choice' && (
        <div className="route-ballot">
          <div className="route-ballot-heading">
            <strong>
              <RouteIcon size={18} /> Your crew chooses the rescue
            </strong>
            <span>
              {Math.ceil(e.ballotMs / 1000)}s {active ? 'left' : '· paused'}
            </span>
          </div>
          <div className="route-options">
            {routes.map((route) => {
              const targets = expeditionTargets(mission.settings.crewPerAct ?? 3, route);
              return (
                <div className={`route-option route-${route}`} key={route}>
                  <strong>{e.script.routes[route].name}</strong>
                  <code>!route {route}</code>
                  <p>{e.script.routes[route].description}</p>
                  <span className="route-targets">
                    {targets.engineer} engineers → {targets.pilot} pilots
                  </span>
                  <span className="route-votes">
                    <Users size={14} /> {e.votes[route]} votes
                  </span>
                  {operator && mission.source === 'rehearsal' && (
                    <button
                      className="button secondary"
                      disabled={busy || !active}
                      onClick={() => onAction?.('rehearsal', { action: 'route', route })}
                    >
                      Simulate {route} vote
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="route-ballot-footer">
            <small>
              One vote per account. Changing your vote replaces it. A tie or no votes selects
              beacon.
            </small>
            {operator && (
              <button
                className="button secondary"
                disabled={busy || !active}
                onClick={() => onAction?.('control', { action: 'lock-route' })}
              >
                Close ballot now
              </button>
            )}
          </div>
        </div>
      )}
      {e.phase === 'complete' && (
        <p className="expedition-ending">
          <Check size={18} /> {e.script.routes[e.route ?? 'beacon'].ending}
        </p>
      )}
    </section>
  );
}
