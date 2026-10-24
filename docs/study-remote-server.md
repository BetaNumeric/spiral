# Study relay setup

The optional relay provides a small JSON API and can also serve Spiral and the
facilitator page. The app can stay on GitHub Pages and connect to a separate HTTPS
relay. It uses Node's built-in modules, so there is no dependency install or
database setup. Start it from this checkout with a current Node release:

```powershell
node tools/study-relay.mjs
```

Open `http://127.0.0.1:8080/facilitator.html` for a local desktop test. A phone needs
an HTTPS address with a certificate it trusts. Ordinary HTTP at a laptop's Wi-Fi
address does not provide the secure browser APIs the app uses for recording and
recorder ownership.

Keep the terminal open while using it. The bare address opens the calendar;
`/facilitator.html` opens the facilitator controls. `127.0.0.1` works only on the
computer running Node, not on a separate phone. If Node reports **address already
in use**, a server is already using that port. Try the existing facilitator page
first, or run `node tools/study-relay.mjs --port 8081` and use port 8081 instead.

## Keep the app on GitHub Pages

GitHub Pages hosts the static app and dashboard; it cannot run the Node service.
For this project the dashboard is
`https://betanumeric.github.io/spiral/facilitator.html`.

1. Publish the updated app files to GitHub Pages.
2. Run the relay at an HTTPS address, using a host or tunnel as described below.
   Allow the app's origin when starting the relay:

   ```powershell
   node tools/study-relay.mjs --allow-origin https://betanumeric.github.io
   ```

   Use the origin without `/spiral/`. `ALLOWED_ORIGINS` is the equivalent environment
   variable; it accepts a comma-separated list of exact origins.
3. Open the GitHub Pages facilitator page and enter the relay's HTTPS origin in
   **Study service address**, for example `https://study.example.org`. Create the
   connection. If a previous connection exists, forget it before changing services.
4. Scan its QR code on each phone, check the service address, and tap **Connect**.
   The QR opens the GitHub Pages app and pre-fills the address and pairing code.
   In an already installed app, enter both in **Remote facilitator** instead.

Recordings and the calendar stay in the GitHub Pages app's browser storage.
Credentials are bound to the paired service; entering another address does not
send an existing connection's credentials there. Cross-origin requests are allowed
only for configured origins and still require the room/device credentials.

### Temporary HTTPS from the laptop

For a pilot, a [Cloudflare Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
provides an HTTPS address without a Cloudflare account. Install
[`cloudflared`](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/)
first. Keep the Node command above running, then open a second terminal:

```powershell
cloudflared tunnel --url http://127.0.0.1:8080
```

Paste the printed `https://…trycloudflare.com` origin into the GitHub Pages
facilitator page. Keep both terminals running. The address changes after restarting
the tunnel and stops when the tunnel closes. Quick Tunnels are testing tools with
no uptime guarantee; use a stable hosted service or tunnel for the study and pilot
the full workflow on the actual phones first.

## Hosted HTTPS

Run the same server behind an HTTPS reverse proxy or on a Node host that provides
HTTPS. Use this start command when the host expects a public listener:

```powershell
node tools/study-relay.mjs --host 0.0.0.0 --allow-origin https://betanumeric.github.io
```

The server reads the host's `PORT` environment variable. Set `PUBLIC_ORIGIN` to
the public HTTPS origin, such as `https://study.example.org`. This allows browser
Origin validation when the proxy forwards requests to the internal HTTP server.
The host needs the whole static app checkout, including `facilitator.html`, the
`js`, `icons`, `images`, and `sounds` directories, and the analysis module in
`tools/study-analysis-core.mjs`.
Use one running instance for the study: room state is held in that process's
memory, so multiple uncoordinated instances cannot share a connection.

Calendar and facilitator can use the relay's own address or an explicitly allowed
origin such as GitHub Pages. `PUBLIC_ORIGIN` identifies the relay's public address;
`ALLOWED_ORIGINS` identifies other app origins that may connect to it. The relay
does not allow arbitrary cross-origin requests. Browser recordings and the starting
calendar belong to the app's origin, so keep using the same app address throughout
the study.

## HTTPS on the laptop

You can also provide a certificate and key trusted by every study phone:

```powershell
node tools/study-relay.mjs --host 0.0.0.0 --cert C:\study\cert.pem --key C:\study\key.pem
```

The certificate must cover the name or address used by the phones. Open that
HTTPS address from the laptop too, so its QR link points to an address the phones
can reach. Local Wi-Fi, firewall rules, and certificate trust must be checked on
the real phones before the study. `TLS_CERT` and `TLS_KEY` environment variables
are alternatives to the two file arguments.

## Session behavior

- One facilitator room supports up to 32 phones. Each phone has its own credential,
  state, command queue, and acknowledgement. Automatic participant numbers are
  reserved across the room, including commands still awaiting confirmation.
- Rooms last eight hours. Pairing codes last ten minutes and can be refreshed;
  already paired phones remain connected when a code expires.
- Only the phone can confirm a command as applied. Commands expire after 15
  seconds, and repeated requests with the same command ID do not execute twice.
  Late acknowledgements still report an earlier applied command accurately.
- Hiding the phone, losing recorder ownership, or going offline disables new
  commands. The phone's local recording remains independent of the relay.
- The relay keeps rooms in memory. Restarting it requires a new pairing, while
  recordings already saved on phones remain available.
- The relay shares compact status and an activity feed. It does not receive event
  descriptions, a copy of the calendar, or the raw recording archive. Note text is
  held only while its command awaits delivery; completed and expired command
  history removes that text.

Treat a pairing code as an invitation to the room and keep the facilitator tab
private. Controller and phone credentials are separate and are never placed in
query strings or server logs. The server limits pairing guesses, room/device
counts, request sizes, and retained command history.

## Archive after the study

Stop the relay to disable remote control; the calendar and local recordings still
work. To remove its UI entirely, archive `facilitator.html`, `facilitator.css`,
`js/study-facilitator.js`, `js/study-remote.js`, `js/study-connection.js`, the relay/browser-check tools, and
their tests. Remove the remote subsection/script from `index.html` and their
entries from `service-worker.js`, then bump the app version. The optional
`setupStudyRemoteControls?.()` hook can be removed too. Local Study Session and
Study Analysis are independent of those files.

## Checks

```powershell
node --test tests/study-relay.test.mjs
node tools/study-relay.mjs --help
```

The protocol tests cover multiple phones, credential isolation, stale state,
acknowledgements, expiry, duplicate commands, privacy filtering, and restricted
static-file serving. The broader browser workflow check also exercises real
pairing and remote study commands.
