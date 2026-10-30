# Codex build record

This project was started from an empty workspace on 30 October 2026 for the Codex x TwitchCon Hackathon.

The main Codex chat handled product selection, implementation, tests, visual inspection, documentation and repository publication. A GPT‑6.1 Terra research subagent examined the official rules/resources, prior related hackathon winners, Twitch documentation and competing concepts. The user explicitly requested that model for research.

## What Codex contributed

- Converted the event's equally weighted criteria into a focused product direction; checked that a runtime AI API is not mandatory.
- Compared actual category winners, including PixelWars, and recorded limitations on novelty claims in [research](research.md).
- Implemented a deterministic mission engine with role complementarity, cooldowns, onboarding bonus, deduplication, pause and recovery.
- Built the original orbital SVG scene, React dashboard, mobile layout and read-only OBS overlay.
- Implemented the local OAuth and Twitch EventSub adapter, documented credential handling and live validation still needed.
- Added engine, adapter fixture, HTTP integration and Gemini director tests with a reproducible build/CI workflow.
- Added Gemini 3.8 Flash runtime direction with a bounded 3.5 Flash-Lite fallback, reviewed story generation and real crew-objective rewards.
- Revised typography to a readable 16px body scale, aligned AI controls, added actionable field validation and end/reset confirmation.
- Exercised a labeled rehearsal and OBS-browser preview in the local browser; inspected the mobile breakpoint and captured the screenshots in this repository.

## Main session ID

The desktop app metadata and `CODEX_THREAD_ID` environment identify this build chat as `01a18ad7-5793-7de1-99e8-be14ee3e5b58`. **Verify it with `/status` in this main Codex chat before pasting it into Devpost**, as the event asks for the session where most of the project was built. Use the main build session, not the research subagent.

Do not publish the entire private chat history or credentials. For video evidence, show relevant non-sensitive sections of the main Codex conversation and the implementation/test result. Research and simulated rehearsal should be described accurately; no prize, retention or real-user claim is established by this build record.
