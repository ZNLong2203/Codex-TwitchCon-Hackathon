# Live Gemini verification — 30 October 2026

A real provider call was made through the running local application using an API key entered by the owner. No key, authorization header or provider credential is included here.

## Generation result

| Check                           | Observed result                         |
| ------------------------------- | --------------------------------------- |
| Local generation endpoint       | HTTP 200                                |
| Requested and successful model  | `gemini-3.8-flash`                      |
| Provider attempts               | 1                                       |
| Fallback                        | Not used                                |
| Reported input tokens           | 391                                     |
| Reported output/thinking tokens | 266                                     |
| Estimated paid text cost        | $0.00129075, using the configured rates |
| Generated story                 | Beacon in the Azure Surge               |
| Generated crew objective        | Luminescent Sweep                       |

The response passed the game's structured-output schema. The objective required **three distinct scouts** to send `!scan` within **75 seconds**, rewarding **+2 to every system**. The draft, newcomer welcome and ending were reviewed before publication.

![Actual Gemini draft before publication](images/gemini-live-draft.png)

## Gameplay verification

The approved draft was published into the existing **rehearsal** mission. Three distinct simulated scout actions completed its objective. No further Gemini call was needed for scoring. The mission was paused afterward.

| System         | Before actions | Ordinary action points | AI objective reward | After |
| -------------- | -------------- | ---------------------- | ------------------- | ----- |
| Signal array   | 16             | +3                     | +2                  | 21    |
| Hull integrity | 18             | 0                      | +2                  | 20    |
| Jump drive     | 18             | 0                      | +2                  | 20    |

The objective displayed **3/3 contributors** and **Objective complete**. This verifies a real Gemini output progressing through validation, review, publication and deterministic gameplay effects.

![Approved Gemini objective completed in rehearsal](images/gemini-live-objective.png)

The model call was real; the crew/chat events in this check were simulated. This is **not** evidence of a live Twitch stream, real viewers, an incoming Twitch raid, or actual OBS compositing. Those account/device checks remain in [testing](testing.md).

Cost is an estimate from reported usage, not a provider invoice. The app's $0.03 reservation for the attempt is a local guard allocation, not a claim that the provider charged $0.03.
