# Last One Standing — Neon Arena

A real-time multiplayer survival arena for up to 8 players, built with Node.js, Express and Socket.IO.

## Rules
- Create a room and share the 6-character room code.
- At least 2 and up to 8 players can join a lobby.
- The match lasts up to 2 minutes. Move with WASD / arrow keys (or mobile direction controls).
- Hold/tap Space or DASH to burst forward; dash cooldown is 2.2 seconds.
- The safe zone shrinks over time. Staying outside it drains health; return inside to recover slowly.
- Contact nudges players apart. The last survivor wins. If time expires, the survivor with the most health wins.

## Run locally
Requires Node.js 20+.

```bash
npm install
npm start
```

Open http://localhost:3000 in your browser. For testing with other devices on the same Wi-Fi, open `http://YOUR_COMPUTER_LAN_IP:3000` on each device. For remote play, deploy the app to a public Node.js host.

## Public deployment (Render)
1. Create a GitHub account if you do not have one, create a new repository, and upload this folder's contents.
2. Create a Web Service at https://render.com and connect the repository.
3. Set **Build Command** to `npm install` and **Start Command** to `npm start`.
4. Deploy. Render supplies `PORT` automatically; this server uses it. Use the generated HTTPS URL to invite players.
5. Keep the service running on a plan that supports persistent WebSocket connections. A sleeping/free instance may delay first connections after inactivity.

No database, API key, or user account is required for the game itself. Rooms are in memory, so a server restart clears active rooms. Use one server instance unless shared state/Redis is added.

## Checks
- `npm run check` checks server JavaScript syntax.
- `GET /health` returns a small health-check response.
- Multiplayer behavior should be verified with two separate browser/device sessions after deploying.
