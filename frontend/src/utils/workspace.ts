import type { WorkspaceEndpoint, WorkspaceService } from '@/types'

/** The platform name when known, else `chart · release`. */
export function serviceDisplayName(service: WorkspaceService): string {
  return service.display_name || `${service.chart} · ${service.release}`
}

/** The endpoint the platform publishes (falls back to the first one). */
export function primaryEndpoint(service: WorkspaceService): WorkspaceEndpoint | undefined {
  return service.endpoints.find((endpoint) => endpoint.primary) ?? service.endpoints[0]
}

/** Every endpoint except the primary one ("其他連接埠"). */
export function otherEndpoints(service: WorkspaceService): WorkspaceEndpoint[] {
  const primary = primaryEndpoint(service)
  return service.endpoints.filter((endpoint) => endpoint !== primary)
}

const STATE_LABELS: Record<string, string> = {
  pending: '等待部署',
  deploying: '部署中',
  initializing: '初始化中',
  running: '運行中',
  error: '錯誤',
  upgrading: '升級中',
  suspended: '已暫停',
  deleting: '刪除中',
}

/** zh-TW label for a platform service state (unknown states pass through). */
export function serviceStateLabel(state: string): string {
  return STATE_LABELS[state] ?? state
}
