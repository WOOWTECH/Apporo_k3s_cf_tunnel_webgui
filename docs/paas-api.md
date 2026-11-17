# PaaS edition: API contract

This file is the contract between the three parts of the PaaS edition:

- the WebGUI backend (`backend/`, FastAPI);
- the WebGUI frontend (`frontend/`, Vue 3);
- the WOOW PaaS platform endpoints that the WebGUI calls with the OAuth token of
  the linked account. They are an addition to the platform's existing Security
  Access API (an overlay addon on the platform that hosts the WebGUI).

Everything the Podman edition already had keeps its paths and payloads. This
file lists only what is new or changed.

## 1. WebGUI backend: new and changed endpoints

All paths are served at `/` behind the auth proxy (HTTP basic auth, user
`admin`). State-changing requests still need the CSRF header (`x-csrftoken`),
exactly as before.

### `GET /api/workspace`

The services that run next to this WebGUI in the same workspace (Kubernetes
namespace). They come from the Kubernetes API. When a PaaS account is linked
(`/api/paas/bootstrap` → `authorized: true`), the backend also asks the platform
for the services' display names, and fills `workspace`, `display_name`,
`template_slug` and `state`. If that call fails, those fields stay `null` and
the list is still returned.

```jsonc
{
  "available": true,                    // false outside Kubernetes or without API access
  "reason": null,                       // human-readable (zh-TW) when available=false
  "namespace": "paas-ws-0a1b2c3d",
  "self_release": "svc-1a2b3c4d",       // this WebGUI's own release, never listed
  "workspace": {"id": 4, "name": "my-workspace"},   // null when not linked or not found
  "services": [
    {
      "release": "svc-11111111",        // app.kubernetes.io/instance
      "chart": "pi-agent",              // app.kubernetes.io/name, else the Service name
      "display_name": "pi-1",       // platform service name, or null
      "template_slug": "pi-agent",      // or null
      "state": "running",               // platform state, or null
      "ready": true,                    // any ready endpoint behind the primary Service; null if unknown
      "suggested_prefix": "pi-1",   // valid PaaS route prefix (see §3), unique within the list
      "endpoints": [
        {
          "service": "svc-11111111-pi-agent",   // Kubernetes Service name
          "port": 8080,
          "port_name": "http",
          "protocol": "TCP",
          "kind": "http",               // "http" | "https" | "tcp"
          "url": "http://svc-11111111-pi-agent:8080",   // what a route's service field should be
          "primary": true               // the endpoint the platform itself publishes; exactly one per service
        }
      ]
    }
  ]
}
```

Rules:

- One entry per release (`app.kubernetes.io/instance`). A Service without
  that label becomes its own entry (`release` = the Service name).
- Headless Services (`clusterIP: None`) and this WebGUI's own release are left
  out.
- `primary` follows the platform operator's choice: the Services of the
  release sorted by name, the first non-headless one, and on it the first port
  in `[80, 8080, 3000, 8000, 443, 8443]`, else its first port.
- `kind`: `https` for port 443/8443 or a port name containing `https`; `tcp`
  for well-known non-HTTP ports (22, 1883, 3306, 5432, 6379, 8883, 27017) or a
  port name such as `postgres`, `redis`, `mqtt`, `ssh`; otherwise `http`.
  `url` uses that scheme (`tcp://` for `tcp`, `ssh://` for port 22).
- Sort: entries with `display_name` first, alphabetically by name.

### `GET /api/paas/bootstrap` (changed)

Two new fields:

```jsonc
{
  "authorized": true,
  "portal_url": "https://paas.example.com/woow#/workspaces",
  "connection": null,
  "release_pending": false,
  "routes_write": true,            // NEW: the platform lets this WebGUI add/remove routes
  "route_domain": "woowtech.io"    // NEW: hostname = <subdomain_prefix>.<route_domain>
}
```

### `GET /api/paas/accesses/{access_id}/review` (changed)

Each item of `access.routes` gains `id` (the platform route id) and
`subdomain_prefix`. Everything else is unchanged.

### `GET /api/paas/routes/check?prefix=<prefix>` (new)

```json
{"prefix": "pi-1", "available": true, "reason": ""}
```

### `POST /api/paas/accesses/{access_id}/routes` (new)

Adds several routes to a Security Access in one call. All of them are created
or none.

```json
{"routes": [
  {"subdomain_prefix": "pi-1", "service_url": "http://svc-11111111-pi-agent:8080"},
  {"subdomain_prefix": "omnigent-1", "service_url": "http://svc-22222222-omnigent:8000"}
]}
```

- `200` → `{"created": [{"id", "subdomain_prefix", "hostname", "service_url"}], "review": <same body as GET …/review>}`
- `409` → `{"detail": {"message": "<zh-TW>", "errors": {"<prefix>": "<reason>"}}}`
  (quota exceeded, a prefix taken, the access not writable)
- `422` → invalid input (bad prefix format, duplicate prefixes, empty list,
  more than 10 routes, a service URL that is not `http(s)://`, `tcp://`,
  `ssh://` or `rdp://`)
- `403` → the linked account is not an owner or admin of that workspace
- `501` → `routes_write` is off (the platform does not offer the write API)

The routes are public (no Cloudflare Access). The platform pushes them to the
tunnel itself; a connected WebGUI does not need to restart.

### `DELETE /api/paas/accesses/{access_id}/routes/{route_id}` (new)

`200` → `{"deleted": true, "review": <same body as GET …/review>}`.

## 2. Platform endpoints (overlay addon)

All are `Authorization: Bearer <access token>` JSON endpoints, like the
existing `/api/security-access/*` ones. Errors use the same
`{"error", "detail"}` body.

| Method and path | Scope | Who |
|---|---|---|
| `GET /api/security-access/workspaces/lookup?namespace=<ns>` | `workspace:read` | member |
| `GET /api/security-access/workspaces/<ws>/services` | `workspace:read` | member |
| `GET /api/security-access/routes/check?prefix=<p>` | `security-access:read` | any linked account |
| `POST /api/security-access/accesses/<sa>/routes` | `security-access:routes` | owner or admin |
| `DELETE /api/security-access/accesses/<sa>/routes/<route_id>` | `security-access:routes` | owner or admin |

- `lookup` → `{"workspace": {"id", "name", "slug", "namespace"}}`, or 404 when
  no active workspace the caller belongs to has that namespace.
- `services` → `{"workspace": {"id", "name", "namespace"}, "services": [{"id",
  "name", "template_slug", "template_name", "release", "state",
  "public_url"}]}`. Services that are being deleted are left out.
- `check` → `{"prefix", "available", "reason"}` with the same three checks the
  portal uses: format, platform database and Cloudflare DNS.
- `POST routes` takes the body of §1 and answers
  `{"routes": [<route to_dict>], "access": <access to_dict>}`, or 409
  `{"error": "unavailable" | "quota_exceeded" | "not_writable", "detail",
  "prefixes": {...}}`, or 400 `{"error": "invalid_request", "detail"}`.
- `DELETE` → `{"deleted": true}` or 404.

OAuth client for the WebGUI: `woow-cf-tunnel-webgui` (public, device code and
refresh token grants), scopes
`workspace:read security-access:read security-access:tunnel security-access:routes`.

## 3. Shared validation

- PaaS route prefix: `^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$` (3 to 63 characters;
  the hostname is `<prefix>.<route_domain>`).
- Hostname for the Token and Local (custom) modes: the existing
  `frontend/src/utils/hostname.ts` rule.
