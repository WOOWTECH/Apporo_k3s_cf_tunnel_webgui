<template>
  <div class="fixed inset-0 z-50 !m-0 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-6">
    <!-- !m-0: the pages use space-y-*, whose margin would shift this fixed overlay down. -->
    <div
      ref="dialogEl"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      tabindex="-1"
      class="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-2xl bg-white shadow-2xl outline-none sm:rounded-2xl"
      data-test="workspace-picker"
    >
      <header class="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 sm:px-6">
        <div class="min-w-0">
          <h2 :id="titleId" class="text-lg font-semibold text-gray-900">
            {{ isPaas ? '一次開通工作區服務' : '從工作區加入服務' }}
          </h2>
          <p class="mt-1 text-xs leading-5 text-gray-500">
            <template v-if="isPaas">
              勾選要對外開放的服務，每個服務會成為一條公開路由（前綴.{{ routeDomain || '網域' }}），一次最多 {{ MAX_ROUTES_PER_BATCH }} 個。
            </template>
            <template v-else>勾選服務並填好網域，會加到路由清單；仍要儲存或套用設定才會生效。</template>
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-lg px-2 py-1 text-xl leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label="關閉"
          data-test="picker-close"
          @click="close"
        >
          ×
        </button>
      </header>

      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
        <p v-if="loading" class="text-sm text-gray-500">讀取工作區服務中…</p>

        <div
          v-else-if="loadError"
          role="alert"
          class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {{ loadError }}
          <button type="button" class="ml-2 font-semibold underline" @click="load">重試</button>
        </div>

        <p
          v-else-if="info && !info.available"
          class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900"
          data-test="picker-unavailable"
        >
          {{ info.reason || '目前無法讀取這個工作區的服務。' }}
        </p>

        <template v-else-if="info">
          <div
            v-if="serverError"
            role="alert"
            class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            data-test="picker-server-error"
          >
            <p class="font-semibold">{{ serverError.message }}</p>
            <ul v-if="unmatchedServerErrors.length" class="mt-1 list-inside list-disc text-xs">
              <li v-for="[key, reason] in unmatchedServerErrors" :key="key">
                <code>{{ key }}</code>：{{ reason }}
              </li>
            </ul>
          </div>

          <label v-if="!isPaas" class="block text-sm font-medium text-gray-700">
            網域
            <input
              v-model="domain"
              type="text"
              placeholder="example.com"
              autocomplete="off"
              spellcheck="false"
              class="mt-1 block w-full rounded-lg border px-3 py-2 font-mono text-sm shadow-sm focus:outline-none focus:ring-1"
              :class="showDomainError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-cf-orange focus:ring-cf-orange'"
              data-test="picker-domain"
            />
            <span class="mt-1 block text-xs font-normal text-gray-500">
              hostname 會是「名稱.網域」，網域要在 tunnel 所屬的 Cloudflare 帳號裡。
            </span>
            <span v-if="showDomainError" class="mt-1 block text-xs font-normal text-red-600" data-test="picker-domain-error">
              {{ domainError }}
            </span>
          </label>

          <div class="flex flex-wrap items-center justify-between gap-2">
            <label class="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                class="h-4 w-4 rounded border-gray-300 text-cf-orange focus:ring-cf-orange"
                :checked="allSelected"
                :indeterminate="someSelected"
                :disabled="!selectableRows.length"
                data-test="picker-select-all"
                @change="toggleAll"
              />
              全選
            </label>
            <span class="text-xs text-gray-500">
              <template v-if="workspaceLabel">{{ workspaceLabel }} · </template>已選 {{ selectedCount }} / {{ rows.length }}
            </span>
          </div>

          <p v-if="isPaas && limitReached" class="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600" data-test="picker-limit">
            一次最多開通 {{ MAX_ROUTES_PER_BATCH }} 個服務，其餘的請下一批再開通。
          </p>

          <p v-if="!rows.length" class="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600" data-test="picker-empty">
            這個工作區目前沒有其他服務。
          </p>

          <ul v-else class="space-y-3">
            <li
              v-for="entry in entries"
              :key="entry.row.key"
              class="rounded-xl border px-4 py-3"
              :class="entry.row.selected ? 'border-orange-300 bg-orange-50/40' : 'border-gray-200 bg-white'"
              data-test="picker-row"
            >
              <div class="flex items-start gap-3">
                <input
                  v-model="entry.row.selected"
                  type="checkbox"
                  class="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-cf-orange focus:ring-cf-orange disabled:opacity-40"
                  :disabled="!entry.row.selected && (!entry.endpointCount || limitReached)"
                  :aria-label="`選取 ${entry.name}`"
                  data-test="picker-select"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-medium text-gray-900" data-test="picker-service-name">{{ entry.name }}</span>
                    <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="readiness(entry.row.service).tone">
                      {{ readiness(entry.row.service).label }}
                    </span>
                    <span
                      v-if="entry.row.service.state"
                      class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                    >
                      PaaS：{{ serviceStateLabel(entry.row.service.state) }}
                    </span>
                  </div>
                  <p v-if="entry.row.service.display_name" class="mt-0.5 text-xs text-gray-500">
                    {{ entry.row.service.chart }} · {{ entry.row.service.release }}
                  </p>

                  <p v-if="!entry.endpointCount" class="mt-2 text-xs text-gray-500">這個服務沒有可以連線的連接埠。</p>
                  <div v-else class="mt-3 grid gap-3 sm:grid-cols-2">
                    <label class="block text-xs font-medium text-gray-500">
                      連接埠
                      <select
                        v-if="entry.endpointCount > 1"
                        v-model="entry.row.endpointUrl"
                        class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-800"
                        data-test="picker-endpoint"
                      >
                        <option v-if="entry.primary" :value="entry.primary.url">{{ endpointLabel(entry.primary) }}（預設）</option>
                        <optgroup label="其他連接埠">
                          <option v-for="endpoint in entry.others" :key="endpointKey(endpoint)" :value="endpoint.url">
                            {{ endpointLabel(endpoint) }}
                          </option>
                        </optgroup>
                      </select>
                      <code v-else class="mt-1 block truncate rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
                        {{ entry.row.endpointUrl }}
                      </code>
                    </label>
                    <label class="block text-xs font-medium text-gray-500">
                      {{ isPaas ? '子網域前綴' : '名稱' }}
                      <input
                        v-model="entry.row.name"
                        type="text"
                        autocomplete="off"
                        spellcheck="false"
                        class="mt-1 block w-full rounded-lg border px-3 py-2 font-mono text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-1"
                        :class="entry.row.selected && entry.error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-cf-orange focus:ring-cf-orange'"
                        data-test="picker-field"
                      />
                      <span class="mt-1 block truncate font-mono text-[11px] font-normal text-gray-500" data-test="picker-preview">
                        → {{ preview(entry) }}
                      </span>
                    </label>
                  </div>

                  <template v-if="entry.row.selected">
                    <p v-if="entry.error" class="mt-2 text-xs text-red-600" data-test="picker-error">{{ entry.error }}</p>
                    <p v-else-if="entry.verdict?.state === 'rejected'" class="mt-2 text-xs text-red-600" data-test="picker-rejected">
                      上次送出被拒：{{ entry.verdict.reason }}
                    </p>
                    <p v-else-if="entry.verdict?.state === 'available'" class="mt-2 text-xs font-medium text-emerald-700" data-test="picker-available">
                      ✓ 可以使用
                    </p>
                    <p v-else-if="entry.verdict?.state === 'checking'" class="mt-2 text-xs text-gray-500">檢查中…</p>
                    <p v-else-if="entry.verdict?.state === 'unknown'" class="mt-2 text-xs text-amber-700">
                      無法確認是否可用：{{ entry.verdict.reason }}
                    </p>
                  </template>
                  <p
                    v-if="entry.endpoint?.kind === 'tcp'"
                    class="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"
                    data-test="picker-tcp-warning"
                  >
                    這是 TCP 連接埠，不是網頁服務：瀏覽器無法直接開啟，要用 cloudflared access 等用戶端連線。
                  </p>
                  <p
                    v-if="entry.row.service.ready === false"
                    class="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"
                    data-test="picker-not-ready"
                  >
                    服務目前沒有就緒的端點；開通後網址可能先回 502，直到服務啟動完成。
                  </p>
                </div>
              </div>
            </li>
          </ul>
        </template>
      </div>

      <footer class="flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 px-5 py-4 sm:px-6">
        <button
          v-if="ready && isPaas"
          type="button"
          class="mr-auto rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          :disabled="!checkablePrefixes.length || checking || busy"
          data-test="picker-check"
          @click="checkAvailability"
        >
          {{ checking ? '檢查中…' : '檢查可用性' }}
        </button>
        <button
          type="button"
          class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          data-test="picker-cancel"
          @click="close"
        >
          {{ ready ? '取消' : '關閉' }}
        </button>
        <button
          v-if="ready"
          type="button"
          class="rounded-lg bg-cf-orange px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-gray-300"
          :disabled="!canSubmit"
          data-test="picker-submit"
          @click="submit"
        >
          {{ submitLabel }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, useId, watch } from 'vue'
