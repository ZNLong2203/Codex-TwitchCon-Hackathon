# Verification and remaining work

Checked locally on 30 October 2026. Rehearsal screenshots are simulated and labeled. The owner supplied a public Client ID and personally authorized the broadcaster. Secrets remain in server memory.

## Automated checks

```sh
npm ci
npm test
npm run check
npm run build
npm audit --omit=dev --audit-level=high
```

**57 tests pass.** Engine/API/adapter/director coverage includes:

- Three sequential acts, role locks, both winning route requirements/endings, editable one-account ballots, ties/timeouts, pause and recovery, per-act uniqueness, private-ID-free views and exports, required AI branches, and legacy snapshot migration.
- Distinct-person classic relay scoring, prevention of solo role switching, exact 15-second expiry and system caps/completion.
- Cooldown boundaries, exact command matching, duplicate delivery and unexpected user IDs.
- Incoming-raid onboarding, first mission action bonus, disabled bonus, repeat raid delivery and window expiry.
- Pause/resume, authoritative timeout, snapshot validation and restore-to-paused behavior.
- Bounded feed/crew display, channel filtering, Shared Chat origin filtering, malformed payloads and actual documented EventSub notification shapes.
- Same-origin operator access, missing operator authentication, DNS-rebinding host rejection, JSON export and Twitch/rehearsal separation.

The adapter fixtures validate ingestion, not Twitch server acceptance of OAuth scopes/subscriptions or network reconnect behavior.

Additional runtime AI tests cover primary model selection and thinking settings, eligible fallback and actual-model provenance, no fallback on credentials/safety errors, budget/cooldown/concurrency, schema rejection, stale response discard, key normalization, hidden operator drafts, objective uniqueness/timers/rewards and approved-state recovery. Provider responses in automated tests are injected fixtures. Separate [live Gemini verification](live-ai-verification.md) covers the original classic objective and the new three-act script: the latter succeeded in one primary 3.8 Flash call with no fallback, then was reviewed and published into a Twitch mission.

## Local browser walkthrough

Verified through the app browser:

1. Launch rehearsal, simulate a raid, add crew, play simulated community, observe two three-person relay bonuses and changing meters.
2. Stop the simulated community and pause. The mission remains at its paused timer and the stream data appears consistently in the overlay.
3. Open OBS setup and preview the full read-only browser source. It shows the mission, timer, system values and persistent **SIMULATED REHEARSAL** label.
4. Inspect the 390×844 responsive layout and navigation. Document width matches viewport width; no horizontal page overflow was observed.
5. Verify plan loading is disabled during an active/paused mission. Set goal 6, launch a fresh rehearsal, contribute six simulated crew actions and observe completion at 100% in all systems. Verify the completed flight-recorder view.
6. Measure body/subtitle text at 16px, AI inputs/select/Generate at exactly 48px with aligned top edges on desktop, and matching 48px heights/full widths on mobile. Header AI buttons are 44px; neither desktop nor 390px mobile has horizontal overflow.
7. Publish an explicitly labeled local sample objective, resume, contribute two distinct scouts and observe the one-time +2 system bonus. Pause again. This checks the review/gameplay UI without claiming a Gemini call.
8. Enter an incomplete test key and verify the specific validation message; clear it afterward. Check end confirmation offers both Keep this flight and Export recorder.

9. Run the three-act rehearsal through scout discovery, pause an active ballot, choose drift, complete 2 engineer and 4 pilot contributions, and observe its specific ending. Automated coverage separately completes beacon. The same engine processes every simulated input.
10. Check 1440px desktop without horizontal overflow, the 390×844 layout with vertically stacked ballot cards and no horizontal overflow, and a 1920×1080 overlay ballot fully within the frame. AI form controls remain exactly 48px high on mobile; header controls are 44px.
11. Personally authorized Twitch reaches `live` with both subscriptions. A real Gemini script is reviewed, published and launched on that connection. See [live evidence](live-ai-verification.md) and the [allowlisted snapshot](live-integration-evidence.json). The owner deferred chat testing; the live mission is paused with zero accepted commands/raids.

Screenshots `expedition-route-vote`, `expedition-mobile` and `expedition-overlay` show explicitly simulated rehearsals. `gemini-expedition-live` shows the published real Gemini mission on an actual Twitch connection. The allowlisted JSON records model usage and integration status. No image is an OBS capture or proof of a completed real multi-person run.

## Required account/device checks before submission

- [x] Verify a real Gemini 3.8 Flash response with an authorized key, review its objective, publish it and demonstrate its gameplay effect in rehearsal. The UI reported `gemini-3.8-flash`; three distinct simulated scouts completed the objective. See [evidence](live-ai-verification.md).
- [x] Register a public Twitch application and exact callback URI using [setup](twitch-setup.md). The owner completed authorization.
- [x] Authorize as the broadcaster; verify both real EventSub subscriptions reach live status (two subscriptions, three startup API calls).
- [x] Generate a complete three-act/two-route script using real Gemini 3.8 Flash, review and publish it before launch.
- [ ] Show real Twitch commands changing dashboard and OBS. At least four real accounts can finish either default expedition branch; three distinct scouts open its ballot.
- [ ] Arrange an authorized incoming raid and verify the real boarding window. If simulated raid footage is used, label it accurately.
- [ ] Disconnect network, restore it, and verify re-subscription; note that messages during disconnection cannot be replayed.
- [ ] Exercise Twitch-requested session migration and revocation, using controlled Twitch tooling where feasible. Do not claim these branches were live-tested merely because they exist in code.
- [ ] In OBS, verify actual transparent compositing, frame rate, full/compact layouts, resize and source refresh. Browser preview alone cannot verify OBS behavior.
- [ ] Quit/restart, verify restored pause, fresh display key and reauthorization. Export progress before reconnecting, since a new connection starts a new Twitch mission.
- [ ] Film a YouTube demo under 3 minutes with actual Twitch and Codex footage. Exclude tokens and private documents.
- [ ] Confirm `/status` session ID and fill in video/repository links on Devpost. Submit before the deadline and verify the final submitted state.

No real-audience engagement metrics, load benchmarks or measured retention improvements have been established. Do not present simulated crew counts as actual users.
