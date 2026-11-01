# Verification

Checked locally on 30 October 2026 and live on Twitch on 2 November 2026. The owner supplied a public Client ID and personally authorized the broadcaster. Secrets remain in server memory.

## Automated checks

```sh
npm ci
npm test
npm run check
npm run build
npm run test:production
npm audit --omit=dev --audit-level=high
```

**83 tests plus one compiled-production smoke test pass.** Engine/API/adapter/director coverage includes:

- Three sequential acts, role locks, both winning route requirements/endings, editable one-account ballots, ties/timeouts, pause and recovery, per-act uniqueness, private-ID-free views and exports, required AI branches, and legacy snapshot migration.
- Distinct-person classic relay scoring, prevention of solo role switching, exact 15-second expiry and system caps/completion.
- Cooldown boundaries, exact command matching, duplicate delivery and unexpected user IDs.
- Incoming-raid onboarding, first mission action bonus, disabled bonus, repeat raid delivery and window expiry.
- Pause/resume, authoritative timeout, snapshot validation and restore-to-paused behavior.
- Bounded feed/crew display, channel filtering, Shared Chat origin filtering, malformed payloads and actual documented EventSub notification shapes.
- Same-origin operator access, missing operator authentication, DNS-rebinding host rejection, JSON export and Twitch/rehearsal separation.

The transport suite uses injected fake HTTP/WebSocket connections and Node's controlled timer API. It covers two-subscription setup, transient 4006 recovery, requested handoff without re-subscribing, old-socket close during handoff, failed handoff fallback, ignored retired sockets and late HTTP responses, welcome/keepalive timeouts, authorization/scope/expiry failures, 401/429 subscription rejection, hourly revocation, bounded retries and timer cancellation. Invalid reconnect URLs cannot throw through the socket handler or redirect credentials. Unknown provider errors are replaced with safe messages.

These are deterministic protocol tests with injected transports; live Twitch results are recorded in [live verification](live-ai-verification.md). The separate compiled-production test starts the actual `npm start` launcher in an isolated temporary directory, serves built assets, completes a simulated drift rescue, checks operator/overlay separation, and restarts to verify persisted pause, stale-cookie rejection and display-key rotation. It uses no real credentials and does not modify the developer's active session or snapshot.

Additional runtime AI tests cover primary model selection and thinking settings, eligible fallback and actual-model provenance, no fallback on credentials/safety errors, budget/cooldown/concurrency, schema rejection, stale response discard, key normalization, hidden operator drafts, objective uniqueness/timers/rewards and approved-state recovery. Provider responses in automated tests are injected fixtures. Separate [live Gemini verification](live-ai-verification.md) covers the original classic objective and the new three-act script: the latter succeeded in one primary 3.8 Flash call with no fallback, then was reviewed and published into a Twitch mission.

## Local browser walkthrough

Verified through the app browser:

1. Launch rehearsal, simulate a raid, add crew, play simulated community, observe two three-person relay bonuses and changing meters.
2. Stop the simulated community and pause. The mission remains at its paused timer and the stream data appears consistently in the overlay.
3. Open OBS setup and preview the full read-only browser source. It shows the mission, timer, system values and persistent **SIMULATED REHEARSAL** label.
4. Inspect the 390×844 responsive layout and navigation. Document width matches viewport width; no horizontal page overflow was observed.
5. Verify plan loading is disabled during an active/paused mission. Set goal 6, launch a fresh rehearsal, contribute six simulated crew actions and observe completion at 100% in all systems. Verify the completed flight-recorder view.
6. Measure body/subtitle text at 16px, AI inputs/select/Generate at exactly 48px with aligned top edges on desktop, and matching 48px heights/full widths on mobile. Header AI buttons are 44px; neither desktop nor 390px mobile has horizontal overflow.
7. Publish an explicitly labeled local sample objective, resume, contribute two distinct scouts and observe the one-time +2 system bonus. Pause again. This checks the review/gameplay UI without a model call.
8. Enter an incomplete test key and verify the specific validation message; clear it afterward. Check end confirmation offers both Keep this flight and Export recorder.

9. Run the three-act rehearsal through scout discovery, pause an active ballot, choose drift, complete 2 engineer and 4 pilot contributions, and observe its specific ending. Automated coverage separately completes beacon. The same engine processes every simulated input.
10. Check 1440px desktop without horizontal overflow, the 390×844 layout with vertically stacked ballot cards and no horizontal overflow, and a 1920×1080 overlay ballot fully within the frame. AI form controls remain exactly 48px high on mobile; header controls are 44px.
11. Personally authorized Twitch reaches `live` with both subscriptions. A real Gemini script is reviewed, published and launched on that connection. See [live evidence](live-ai-verification.md) and the [integration snapshot](live-integration-evidence.json).

Screenshots `live-route-vote` and `live-obs-overlay` are frames from the live Twitch run in OBS Studio. `gemini-expedition-live` shows a published Gemini mission on the Twitch connection.

## Live checks

- [x] Real Gemini 3.8 Flash responses reviewed and published: the classic objective, and complete three-act/two-route scripts before launch. See [evidence](live-ai-verification.md).
- [x] Public Twitch application with the exact callback URI; broadcaster authorized; both EventSub subscriptions live (three startup API calls).
- [x] Real Twitch chat drives the dashboard and OBS overlay: 31 of 31 commands and votes accepted from three accounts; drift completed twice and beacon once.
- [x] OBS Studio 33 composition of the transparent 1920×1080 browser source, full and compact layouts, next to the Twitch chat.
- [x] Pause, resume and launch controls exercised during the live run.
- [x] Demo video recorded from the live run and the Codex build session.
