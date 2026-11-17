<p align="center">
  <img src="frontend/public/favicon.svg" alt="Apporo CF Tunnel Web" width="80">
</p>

<h1 align="center">Apporo CF Tunnel Web — Kubernetes (k3s) edition</h1>

<p align="center">
  <strong>Publish the services of a k3s namespace through a Cloudflare tunnel, from a browser — linked to Apporo Security Access on www.apporo.ai.</strong>
</p>

---

Apporo CF Tunnel Web comes in three editions: Podman
([Apporo_podman_cf_tunnel_webgui](https://github.com/WOOWTECH/apporo_cf_tunnel_web)),
Home Assistant add-on
([Apporo_ha_cf_tunnel_webgui](https://github.com/WOOWTECH/apporo_ha_cf_tunnel_web)) and this
Kubernetes (k3s) edition. All three have the same pages and the same three ways to connect:

| Page | What it does |
|---|---|
| Dashboard | tunnel state (edge connections), start / stop / restart |
| Apporo Link | link an **Apporo Security Access** with a device code, review its routes, connect, release, test the public URLs |
| Setup | log in to **your own Cloudflare account**, create a tunnel, create DNS routes (locally managed mode) |
| Config | paste a **tunnel token**, routes, catch-all, post-quantum, log level, run parameters |
| Logs | live cloudflared output, secrets redacted |

The Kubernetes edition runs as one pod in the namespace whose services it should
publish, and lists those services so you can pick them instead of typing addresses:

- **Setup (your own Cloudflare)**: tick the services, give each a hostname, apply — the
  WebGUI creates the DNS records and the ingress itself, all in one go.
- **Apporo Link**: the hostnames (`<prefix>.apporo.ai`) are routes of your Security Access
  and are added in the Apporo portal; the WebGUI lists each service's internal address to
  copy there. (If a platform offers the `security-access:routes` scope, the same picker
  creates the routes in one go — see `docs/paas-api.md`; the Apporo platform does not
  offer it yet.)
- **Config (token)**: the routes of a token-mode tunnel live in the Cloudflare dashboard;
  the picker gives you the list to enter there.

## How it works

- The app listens on loopback only. The pod's only entrance is an nginx basic-auth proxy
  on port 8080 (user `admin`, password from the chart's Secret or the hosting platform).
- cloudflared runs as a child of the app. If it exits while it should be running, the app
  starts it again (after 2, 5, 10, 30, 60 s); the liveness probe watches the app only.
- `/data` (a 1Gi volume) keeps the settings, the tunnel token, `cert.pem`, `tunnel.json`
  and the Apporo link state, each file 0600.
- A route's service is an in-namespace address such as `http://my-app:8080`.
- A namespaced, read-only Role lets the app list the namespace's Services and
  EndpointSlices; a NetworkPolicy opens egress to the Kubernetes API for it.

## Install

```bash
helm install apporo-cftw oci://ghcr.io/woowtech/charts/apporo-cf-tunnel-webgui \
  --version 1.0.0 --namespace my-apps
kubectl -n my-apps get secret apporo-cftw-apporo-cf-tunnel-webgui-secret \
  -o jsonpath='{.data.admin_password}' | base64 -d; echo
kubectl -n my-apps port-forward svc/apporo-cftw-apporo-cf-tunnel-webgui 8080
# open http://localhost:8080 and log in as admin
```

| Value | Default | Meaning |
|---|---|---|
| `paas.apiBase` | `https://www.apporo.ai` | platform of the Apporo Link page |
| `paas.clientId` | `woow-ha-smart-home` | OAuth client the Apporo platform knows this connector by |
| `paas.routesWrite` | `false` | the platform grants `security-access:routes` (bulk publish) |
| `paas.routeDomain` | `apporo.ai` | hostname = `<prefix>.<routeDomain>` |
| `networkPolicy.apiServerCidrs` | `[10.43.0.1/32]` | egress to the Kubernetes API; add your control-plane node IPs on CNIs that match after DNAT |
| `persistence.size` | `1Gi` | the `/data` volume |
| `config.sensitive.admin_password` | generated | the GUI password (kept across upgrades) |

The image is `ghcr.io/woowtech/apporo-cf-tunnel-webgui` (amd64 and arm64), built by
`.github/workflows/release.yml`.

## Development

```bash
python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -m "not e2e" -q
cd frontend && npm ci && npm test && npm run build
helm lint --strict charts/apporo-cf-tunnel-webgui
```

## Security

- Never expose port 8000: the app has no login of its own; the chart keeps it on loopback.
- State-changing requests need the CSRF header (`apporo_csrftoken` cookie); WebSockets are
  accepted only from a page of the same origin.
- The tunnel token, OAuth tokens and `cert.pem` never reach the browser.

## Lineage

Branched from the WOOW Kubernetes edition
([Woow_k3s_cf_tunnel_webgui](https://github.com/WOOWTECH/Woow_k3s_cf_tunnel_webgui) 1.3.1)
with the Apporo branding and English interface of the Apporo Podman edition.

## License

MIT
