# Devpost submission draft

This is an English draft describing implemented behavior. Do not submit it until the remaining Twitch/OBS checks in [testing](testing.md) are complete. Add the actual YouTube link and verify the main Codex session ID with `/status`.

## Project name

RAID//RELAY

## Tagline

An AI mission director turns Twitch chat into a rescue crew. A new story, a real role, a shared signal.

## Inspiration

A Twitch raid moves people into a new community in an instant. It does not automatically give those people context, a role, or an easy first interaction. We wanted to make the arrival itself a shared moment: something the existing community and the new arrivals could build together.

## What it does

RAID//RELAY is a three-act rescue for Twitch chat, with a streamer dashboard and transparent OBS browser overlay. Gemini 3.8 Flash proposes an original premise, act objectives and two conditional route endings. The streamer reviews the full script before launch. A single eligible Gemini 3.5 Flash-Lite fallback is clearly labeled when used.

Scouts send `!scan` to reveal a stranded vessel. Only distinct people count, and only the current act can advance. Once scouting finishes, everyone can vote `!route beacon` or `!route drift`. Each account has one editable vote. The 20-second ballot pauses with the mission; ties choose beacon. With default settings, beacon needs four engineers and then two pilots, while drift needs two engineers and then four pilots. The decision changes the coordination required, the visible flight path and the ending.

Engineers restore the shield with `!repair`; only then can pilots use `!boost` to tow the rescued cargo home. Scans reveal the target, repairs restore it, and boosts move the tug. One person spamming cannot finish an act. Participants can help in later acts after cooldown. Classic relay mode remains available with simultaneous systems, three-person relay bonuses and the earlier timed AI side objective.

Incoming raids open a 90-second boarding card with the current useful command. Targets do not increase when viewers arrive. Twitch does not identify individual raiders, so “welcomed” means any first mission contribution during the arrival window. No payment, extra account or viewer installation is needed.

The streamer controls launch, pause, resume, target size and duration. A read-only OBS source displays authoritative state. The flight recorder exports the selected route, aggregate voting/contribution results and integration counters. It does not contain credentials or the private per-act contributor/voter IDs.

## How we built it

We used OpenAI Codex to research the event requirements, compare prior Twitch hackathon winners, implement the TypeScript mission engine, build the React dashboard and original orbital SVG scene, integrate Twitch OAuth/EventSub, and create tests and setup documentation. Research used GPT‑6.1 Terra, as part of our development workflow.

The local Express server is authoritative. It validates exact chat commands, enforces a per-person cooldown, deduplicates deliveries and calculates act unlocks, editable route votes and completion deterministically. EventSub carries chat and incoming raids; Server-Sent Events synchronize the dashboard and OBS overlay. Atomic local snapshots support restoring an interrupted mission paused. OAuth tokens stay in memory and are not committed or included in recorder exports.

Codex is the development tool; Gemini powers the runtime mission director. The deterministic engine enforces fixed roles, bounded target formulas and route voting after validating the narrative schema and requiring explicit publication. AI cannot call tools, change permissions or bypass the rules. We cap attempts, output tokens and estimated budget, cache identical ready-state requests and avoid per-chat-message inference. Generation happens asynchronously so the streamer can keep controlling the game. A secret-free rehearsal uses clearly labeled local examples instead of fabricating a model response.

## What makes it different

Chat-controlled games and overlays already exist. Our focus is the transition into a community: an immediately useful action, complementary roles that hand off a rescue, and a collective decision with visible consequences. The community changes the coordination and ending, while a reviewed AI script makes the same understandable rules fit the streamer's theme. Arrival does not raise targets and paid status provides no advantage. We do not claim to have invented chat games or to identify individual raiders.

## Challenges

Making the experience fair required distinguishing people from message volume. Each act needs distinct contributors, one account cannot multiply its votes, cooldowns apply across roles, duplicate messages cannot score twice within the dedupe window, and input stops when a mission ends. The overlay also needed to share server state without exposing operator controls or Twitch tokens.

We built both rehearsal and live paths, with persistent simulation labels and server-side separation so a simulated audience cannot silently contaminate a Twitch mission. Twitch disconnections are surfaced honestly because events during downtime cannot be replayed.

## Accomplishments

A complete three-act rehearsal loop, both route outcomes, original responsive orbital visuals, reviewed real Gemini 3.8 Flash generation, a real broadcaster connection with both EventSub subscriptions, local recovery and 57 automated tests. Real multi-person chat, raids, recovery under network failure and OBS compositing must be documented before claiming a fully verified live community run.

## What we learned

We learned that the difficult part of participation is often the first useful action. A small and understandable role can give a new arrival a way to belong, while complementary roles give existing viewers a reason to coordinate. This remains a design hypothesis until evaluated with a real community.

## What's next

Playtest the onboarding and route tradeoffs with small streamers, measure participation with consent, add more streamer-authored scenario variations and investigate a deliberate cross-channel mission handoff. These are future ideas, not shipped features.

## Built with

OpenAI Codex, Gemini 3.8 Flash, Gemini 3.5 Flash-Lite, TypeScript, React, Vite, Node.js, Express, Twitch EventSub, Twitch OAuth, Server-Sent Events, Zod, ws, Lucide.

## Submission fields to complete

- Repository: https://github.com/ZNLong2203/Codex-TwitchCon-Hackathon
- Video: add your publicly viewable YouTube demo, under 3 minutes, showing Twitch and Codex.
- Codex session: verify `/status` in the main build chat. See [build record](codex-build.md).
- Testing instructions: link the README and Twitch setup guide.
- Status: this document is a draft, not confirmation of a Devpost submission.
