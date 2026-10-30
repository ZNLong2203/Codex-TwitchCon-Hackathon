# Verification and remaining work

Checked locally on 30 October 2026. Rehearsal screenshots are simulated and labeled. No Twitch credentials were supplied during the build.

## Automated checks

```sh
npm ci
npm test
npm run check
npm run build
npm audit --omit=dev --audit-level=high
```

The 20 engine/API/adapter tests cover:

- Distinct-person relay scoring, prevention of solo role switching, exact 15-second expiry and system caps/completion.
- Cooldown boundaries, exact command matching, duplicate delivery and unexpected user IDs.
- Incoming-raid onboarding, first mission action bonus, disabled bonus, repeat raid delivery and window expiry.
- Pause/resume, authoritative timeout, snapshot validation and restore-to-paused behavior.
- Bounded feed/crew display, channel filtering, Shared Chat origin filtering, malformed payloads and actual documented EventSub notification shapes.
- Same-origin operator access, missing operator authentication, DNS-rebinding host rejection, JSON export and Twitch/rehearsal separation.

The adapter fixtures validate ingestion, not Twitch server acceptance of OAuth scopes/subscriptions or network reconnect behavior.

## Local browser walkthrough

Verified through the app browser:

1. Launch rehearsal, simulate a raid, add crew, play simulated community, observe two three-person relay bonuses and changing meters.
2. Stop the simulated community and pause. The mission remains at its paused timer and the stream data appears consistently in the overlay.
3. Open OBS setup and preview the full read-only browser source. It shows the mission, timer, system values and persistent **SIMULATED REHEARSAL** label.
4. Inspect the 390×844 responsive layout and navigation. Document width matches viewport width; no horizontal page overflow was observed.
5. Verify plan loading is disabled during an active/paused mission. Set goal 6, launch a fresh rehearsal, contribute six simulated crew actions and observe completion at 100% in all systems. Verify the completed flight-recorder view.

Screenshots in `docs/images/` show this local rehearsal. They are not evidence of live Twitch use or an actual OBS capture.

## Required account/device checks before submission

- [ ] Register a public Twitch application and exact callback URI using [setup](twitch-setup.md).
- [ ] Authorize as the broadcaster; verify both real EventSub subscriptions reach live status.
- [ ] Show real Twitch commands changing dashboard and OBS. Three real accounts should generate a relay.
- [ ] Arrange an authorized incoming raid and verify the real boarding window. If simulated raid footage is used, label it accurately.
- [ ] Disconnect network, restore it, and verify re-subscription; note that messages during disconnection cannot be replayed.
- [ ] Exercise Twitch-requested session migration and revocation, using controlled Twitch tooling where feasible. Do not claim these branches were live-tested merely because they exist in code.
- [ ] In OBS, verify actual transparent compositing, frame rate, full/compact layouts, resize and source refresh. Browser preview alone cannot verify OBS behavior.
- [ ] Quit/restart, verify restored pause, fresh display key and reauthorization. Export progress before reconnecting, since a new connection starts a new Twitch mission.
- [ ] Film a YouTube demo under 3 minutes with actual Twitch and Codex footage. Exclude tokens and private documents.
- [ ] Confirm `/status` session ID and fill in video/repository links on Devpost. Submit before the deadline and verify the final submitted state.

No real-audience engagement metrics, load benchmarks or measured retention improvements have been established. Do not present simulated crew counts as actual users.
