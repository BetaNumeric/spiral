# Study relay setup

The optional relay serves Spiral, the facilitator page, and a small JSON API from
one address. It uses Node's built-in modules, so there is no dependency install or
database setup. Start it from this checkout with a current Node release:

```powershell
node tools/study-relay.mjs
```

Open `http://127.0.0.1:8080/facilitator.html` for a local desktop test. A phone needs
an HTTPS address with a certificate it trusts. Ordinary HTTP at a laptop's Wi-Fi
address does not provide the secure browser APIs the app uses for recording and
recorder ownership.

## Hosted HTTPS

Run the same server behind an HTTPS reverse proxy or on a Node host that provides
HTTPS. Use this start command when the host expects a public listener:

```powershell
node tools/study-relay.mjs --host 0.0.0.0
```

The server reads the host's `PORT` environment variable. Set `PUBLIC_ORIGIN` to
the public HTTPS origin, such as `https://study.example.org`. This allows browser
Origin validation when the proxy forwards requests to the internal HTTP server.
The host needs the whole static app checkout, including `facilitator.html`, the
`js`, `icons`, `images`, and `sounds` directories, and the analysis module in
`tools/study-analysis-core.mjs`.
Use one running instance for the study: room state is held in that process's
memory, so multiple uncoordinated instances cannot share a connection.

Calendar, facilitator, and `/study-api/` must share an origin. The relay does not
allow arbitrary cross-origin requests. If the existing Spiral site is hosted
separately, either open the calendar served by the relay or proxy `/study-api/`
under the existing site's origin. Browser recordings and the saved starting
calendar belong to that origin; prepare the study calendar at the address that
participants will use.

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
`js/study-facilitator.js`, `js/study-remote.js`, the relay/browser-check tools, and
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
