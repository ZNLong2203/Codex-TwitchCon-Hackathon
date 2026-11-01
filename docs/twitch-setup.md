# Connect Twitch and OBS

## 1. Register your own Twitch application

You do not need to purchase an OpenAI API plan, create a Client Secret, or install a Twitch Extension.

1. Sign in to the [Twitch Developer Console](https://dev.twitch.tv/console/apps) with the Twitch account you intend to broadcast with. Twitch may require verified email/two-factor authentication; complete those steps yourself.
2. Open **Applications → Register Your Application**.
3. Enter a unique name, such as `Raid Relay — your channel`.
4. Add **exactly** `http://localhost:4317/auth/callback` as an OAuth Redirect URL. Use `localhost`, not `127.0.0.1`, in both your browser and the registered callback. If changing `PORT`, register the matching callback first.
5. Choose the category matching a local chat/game integration (the console's labels can change). If asked for client type, use **Public** for this local implicit-grant client. Complete the console's CAPTCHA/terms yourself, if shown.
6. Open the application's management page and copy its **Client ID**. This is a public identifier. Do not paste a Client Secret, password or OAuth token into chat or the repository.

The authoritative reference is [Twitch application registration](https://dev.twitch.tv/docs/authentication/register-app/) and [the implicit grant flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#implicit-grant-flow). Console wording may differ; the callback and scope must still match.

## 2. Authorize RAID//RELAY

1. Start the project with `npm run dev`, then open `http://localhost:4317`.
2. If a rehearsal is active or paused, click **End mission** first. Export its recorder if you want to keep it.
3. Click **Connect Twitch** or **Connections**.
4. Paste the **Client ID** and click **Authorize with Twitch**.
5. On Twitch, verify the account is the broadcaster whose chat you will use. Authorize the requested **read chat** scope, `user:read:chat`. RAID//RELAY does not request chat-writing or moderator powers.
6. The browser returns to the local dashboard. The app validates the returned state, validates the token server-side, opens EventSub and creates the chat-message and incoming-raid subscriptions. Wait for **Connected** and **2 subscriptions**.
7. A fresh mission is now in **Twitch mode**. Optionally generate and approve a three-act AI script before launch. Launch it and ask three distinct accounts to type `!scan` in your channel's real chat. Each accepted unique scout advances the first act. Locked-role commands do not score.
8. Scouting opens a 20-second ballot: `!route beacon` or `!route drift`. Each account has one editable vote. With default settings, beacon then needs four engineers using `!repair`, followed by two pilots using `!boost`; drift needs two engineers, then four pilots. The same accounts can help in later acts after cooldown. At least four real accounts can finish either path. Classic relay mode instead uses three different commands/people within 15 seconds for its relay bonus.

The token is not written to a database, `.env`, a screenshot or flight recorder. The callback URL fragment is cleared before the app sends the token to the local server. Restarting requires authorizing again. Disconnect closes EventSub and removes the server's token; revoke the application in your Twitch account Connections if you want to invalidate the grant at Twitch too.

Optional: put the **public Client ID only** in `.env` as `TWITCH_CLIENT_ID=...` to prefill the form. Copy `.env.example` to `.env` locally. Never commit `.env`.

## 3. Add the browser overlay in OBS

1. Keep the app running on the same computer as OBS.
2. In the dashboard, open **OBS overlay**. Select compact layout if desired.
3. Copy the entire browser-source URL. It contains a random, read-only local display key. The key cannot issue operator commands.
4. In OBS, add **Source → Browser**, paste the URL, set **Width 1920**, **Height 1080**, and leave audio disabled. The app sets the page background transparent; remove any custom OBS CSS that adds a solid background.
5. Preview it over your actual game/camera scene. Resize or choose compact layout so it does not cover important content.
6. Confirm the mission name, timer and meters match the dashboard. Refreshing the source must preserve state.
7. After restarting the server, recopy the new overlay URL. A stale key is deliberately rejected.

The overlay is local. A phone on another computer cannot use `localhost` to access it. Do not port-forward this server or place it on a public host: it is designed as a single-streamer local app.

## 4. Go live

Practice in rehearsal, then connect Twitch and launch. Chat commands drive the dashboard and overlay immediately, and an incoming raid opens the boarding window automatically. For a clean stream layout, place the overlay next to a Twitch chat browser source (`https://www.twitch.tv/popout/<channel>/chat?darkpopout`).

## Troubleshooting

| Symptom                        | Action                                                                                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Redirect mismatch              | Compare the registered callback with the app's displayed callback, including host, port and path.                                                                             |
| Wrong channel                  | Disconnect, end the old mission and authorize as the broadcaster. This MVP listens to the account you authorize, not an arbitrary channel.                                    |
| Token invalid or scope missing | Start authorization again with the same Client ID; allow `user:read:chat`.                                                                                                    |
| Subscription error 401/403     | Confirm broadcaster login, matching Client ID and scope. Consult [EventSub authentication](https://dev.twitch.tv/docs/chat/authenticating/).                                  |
| Twitch error 429               | Wait before reconnecting. Do not repeatedly click Connect.                                                                                                                    |
| Commands do nothing            | Ensure Twitch mode, both subscriptions live, mission active, exact command and per-person cooldown elapsed. Messages originating in another Shared Chat channel are ignored.  |
| Disconnected briefly           | Backoff reconnect attempts create a new session and resubscribe. Twitch does not replay messages lost during disconnection.                                                   |
| OBS says copy a fresh URL      | Reopen the overlay dialog and update OBS after restarting.                                                                                                                    |
| Progress restored paused       | This is intentional crash recovery. Reauthorize Twitch, which starts a fresh live mission, or use rehearsal settings to begin a new local mission. Export old progress first. |

Live OAuth, raids and OBS verification must be performed on your account. No credentials were supplied during development; local fixture tests are not a substitute.
