# Pincer

Fresh Electron + React desktop application. The abandoned sibling OpenX directory
is a read-only visual donor, not this project's backend, update feed, configuration
source or runtime dependency. Do not edit, archive or back up that project.

## Scope

- Work incrementally. Implement only the next feature explicitly requested by the user.
- Current stage: direct connection, chat, Gateway-owned memory and Pincer updates.
- System execution, general files and agent management are not implemented yet.
  Do not silently carry them over from OpenX.
- User requests full authority for the node and operator, within the current OS user's
  privileges and Gateway pairing/approval policy. Do not equate permissions with
  implemented capabilities, advertise missing commands, or bypass pairing/UAC.

## Architecture

- React renders UI inside Electron. Keep secrets, signing keys, network connections,
  and future system operations in Main, never in Renderer.
- Use the typed `window.pincer` preload API. No general IPC/RPC escape hatch.
- Use pinned standalone `@openclaw/gateway-client` and `gateway-protocol` packages.
  Never install/bundle the root `openclaw` package, invoke its CLI, fork ACP, start
  a local Gateway, or read OpenX/OpenClaw user configuration as a fallback.
- Persist identity and role tokens through OS encryption. Isolate tokens by endpoint,
  context path, TLS identity, device and role. Corrupted storage must not reset identity.
- Pincer has its own future release channel. No OpenX update endpoints or build scripts.
- Preserve donated design tokens and presentation. New UI strings need RU and EN.
- Unsupported screens must be visibly unavailable, never backed by fake working data.

## Checks

- `npm run typecheck`
- `npm test`
- `npm run test:e2e` (builds and tests actual Electron against a loopback mock Gateway)
- `npm run build`

Use disposable, isolated test data. Do not connect tests to a user's Gateway or read
their credentials. The public server's installed version must be verified separately.
Do not claim complete upstream compatibility based only on mock tests.