import { checkRoutePrefix, getWorkspace } from '@/api'
import { hostnameError } from '@/utils/hostname'
import { MAX_ROUTES_PER_BATCH, normalizePrefix, routePrefixError } from '@/utils/routePrefix'
import { otherEndpoints, primaryEndpoint, serviceDisplayName, serviceStateLabel } from '@/utils/workspace'
import type {
  PaasRouteRequest,
  Route,
  RouteBatchError,
  WorkspaceEndpoint,
  WorkspaceInfo,
  WorkspaceService,
} from '@/types'

/**
 * Lists the services of this workspace (GET /api/workspace) and turns the
 * chosen ones into routes:
 * - mode "paas": PaaS routes `{subdomain_prefix, service_url}` (hostname = prefix.routeDomain);
 * - mode "hostname": local/token routes `{hostname, service, disableChunkedEncoding}`.
 * The parent decides what happens on submit and closes the dialog.
 */
const props = withDefaults(
  defineProps<{
    mode: 'paas' | 'hostname'
    /** paas mode: hostname = `<prefix>.<routeDomain>` (preview only). */
    routeDomain?: string
    /** Prefixes (paas) or hostnames (hostname) already in use. */
    existing?: string[]
    /** The parent is submitting. */
    busy?: boolean
    /** The parent's last failed submit (paas mode), shown per prefix. */
    serverError?: RouteBatchError | null
  }>(),
  { routeDomain: '', existing: () => [], busy: false, serverError: null }
)

