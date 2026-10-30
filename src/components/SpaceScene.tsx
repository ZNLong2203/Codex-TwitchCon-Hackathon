import { Crosshair, Sparkles } from 'lucide-react';
import { missions, roleInfo, type MissionView } from '../../shared/contracts';

export function SpaceScene({ mission, now }: { mission: MissionView; now: number }) {
  const missionIndex = missions.findIndex((m) => m.id === mission.settings.missionId);
  const board = mission.status === 'active' && mission.raid && now < mission.raid.until;
  const complete = mission.status === 'complete';
  return (
    <div className={`space-scene ${complete ? 'rescued' : ''} scene-${missionIndex}`}>
      <svg
        className="space-art"
        viewBox="0 0 900 500"
        role="img"
        aria-label="A rescue ship approaches an orbital relay station. Three crew systems power the rescue."
      >
        <defs>
          <radialGradient id="spaceGlow">
            <stop stopColor="#60775b" stopOpacity=".19" />
            <stop offset="1" stopColor="#141d20" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="planet">
            <stop stopColor="#88947a" />
            <stop offset=".5" stopColor="#49584b" />
            <stop offset="1" stopColor="#1c2828" />
          </radialGradient>
          <linearGradient id="shipTop" x2="1" y2="1">
            <stop stopColor="#f0eee2" />
            <stop offset="1" stopColor="#929b92" />
          </linearGradient>
          <linearGradient id="shipSide" x2="0" y2="1">
            <stop stopColor="#65756b" />
            <stop offset="1" stopColor="#243934" />
          </linearGradient>
          <linearGradient id="panel" x2="1" y2="1">
            <stop stopColor="#759186" />
            <stop offset="1" stopColor="#304e45" />
          </linearGradient>
          <linearGradient id="beam">
            <stop stopColor="#c3f66b" stopOpacity="0" />
            <stop offset=".75" stopColor="#c3f66b" stopOpacity=".5" />
            <stop offset="1" stopColor="#e8ffc1" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <filter id="planetShadow">
            <feDropShadow dx="-8" dy="16" stdDeviation="15" floodOpacity=".5" />
          </filter>
          <pattern id="dotGrid" width="30" height="30" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r=".7" fill="#c5d8c5" opacity=".12" />
          </pattern>
        </defs>
        <rect width="900" height="500" fill="url(#dotGrid)" />
        <ellipse cx="455" cy="255" rx="400" ry="280" fill="url(#spaceGlow)" />
        {Array.from({ length: 48 }, (_, i) => (
          <circle
            key={i}
            cx={(i * 137.51) % 890}
            cy={(i * 89.31) % 480}
            r={i % 8 === 0 ? 1.5 : 0.8}
            fill="#d3dfcc"
            opacity={0.15 + (i % 5) * 0.12}
            className={i % 4 === 0 ? 'twinkle' : ''}
          />
        ))}
        <g fill="none" stroke="#95a58b" strokeWidth="1">
          <ellipse
            cx="459"
            cy="265"
            rx="262"
            ry="118"
            transform="rotate(-22 459 265)"
            opacity=".2"
          />
          <ellipse
            cx="459"
            cy="265"
            rx="333"
            ry="151"
            transform="rotate(-22 459 265)"
            opacity=".08"
          />
          <ellipse
            cx="459"
            cy="265"
            rx="198"
            ry="88"
            transform="rotate(-22 459 265)"
            opacity=".1"
            strokeDasharray="3 7"
          />
        </g>
        <g opacity=".35" stroke="#afc0a8" strokeWidth="1">
          <path d="M72 86v16m-8-8h16M807 389v16m-8-8h16M740 73v10m-5-5h10" />
        </g>
        <g transform="translate(687 120)" filter="url(#planetShadow)">
          <circle r="48" fill="url(#planet)" />
          <path
            d="M-43-17q38-5 74 36M-35-31q35 7 71 28M-47 5q24-3 61 27"
            fill="none"
            stroke="#a5ab8c"
            strokeWidth="4"
            opacity=".13"
          />
          <ellipse
            rx="73"
            ry="12"
            transform="rotate(-25)"
            fill="none"
            stroke="#82917b"
            strokeWidth="5"
            opacity=".22"
          />
          <ellipse
            rx="73"
            ry="15"
            transform="rotate(-25)"
            fill="none"
            stroke="#82917b"
            strokeWidth="1"
            opacity=".6"
          />
        </g>
        <g transform="translate(211 340)">
          <circle r="19" fill="#333f3c" />
          <circle cx="-5" cy="-6" r="5" fill="#46534c" />
          <circle cx="7" cy="8" r="4" fill="#273733" />
        </g>
        <path
          d="M284 336 Q400 360 552 246"
          stroke="url(#beam)"
          strokeWidth={complete ? 9 : 3}
          fill="none"
          strokeDasharray={complete ? undefined : '5 8'}
          className="signal-path"
        />
        <g className="station-float" transform="translate(443 225)">
          <ellipse cy="101" rx="125" ry="28" fill="#020908" opacity=".3" />
          <g transform="rotate(-13)">
            <path d="m-114 3 53-31 42 24-53 31z" fill="url(#panel)" stroke="#6a8979" />
            <path d="m-114 3 42 24v8l-42-24z" fill="#21382f" />
            <path d="m36 12 55-31 47 26-55 31z" fill="url(#panel)" stroke="#6a8979" />
            <path d="m83 38 55-31v8L83 46z" fill="#21382f" />
            <g stroke="#b0c6ae" strokeWidth=".6" opacity=".38">
              <path d="m-101 10 53-30m-39 38 53-30m-39 38 53-30M50 20l55-31M64 28l55-31M79 36l55-31M-99-5l42 24m-24-35 42 24M53 2l47 26m-29-36 47 26" />
            </g>
            <path d="m-32-5 30-18 49 28v56L15 79l-47-27z" fill="url(#shipSide)" stroke="#50665b" />
            <path d="m-32-5 30-18 49 28L15 24z" fill="url(#shipTop)" />
            <path d="M15 24v55" stroke="#99ab97" />
            <path d="m-17 15 18 11v24l-18-11z" fill="#192f29" stroke="#627967" />
            <path d="m23 28 14-8v23l-14 8z" fill="#192f29" />
            <path d="m25 32 10-6v5l-10 6z" fill="#c3f66b" />
            <path d="m-14 21 12 7v5l-12-7z" fill="#b7abef" />
            <path d="M0-23v-35m0 0-13 8m13-8 14 8" stroke="#bec6b6" strokeWidth="2" />
            <circle cy="-59" r="4" fill="#c3f66b" className="beacon" />
            <path d="m-25 52 40 23 25-15v8L15 84l-40-24z" fill="#c3f66b" opacity=".8" />
            <ellipse
              cy="-61"
              rx="19"
              ry="7"
              fill="none"
              stroke="#c3f66b"
              opacity=".3"
              className="beacon-ring"
            />
          </g>
        </g>
        <g className="ship-float">
          <g transform="translate(284 336) rotate(-27)">
            <path d="m-25 0-31-7v14z" fill="#c3f66b" opacity=".18" filter="url(#glow)" />
            <path d="m-23 0-26-4v8z" fill="#c3f66b" />
            <path d="m-20-7 29-8 28 15-28 15-29-8z" fill="url(#shipTop)" />
            <path d="m9 2 28-2-28 15-29-8v-5z" fill="#53685b" />
            <path d="m-1-8 15 3 8 5-18 1z" fill="#263f36" />
            <path d="m-9-4-19-16 8 19m11 5-19 16 8-19" fill="#b4bdae" />
            <circle cx="-18" r="2" fill="#d8ffa5" />
          </g>
        </g>
        {mission.crew.slice(-16).map((p, i) => {
          const angle = (i / 16) * Math.PI * 2 - 0.5;
          const x = 455 + Math.cos(angle) * (210 + (i % 3) * 15);
          const y = 265 + Math.sin(angle) * 95 - Math.cos(angle) * 50;
          return (
            <g key={p.id} className="crew-mote">
              <circle cx={x} cy={y} r="7" fill={roleInfo[p.role].color} opacity=".08" />
              <circle cx={x} cy={y} r="2.5" fill={roleInfo[p.role].color} />
              <path d={`M${x - 8} ${y}h-12`} stroke={roleInfo[p.role].color} opacity=".35" />
            </g>
          );
        })}
        <g fontFamily="monospace" fontSize="9" fill="#8f9a8d" letterSpacing="1">
          <text x="550" y="306">
            RELAY STATION 07
          </text>
          <path d="M531 277v24h12" stroke="#717f6b" fill="none" opacity=".5" />
          <text x="230" y="382">
            YOUR CREW
          </text>
        </g>
        {board && (
          <g>
            <ellipse
              cx="155"
              cy="217"
              rx="18"
              ry="42"
              transform="rotate(25 155 217)"
              stroke="#b6a0ff"
              strokeWidth="3"
              fill="#b6a0ff"
              fillOpacity=".08"
              className="portal"
            />
            <path d="m173 228 43 25" stroke="#b6a0ff" strokeDasharray="3 5" opacity=".5" />
          </g>
        )}
      </svg>
      <div className="scene-coordinates">
        <span>RA 23h 06m 42s</span>
        <span>DEC +61° 32′</span>
      </div>
      <div className="scene-badge">
        <span className={`status-dot ${mission.status === 'active' ? 'pulse' : ''}`} />
        {complete
          ? 'SIGNAL DELIVERED'
          : board
            ? 'INCOMING CREW DETECTED'
            : 'ORBITAL LINK ESTABLISHED'}
      </div>
      <div className="scene-bottom">
        <span>
          <Crosshair size={12} /> SECTOR 07 / KEPLER
        </span>
        <span>LOCAL RENDER · ZERO AI CALLS</span>
      </div>
      {complete && (
        <div className="rescue-celebration">
          <span>
            <Sparkles size={20} /> MISSION COMPLETE
          </span>
          <h2>
            One signal.
            <br />
            An entire community.
          </h2>
          <p>{mission.crewCount} crew members brought them home.</p>
        </div>
      )}
    </div>
  );
}
