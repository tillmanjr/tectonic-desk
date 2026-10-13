# @tectonic/web

Vue 3 + Vite front end. `pnpm dev:web` serves it on http://localhost:5173 and proxies `/api` to the
server on port 3000. `pnpm build` writes `dist/`, which nginx serves in production (see
`deploy/nginx.conf`).
