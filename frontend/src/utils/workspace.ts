import type { WorkspaceEndpoint, WorkspaceService } from '@/types'

/** The platform name when known, else `chart · release`. */
export function serviceDisplayName(service: WorkspaceService): string {
  return service.display_name || `${service.chart} · ${service.release}`
}

/** The endpoint the platform publishes (falls back to the first one). */
export function primaryEndpoint(service: WorkspaceService): WorkspaceEndpoint | undefined {
  return service.endpoints.find((endpoint) => endpoint.primary) ?? service.endpoints[0]
}

/** Every endpoint except the primary one ("Other ports"). */
export function otherEndpoints(service: WorkspaceService): WorkspaceEndpoint[] {
  const primary = primaryEndpoint(service)
  return service.endpoints.filter((endpoint) => endpoint !== primary)
}

const STATE_LABELS: Record<string, string> = {
  pending: 'Waiting to deploy',
  deploying: 'Deploying',
  initializing: 'Initializing',
  running: 'Running',
  error: 'Error',
  upgrading: 'Upgrading',
  suspended: 'Suspended',
  deleting: 'Deleting',
}

/** English label for a platform service state (unknown states pass through). */
export function serviceStateLabel(state: string): string {
  return STATE_LABELS[state] ?? state
}
