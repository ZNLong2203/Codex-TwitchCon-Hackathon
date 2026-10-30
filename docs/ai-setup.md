# Gemini mission director

The AI director proposes an original three-act rescue, two routes with conditional endings and a newcomer welcome. Classic relay mode retains its timed side objective. It uses your theme and aggregate game state. **Gemini 3.8 Flash** is the primary model. **Gemini 3.5 Flash-Lite** is a single fallback for eligible availability/response failures. The model that actually produced a draft is visible and stored with it.

## Connect and use

1. Create a key for a Gemini-enabled project in [Google AI Studio](https://aistudio.google.com/api-keys). Check your project's model access, quota and billing there.
2. In the local dashboard, open **AI settings**. Paste the key and save. Copy the full secret value, not the key nickname or project ID. Quoted values and a single `GEMINI_API_KEY=...` assignment are accepted. Never send a key in chat or commit it to Git.
3. Alternatively set `GEMINI_API_KEY` in an ignored local `.env` and restart. Interactive keys are held in server memory only and must be entered again after restarting.
4. Enter a theme and select English or Vietnamese. Click **Generate AI mission**. Gameplay controls stay usable while generation is pending.
5. In expedition mode, review all three act objectives, the two route descriptions and conditional endings, and the exact targets shown by the UI. Nothing appears on the display stream until **Publish three-act mission** is clicked. Publish before launch; the script is locked for the flight.
6. Scouts discover → the community votes → engineers stabilize → pilots extract. The engine enforces all targets and transitions. No model calls occur for chat commands, votes, raids or transitions during an expedition.
7. In classic mode, **Publish mission & objective** queues a timed, distinct-person side objective at ready state or activates it during play. Its timer pauses with the rescue and rewards apply once. Raid-triggered drafting is classic-only; publication still requires review.

A labeled local sample is available only in rehearsal. It makes no model call, consumes no AI budget and cannot be published to a Twitch mission. It is useful for learning the review flow, not evidence that Gemini works.

## Model selection and failure behavior

| Attempt               | Model                   | Thinking  | Output ceiling                  |
| --------------------- | ----------------------- | --------- | ------------------------------- |
| Primary               | `gemini-3.8-flash`      | `low`     | 3,072 tokens including thinking |
| One eligible fallback | `gemini-3.5-flash-lite` | `minimal` | 3,072 tokens including thinking |

`minimal` is not supported for 3.8 Flash; the primary uses `low`. See [Google's thinking guide](https://ai.google.dev/gemini-api/docs/generate-content/thinking). Both models support [structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output); output is independently validated before review.

A primary timeout, network failure, model-specific unavailability, 429/5xx, truncated output or invalid draft can trigger one fallback. Both attempts count and reserve budget separately. Invalid credentials/permissions/configuration and safety refusals do not trigger fallback. There is no infinite retry, hidden switch or automatically fabricated response. If fallback fails, the game continues and the operator sees a safe error.

## Cost controls

- Default local reservation guard: **$0.25 per server process**, adjustable from $0.01 to $10.
- **Eight provider attempts per mission**. A primary plus fallback uses two attempts.
- Twenty seconds between new generation operations, one operation in flight, identical ready-state requests cached.
- A 16 KiB prompt-byte guard and bounded output. No inference per chat message.
- Reserve an estimated **$0.03 per primary attempt** and **$0.02 per fallback attempt** at current configured rates; failures/timeouts keep their reservation because they may still be billed. The primary reserve rises with the published January 2027 rate schedule.
- Input/output totals and cost estimates use reported usage metadata and the actual model. The provider's billing is authoritative. A byte cap and local reservation are **not a guaranteed invoice ceiling**; provider schema/framing, prices and terms can change. Use your provider billing controls if a financial hard limit is required.
- Process restart resets these local counters; they are not an account-wide quota meter. Mission reset clears the mission-attempt count, not the current process's total reservation.

Google's [pricing](https://ai.google.dev/gemini-api/docs/pricing), checked 30 October 2026, lists standard paid text rates of $0.75/M input and $3.75/M output/thinking for 3.8 Flash through 31 December, then $1.50/$7.50 from 1 January 2027. Flash-Lite is $0.30/$2.50 per million. For illustration, 1,000 input + 500 output tokens costs about **$0.002625** on primary or **$0.00155** on fallback at the current paid rates. Free-tier access and [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) depend on your actual project; do not assume fixed free quotas.

## Data handling

Only the streamer's theme, language and allowlisted mission aggregates go to Google: status, progress, system totals, role counts, crew count, action/relay count and incoming raid viewer count. No raw chat, viewer names, participant IDs, Twitch token, operator cookie or roster is sent. The theme itself is user-provided text, so keep it free of private information you do not want processed by the provider.

Google's pricing page distinguishes free-tier data usage for product improvement from paid-tier handling. Review the applicable [Gemini terms](https://ai.google.dev/gemini-api/terms) for your project. The key remains server-side and is absent from API responses, overlay state and recorder exports. Approved narrative and objectives are included in local snapshots/exports; pending drafts and usage counters are memory-only.

## Troubleshooting

| Error                           | Next action                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Key looks incomplete            | Copy the full secret value from AI Studio, rather than the key's name.                                                   |
| Budget field rejected           | Use a number such as `0.25` or `0,25` in the UI. The API expects a JSON number.                                          |
| API key rejected                | Check project/model permission and key restrictions in AI Studio; the app does not use fallback to bypass authorization. |
| Quota reached                   | Inspect actual project quota. One fallback may also fail if both models share an exhausted constraint.                   |
| Budget guard reached            | Review reserved attempts and intentionally change the local guard if needed.                                             |
| Draft expired/previous mission  | Generate a new draft for the current flight.                                                                             |
| Expedition script locked        | Load a new flight; three-act scripts are reviewed before launch.                                                         |
| Current objective still running | Finish it or let its window expire before publishing another.                                                            |

Provider documentation and fixture tests do not prove a live generation. Verify a real response using your authorized key and check the actual-model label before recording a submission demo.
