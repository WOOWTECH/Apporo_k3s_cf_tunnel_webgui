/** cloudflared --loglevel values (cloudflared rejects anything else). */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

/** A single ingress route used by the setup wizard / RouteEditor / Config. */
export interface Route {
  hostname: string
  service: string
  disableChunkedEncoding: boolean
}

export type SetupMode = 'local' | 'token'

/** Shape of GET /api/setup/state. */
export interface SetupStateResponse {
  has_cert: boolean
  has_tunnel: boolean
  tunnel_uuid: string | null
  mode: SetupMode
}

/** Response model for GET/PUT /api/config (aligns with backend TunnelConfigRead). */
export interface TunnelConfig {
  mode: SetupMode
  tunnel_name: string
  routes: Route[]
  catch_all_service: string
  post_quantum: boolean
  log_level: LogLevel
  run_parameters: string[]
  no_tls_verify: boolean
  tunnel_token_masked: string
  tunnel_token_set: boolean
  tunnel_token_managed_by_paas: boolean
}

/**
 * Request body for PUT /api/config (aligns with backend TunnelConfigWrite).
 * tunnel_token: undefined/null keeps the stored token, '' removes it, a value replaces it.
 */
export interface TunnelConfigUpdate {
  tunnel_token?: string | null
  mode: SetupMode
  tunnel_name: string
  routes: Route[]
  catch_all_service: string
  post_quantum: boolean
  log_level: LogLevel
  run_parameters: string[]
  no_tls_verify: boolean
}

/** Tunnel status from cloudflared's metrics /ready endpoint. */
export interface TunnelStatus {
  status: 'running' | 'starting' | 'stopped'
  ready_connections: number
  metrics_reachable: boolean
}

/** Response model for POST /api/tunnel/{start,stop,restart}. */
export interface ActionResponse {
  success: boolean
  message: string
}

/** Response model for GET /api/health. */
export interface HealthStatus {
  status: string
  version: string
  process_running: boolean
  stopped_by_operator: boolean
  tunnel: TunnelStatus
  credentials_error: string | null
}

/* ---- Workspace services (PaaS edition, docs/paas-api.md §1) ---- */

/** "http" and "https" open in a browser; "tcp" needs a client such as `cloudflared access`. */
export type EndpointKind = 'http' | 'https' | 'tcp'

/** One port of a Kubernetes Service that runs next to this WebGUI. */
export interface WorkspaceEndpoint {
  /** Kubernetes Service name. */
  service: string
  port: number
  port_name: string | null
  protocol: string
  kind: EndpointKind
  /** What a route's service field should be, e.g. `http://svc-11111111-pi-agent:8080`. */
  url: string
  /** The endpoint the platform itself publishes; exactly one per service. */
  primary: boolean
}

/** One release (`app.kubernetes.io/instance`) in this workspace. */
export interface WorkspaceService {
  release: string
  chart: string
  /** Platform service name; null when no PaaS account is linked or the lookup failed. */
  display_name: string | null
  template_slug: string | null
  /** Platform state (pending, deploying, running, ...) or null. */
  state: string | null
  /** Any ready endpoint behind the primary Service; null when unknown. */
  ready: boolean | null
  /** A valid PaaS route prefix, unique within the list. */
  suggested_prefix: string
  endpoints: WorkspaceEndpoint[]
}

/** Shape of GET /api/workspace. Only `available` and `reason` are guaranteed when available=false. */
export interface WorkspaceInfo {
  available: boolean
  /** Human-readable (zh-TW) when available=false. */
  reason: string | null
  namespace?: string | null
  self_release?: string | null
  workspace?: { id: number; name: string } | null
  services?: WorkspaceService[]
}

/* ---- PaaS link ---- */

export interface PaasConnection {
  access_id: number
  workspace_id: number
  name: string
}

/** Shape of GET /api/paas/bootstrap. */
export interface PaasBootstrap {
  authorized: boolean
  portal_url: string
  connection: PaasConnection | null
  release_pending: boolean
  /** The platform lets this WebGUI add and remove routes. */
  routes_write?: boolean
  /** Route hostname = `<subdomain_prefix>.<route_domain>`. */
  route_domain?: string | null
}

/** One route of a reviewed Security Access. */
export interface PaasReviewRoute {
  /** Platform route id; needed to remove the route. */
  id?: number | null
  subdomain_prefix?: string | null
  hostname: string
  service_url?: string | null
  public: boolean
  protected: boolean
  awaiting_publication: boolean
}

/** Shape of GET /api/paas/accesses/{id}/review (also returned by the route write calls). */
export interface PaasReview {
  ready: boolean
  issues: string[]
  public_routes: string[]
  awaiting_publication: boolean
  access: {
    id: number
    name: string
    state: string
    binding_state: string
    subscription: {
      state: string
      plan_name: string
      ac_max_access_seats?: number | null
      ac_used_access_seats?: number | null
    } | null
    routes: PaasReviewRoute[]
  }
  portal_access_url: string
  portal_routes_url: string
}

/** One item of POST /api/paas/accesses/{id}/routes. */
export interface PaasRouteRequest {
  subdomain_prefix: string
  service_url: string
}

export interface PaasCreatedRoute {
  id: number
  subdomain_prefix: string
  hostname: string
  service_url: string
}

/** 200 body of POST /api/paas/accesses/{id}/routes. */
export interface PaasRoutesCreated {
  created: PaasCreatedRoute[]
  review: PaasReview
}

/** 200 body of DELETE /api/paas/accesses/{id}/routes/{route_id}. */
export interface PaasRouteDeleted {
  deleted: boolean
  review: PaasReview
}

/** Shape of GET /api/paas/routes/check?prefix=. */
export interface PaasPrefixCheck {
  prefix: string
  available: boolean
  reason: string
}

/** A failed route batch, as the picker and the PaaS page show it. */
export interface RouteBatchError {
  status: number
  message: string
  /** Per-prefix reasons from a 409 `{message, errors}` detail. */
  errors: Record<string, string>
}
