# Reviewer quick start

RAID//RELAY is a local cooperative rescue for Twitch chat. Scouts discover → the community chooses a route → engineers stabilize → pilots extract. AI writes a reviewed three-act story; the server owns the rules. A route changes required coordination and the ending.

## Run the source checkout

Requires Node.js 22+ and npm:

```sh
npm ci
npm run dev
```

Open **http://localhost:4317**. Keep the process running. Rehearsal needs no account, credentials or model calls. Use one instance per checkout.

## Run the compiled artifact

On a successful [GitHub Actions run](https://github.com/ZNLong2203/Codex-TwitchCon-Hackathon/actions), download **raid-relay-production** from its Artifacts section and extract it. GitHub may require signing in to download. Then, from the extracted directory:

```sh
npm ci --omit=dev
npm start
```

This package includes the verified compiled client/server, startup script, dependency lockfile and public documentation. It excludes credentials, local snapshots, `private/`, `.env` and installed dependencies. It needs no TypeScript/Vite compiler to run. Each CI artifact is retained for 14 days; the source repository remains the durable distribution.

## A one-minute rehearsal

1. Keep **Rehearsal** as the event source and **Three-act expedition** as the mode. Existing personal snapshots may retain classic mode; end that mission and choose expedition in Mission settings if needed.
2. Optionally try **AI Mission Director → Try a labeled local sample → Publish three-act mission** before launch. This makes **no model call** and is clearly labeled. The preset also works without this step.
3. Click **Launch mission → Play a simulated community**. Watch scans reveal the stranded vessel.
4. When scouting finishes, a 20-second ballot opens. The simulator casts route votes; the operator may use **Simulate beacon vote** / **Simulate drift vote** and **Close ballot now**. One simulated vote represents one generated fixture identity, not a real account.
5. With the default target of three: beacon needs **4 engineers → 2 pilots**; drift needs **2 engineers → 4 pilots**. Repeated actions from one identity cannot fill another person's place in an act.
6. Watch repairs restore the shield and attach the rescued cargo, then boosts tow it along the selected path. Its ending appears only after extraction completes.
7. Open **OBS overlay → Preview overlay**. It displays the same authoritative state with **SIMULATED REHEARSAL** labeling.
8. Export the **Flight recorder**. It records the branch and aggregate contributor/vote counts; simulation labeling stays attached. Pause/resume preserves timers. Active missions restore paused after a graceful restart.

## Verify actual AI and Twitch

RAID//RELAY has been run live on Twitch: EventSub delivered 31 of 31 chat commands and votes from three accounts, both routes were completed end to end with the overlay composited in OBS Studio, and real Gemini 3.8 Flash scripts were reviewed and published before launch. See [live verification](live-ai-verification.md) and the [integration snapshot](live-integration-evidence.json).

To repeat with your own accounts, follow [Gemini setup](ai-setup.md) and [Twitch/OBS setup](twitch-setup.md). Review and publish the AI script **before launch**. With the default base of three, four accounts can finish either branch (three with a base of two); the same people may contribute in later acts after cooldown. Simulated inputs are blocked in Twitch mode. Keys and tokens must be entered locally and are never included in the repository or artifact.

## Reproduce the verification suite

In a source checkout with development dependencies installed:

```sh
npm run verify
```

This runs 83 engine/API/director/Twitch tests, builds the app, executes the compiled-launcher smoke test in a temporary directory, and checks formatting. The transport tests inject fake HTTP/WebSocket providers and a controlled clock. They exercise recovery, keepalives, handoff races and authorization failures without spending model quota. The production test finishes a full simulated rescue and verifies access isolation and restart recovery. It does not touch your `.env`, running port or mission snapshot.

The CI workflow also audits production dependencies and uploads the compiled artifact after checks pass. See [verification details](testing.md).