const emit = defineEmits<{
  submit: [items: PaasRouteRequest[] | Route[]]
  close: []
}>()

interface Row {
  key: string
  service: WorkspaceService
  selected: boolean
  endpointUrl: string
  name: string
}

/**
 * A remote answer about a prefix. "unavailable" (from the availability check)
 * blocks the submit; "rejected" (from the last submit) and "unknown" (the
 * check itself failed) are shown but do not.
 */
interface Verdict {
  state: 'checking' | 'available' | 'unavailable' | 'rejected' | 'unknown'
  reason: string
}

interface Entry {
  row: Row
  name: string
  primary: WorkspaceEndpoint | undefined
  others: WorkspaceEndpoint[]
  endpoint: WorkspaceEndpoint | undefined
  endpointCount: number
  /** Normalized prefix (paas) or label (hostname). */
  value: string
  /** What must be unique: the prefix (paas) or the full hostname. */
  target: string
  localError: string | null
  verdict: Verdict | undefined
  /** Blocks the submit when the row is selected. */
  error: string | null
}

const DOMAIN_STORAGE_KEY = 'cf-tunnel-gui.workspace-picker.domain'

function readStoredDomain(): string {
  try {
    return window.localStorage.getItem(DOMAIN_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function storeDomain(value: string): void {
  try {
    window.localStorage.setItem(DOMAIN_STORAGE_KEY, value)
  } catch {
    /* storage blocked (private window, previews): nothing to remember */
  }
}

const titleId = useId()
const dialogEl = ref<HTMLElement | null>(null)
const isPaas = computed(() => props.mode === 'paas')

const info = ref<WorkspaceInfo | null>(null)
const loading = ref(true)
const loadError = ref('')
const rows = ref<Row[]>([])
const verdicts = reactive<Record<string, Verdict>>({})
const checking = ref(false)

const ready = computed(() => !loading.value && !loadError.value && info.value?.available === true)
const limit = computed(() => (isPaas.value ? MAX_ROUTES_PER_BATCH : Number.POSITIVE_INFINITY))

const workspaceLabel = computed(() => {
  const name = info.value?.workspace?.name
  const namespace = info.value?.namespace
  if (name && namespace) return `${name}（${namespace}）`
  return name || namespace || ''
})

/* ---- hostname mode: the domain ---- */

const domain = ref(props.mode === 'hostname' ? readStoredDomain() : '')
const domainValue = computed(() => domain.value.trim().toLowerCase().replace(/^\.+|\.+$/g, ''))
const domainError = computed<string | null>(() => {
  if (isPaas.value) return null
  if (!domainValue.value) return '請輸入網域，例如 example.com'
  return hostnameError(domainValue.value)
})

/* ---- rows ---- */

function toRow(service: WorkspaceService): Row {
  return {
    key: service.release,
    service,
    selected: false,
    endpointUrl: primaryEndpoint(service)?.url ?? '',
    name: service.suggested_prefix ?? '',
  }
}

function labelError(label: string, hostname: string): string | null {
  if (!label) return '請輸入名稱'
  if (domainError.value) return null // the domain field shows its own error
  return hostnameError(hostname)
}

const entries = computed<Entry[]>(() => {
  const existing = new Set(props.existing.map((item) => item.trim().toLowerCase()).filter(Boolean))
  const base = rows.value.map((row) => {
    const value = normalizePrefix(row.name)
    const target = isPaas.value || !value ? value : `${value}.${domainValue.value}`
    return { row, value, target }
  })
  const counts = new Map<string, number>()
  for (const { row, target } of base) {
    if (row.selected && target) counts.set(target, (counts.get(target) ?? 0) + 1)
  }
  return base.map(({ row, value, target }) => {
    const service = row.service
    const endpoint = service.endpoints.find((item) => item.url === row.endpointUrl)
    let localError = isPaas.value ? routePrefixError(value) : labelError(value, target)
    if (!localError && existing.has(target)) {
      localError = isPaas.value ? '這個安全存取服務已有相同前綴的路由' : '路由清單裡已有這個 hostname'
    }
    if (!localError && row.selected && (counts.get(target) ?? 0) > 1) localError = '與其他勾選的服務重複'
    if (!localError && !endpoint) localError = '請選擇連接埠'
    const verdict = isPaas.value && !localError ? verdicts[value] : undefined
    const error = localError ?? (verdict?.state === 'unavailable' ? verdict.reason : null)
    return {
      row,
      name: serviceDisplayName(service),
      primary: primaryEndpoint(service),
      others: otherEndpoints(service),
      endpoint,
      endpointCount: service.endpoints.length,
      value,
      target,
      localError,
      verdict,
      error,
    }
  })
})

const selectedEntries = computed(() => entries.value.filter((entry) => entry.row.selected))
const selectedCount = computed(() => selectedEntries.value.length)
const limitReached = computed(() => selectedCount.value >= limit.value)
const selectableRows = computed(() => rows.value.filter((row) => row.service.endpoints.length > 0))
const allSelected = computed(
  () => selectableRows.value.length > 0 && selectedCount.value >= Math.min(selectableRows.value.length, limit.value)
)
const someSelected = computed(() => selectedCount.value > 0 && !allSelected.value)
const showDomainError = computed(() => !!domainError.value && (!!domain.value.trim() || selectedCount.value > 0))

function toggleAll(event: Event): void {
  if (allSelected.value) {
    for (const row of rows.value) row.selected = false
  } else {
    let count = selectedCount.value
    for (const row of selectableRows.value) {
      if (count >= limit.value) break
      if (!row.selected) {
        row.selected = true
        count += 1
      }
    }
  }
  // Keep the box in step with the state when the click did not change it.
  ;(event.target as HTMLInputElement).checked = allSelected.value
}

/* ---- paas mode: availability ---- */

const checkablePrefixes = computed(() => [
  ...new Set(selectedEntries.value.filter((entry) => !entry.localError).map((entry) => entry.value)),
])

async function checkAvailability(): Promise<void> {
  const prefixes = checkablePrefixes.value
  if (!prefixes.length) return
  checking.value = true
  try {
    await Promise.all(
      prefixes.map(async (prefix) => {
        verdicts[prefix] = { state: 'checking', reason: '' }
        try {
          const result = await checkRoutePrefix(prefix)
          verdicts[prefix] = result.available
            ? { state: 'available', reason: '' }
            : { state: 'unavailable', reason: result.reason || '這個前綴已被使用' }
        } catch (cause) {
          verdicts[prefix] = { state: 'unknown', reason: cause instanceof Error ? cause.message : '暫時無法檢查' }
        }
      })
    )
  } finally {
    checking.value = false
  }
}

watch(
  () => props.serverError,
  (value) => {
    if (!value) return
    for (const [prefix, reason] of Object.entries(value.errors)) {
      verdicts[normalizePrefix(prefix)] = { state: 'rejected', reason }
    }
  },
  { immediate: true }
)

/** Server errors that do not belong to a selected row (shown at the top). */
const unmatchedServerErrors = computed(() => {
  const shown = new Set(selectedEntries.value.map((entry) => entry.value))
  return Object.entries(props.serverError?.errors ?? {}).filter(([prefix]) => !shown.has(normalizePrefix(prefix)))
})

/* ---- submit ---- */

const canSubmit = computed(
  () =>
    ready.value &&
    !props.busy &&
    !checking.value &&
    selectedCount.value > 0 &&
    selectedCount.value <= limit.value &&
    !domainError.value &&
    selectedEntries.value.every((entry) => entry.error === null)
)

const submitLabel = computed(() => {
  if (props.busy) return '處理中…'
  return isPaas.value ? `一次開通 ${selectedCount.value} 個` : `加入 ${selectedCount.value} 條路由`
})

function submit(): void {
  if (!canSubmit.value) return
  if (isPaas.value) {
    const items: PaasRouteRequest[] = selectedEntries.value.map((entry) => ({
      subdomain_prefix: entry.value,
      service_url: entry.row.endpointUrl,
    }))
    emit('submit', items)
    return
  }
  storeDomain(domainValue.value)
  const items: Route[] = selectedEntries.value.map((entry) => ({
    hostname: entry.target,
    service: entry.row.endpointUrl,
    disableChunkedEncoding: false,
  }))
  emit('submit', items)
}

/* ---- display helpers ---- */

function preview(entry: Entry): string {
  if (isPaas.value) return `${entry.value || '前綴'}.${props.routeDomain || '網域'}`
  return `${entry.value || '名稱'}.${domainValue.value || '網域'}`
}

function readiness(service: WorkspaceService): { label: string; tone: string } {
  if (service.ready === true) return { label: '就緒', tone: 'bg-emerald-100 text-emerald-800' }
  if (service.ready === false) return { label: '未就緒', tone: 'bg-amber-100 text-amber-800' }
  return { label: '狀態未知', tone: 'bg-gray-100 text-gray-600' }
}

function endpointLabel(endpoint: WorkspaceEndpoint): string {
  return endpoint.port_name ? `${endpoint.url} · ${endpoint.port_name}` : endpoint.url
}

function endpointKey(endpoint: WorkspaceEndpoint): string {
  return `${endpoint.service}:${endpoint.port}/${endpoint.protocol}`
}

/* ---- lifecycle ---- */

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const data = await getWorkspace()
    info.value = data
    rows.value = data.available ? (data.services ?? []).map(toRow) : []
  } catch (cause) {
    info.value = null
    loadError.value = cause instanceof Error ? cause.message : '無法讀取工作區服務'
  } finally {
    loading.value = false
  }
}

function close(): void {
  emit('close')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  dialogEl.value?.focus()
  void load()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>
