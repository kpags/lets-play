# Deploying on Render

This app is deployed as two services: a Node Web Service for the WebSocket
server and a Static Site for the Vue frontend.

1. Push this repository, then create a new Render Blueprint from it. Render
   creates the `lets-play-websocket` Web Service and `lets-play-frontend`
   Static Site defined in `render.yaml`.
2. After the WebSocket service is live, copy its public URL and set the Static
   Site's `VITE_WS_URL` environment variable to the same URL with `wss://`,
   for example `wss://lets-play-websocket.onrender.com`.
3. Save the environment variable and redeploy the Static Site. Vite embeds
   `VITE_*` values while building, so the frontend must be rebuilt after this
   value changes.

The WebSocket server receives its listening port from Render through `PORT`.
For local development, leave `VITE_WS_URL` unset; the frontend falls back to
`ws://<current-host>:8787`.
