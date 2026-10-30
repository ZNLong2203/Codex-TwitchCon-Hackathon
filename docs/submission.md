# Devpost submission draft

This is an English draft describing implemented behavior. Do not submit it until the remaining Twitch/OBS checks in [testing](testing.md) are complete. Add the actual YouTube link and verify the main Codex session ID with `/status`.

## Project name

RAID//RELAY

## Tagline

An AI mission director turns Twitch chat into a rescue crew. A new story, a real role, a shared signal.

## Inspiration

A Twitch raid moves people into a new community in an instant. It does not automatically give those people context, a role, or an easy first interaction. We wanted to make the arrival itself a shared moment: something the existing community and the new arrivals could build together.

## What it does

Gemini 3.8 Flash directs the adventure: it reads the mission’s aggregate progress and the streamer’s theme, then proposes an original rescue story, newcomer welcome and playable crew objective. The streamer reviews and publishes it. Objectives require distinct people in a selected role before a time window closes; completion awards a bounded bonus in the actual game. Gemini 3.5 Flash-Lite is a single eligible fallback, with the model used clearly recorded.

RAID//RELAY is a cooperative rescue mission for Twitch chat, with a streamer dashboard and an OBS browser overlay. Viewers become scouts with `!scan`, engineers with `!repair`, or pilots with `!boost`. Each role powers a different ship system. Three different people using all three roles within 15 seconds create a relay, adding a bonus to every system. One person cannot trigger the teamwork bonus alone by spamming or switching roles.

An incoming raid opens a 90-second boarding window. The interface welcomes the arriving community, shows the current mission and most-needed system, and gives a bounded bonus to a person's first contribution in that mission. Twitch does not tell us which individual viewers came with a raid, so we welcome any first mission contribution during the window rather than pretending to identify raiders.

The streamer controls launch, pause, resume, mission goals and duration. Goals remain fixed when a raid arrives. Everyone can participate without paying, creating another account or installing an extension. A transparent, read-only OBS source displays the same authoritative state. A local flight recorder exports the current community story.

## How we built it

We used OpenAI Codex to research the event requirements, compare prior Twitch hackathon winners, implement the TypeScript mission engine, build the React dashboard and original orbital SVG scene, integrate Twitch OAuth/EventSub, and create tests and setup documentation. Research used GPT‑6.1 Terra, as part of our development workflow.

The local Express server is authoritative. It validates exact chat commands, enforces a per-person cooldown, deduplicates deliveries and calculates three-person relays deterministically. EventSub carries chat and incoming raids; Server-Sent Events synchronize the dashboard and OBS overlay. Atomic local snapshots support restoring an interrupted mission paused. OAuth tokens stay in memory and are not committed or included in recorder exports.

Codex is the development tool; Gemini powers the runtime mission director. The deterministic engine enforces every AI-proposed objective after schema validation and streamer approval. We cap attempts, output tokens and estimated budget, cache identical ready-state requests and avoid per-chat-message inference. Generation happens asynchronously so the streamer can keep controlling the game. A secret-free rehearsal uses clearly labeled local examples instead of fabricating a model response.

## What makes it different

Chat-controlled games and overlays already exist. Our design focuses on the transition into a community: complementary role contributions, a visible three-person relay, a contextual entry point during a raid, fixed goals that do not punish arrival, and no paid participation advantage. We do not claim to have invented Twitch chat games or to identify individual raiders.

## Challenges

Making the experience fair required distinguishing people from message volume. Relays need distinct contributors, cooldowns apply across roles, duplicate messages cannot score twice within the dedupe window, and input stops when a mission ends. The overlay also needed to share server state without exposing operator controls or Twitch tokens.

We built both rehearsal and live paths, with persistent simulation labels and server-side separation so a simulated audience cannot silently contaminate a Twitch mission. Twitch disconnections are surfaced honestly because events during downtime cannot be replayed.

## Accomplishments

A complete local rehearsal loop, original orbital visuals, a shared OBS browser source, contextual onboarding, a deterministic engine, local recovery, and automated coverage for scoring, fairness, event validation and operator access. Live Twitch and OBS evidence should be recorded before finalizing this section; do not imply those checks have happened until they do.

## What we learned

We learned that the difficult part of participation is often the first useful action. A small and understandable role can give a new arrival a way to belong, while complementary roles give existing viewers a reason to coordinate. This remains a design hypothesis until evaluated with a real community.

## What's next

Playtest the onboarding and relay timing with small streamers, measure participation with consent, refine visual milestones, add streamer-authored mission presets, and investigate a deliberate cross-channel mission handoff. These are future ideas, not shipped features.

## Built with

OpenAI Codex, Gemini 3.8 Flash, Gemini 3.5 Flash-Lite, TypeScript, React, Vite, Node.js, Express, Twitch EventSub, Twitch OAuth, Server-Sent Events, Zod, ws, Lucide.

## Submission fields to complete

- Repository: https://github.com/ZNLong2203/Codex-TwitchCon-Hackathon
- Video: add your publicly viewable YouTube demo, under 3 minutes, showing Twitch and Codex.
- Codex session: verify `/status` in the main build chat. See [build record](codex-build.md).
- Testing instructions: link the README and Twitch setup guide.
- Status: this document is a draft, not confirmation of a Devpost submission.
