<template>
  <div class="space-y-6 pb-12">
    <section class="overflow-hidden rounded-3xl bg-slate-950 px-6 py-8 text-white shadow-xl sm:px-9">
      <p class="text-xs font-semibold uppercase tracking-[0.25em] text-orange-300">WOOW PaaS · TUNNEL 連線</p>
      <h1 class="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">從訂閱到對外連線，照著做就好</h1>
      <p class="mt-3 max-w-2xl text-sm leading-7 text-slate-300">先在 PaaS 設定對外網址，再選擇是否加上 Cloudflare Access。此頁會逐一檢查路由和綁定條件，通過後才連結這個 WebGUI。</p>
      <div class="mt-6 flex flex-wrap gap-2 text-xs font-medium">
        <span v-for="(step, index) in steps" :key="step" class="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">{{ index + 1 }}　{{ step }}</span>
      </div>
    </section>

    <div v-if="error" role="alert" class="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">{{ error }}</div>
    <div v-if="message" role="status" class="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-800">{{ message }}</div>

    <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-7">
      <div class="flex items-start gap-4">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 font-bold text-cf-orange">1</span>
        <div class="min-w-0 flex-1">
          <h2 class="text-lg font-semibold text-gray-900">到 PaaS 開通訂閱</h2>
          <p class="mt-1 text-sm leading-6 text-gray-600">在 PaaS 選擇工作區與方案，建立安全存取服務。費用與付款都會在 PaaS 確認；這裡不會自動扣款。</p>
          <div class="mt-3 rounded-xl bg-orange-50 px-4 py-3 text-sm leading-6 text-orange-900">
            <p class="font-semibold">一個對外網址可先選 1 組路由；Access 席次是選配。</p>
            <p class="mt-1">不加購 Access 也能綁定 Tunnel，但該網址會直接對網際網路開放。若要先由 Cloudflare 限制允許的 Email，再依人數購買 Access 席次並開啟路由保護。</p>
          </div>
          <a :href="bootstrap?.portal_url || undefined" target="_blank" rel="noopener noreferrer" class="mt-4 inline-flex rounded-lg bg-cf-orange px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600" data-test="portal-link">前往 PaaS 開通 ↗</a>
          <p class="mt-3 text-xs text-gray-500">已經開通了？繼續下方的帳戶授權，就能選擇現有服務。</p>
        </div>
      </div>
    </section>

    <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-7">
      <div class="flex items-start gap-4">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 font-bold text-cf-orange">2</span>
        <div class="min-w-0 flex-1">
          <h2 class="text-lg font-semibold text-gray-900">授權這個 WebGUI</h2>
          <p class="mt-1 text-sm leading-6 text-gray-600">按下按鈕後到 PaaS 輸入短碼並同意授權。這個頁面不會要求你貼 Tunnel token。</p>
          <div v-if="bootstrap?.authorized" class="mt-4 flex flex-wrap items-center gap-3">
            <span class="inline-flex rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800">✓ PaaS 帳戶已連接</span>
            <button v-if="!bootstrap.connection && !bootstrap.release_pending" class="text-xs font-semibold text-gray-600 underline" @click="revokeAuthorization">撤銷帳戶授權</button>
          </div>
          <div v-else class="mt-4 space-y-4">
            <button :disabled="busy" class="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" @click="beginAuthorization">取得授權短碼</button>
            <div v-if="authorization" class="rounded-xl border border-blue-200 bg-blue-50 p-5">
              <p class="text-sm font-medium text-blue-900">在 PaaS 頁面輸入這組短碼</p>
              <p class="mt-2 select-all font-mono text-2xl font-bold tracking-widest text-slate-900">{{ authorization.user_code }}</p>
              <a :href="authorization.verification_url" target="_blank" rel="noopener noreferrer" class="mt-3 inline-block rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">開啟授權頁 ↗</a>
              <p class="mt-3 text-xs text-blue-700">{{ authStatus === 'waiting' ? '等待 PaaS 核准，這裡會自動更新。' : '授權有效時間約 15 分鐘。' }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-7" :class="!bootstrap?.authorized ? 'opacity-70' : ''">
      <div class="flex items-start gap-4">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 font-bold text-cf-orange">3</span>
        <div class="min-w-0 flex-1">
          <h2 class="text-lg font-semibold text-gray-900">選服務，檢查每個網址的存取模式</h2>
          <p class="mt-1 text-sm leading-6 text-gray-600">先在 PaaS 的「應用路由」新增網址<template v-if="routesWrite">，或選好安全存取服務後，在下方「工作區服務一次開通」直接新增</template>。需要 Cloudflare Access 時，再到「存取控制」設定登入方式與允許名單；不需要時，保持該路由的 Access 開關關閉。回到這裡選擇服務。</p>
          <details class="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <summary class="cursor-pointer font-semibold">PaaS 路由的內部網址要填什麼？出現 400 或 502 怎麼辦？</summary>
            <p class="mt-3 leading-6">cloudflared 在這個工作區自己的 Pod 裡執行，<code>localhost</code> 只會指到它自己，連不到其他服務。內部網址請填工作區服務的名稱與埠，例如 <code>http://&lt;服務名稱&gt;:8080</code>；選好安全存取服務後，下方「工作區服務一次開通」會列出每個服務的正確網址。</p>
            <p class="mt-2 leading-6">502 通常是服務名稱或埠不對，或服務還沒啟動；可在 PaaS 的工作區頁確認服務狀態，並到 <router-link to="/logs" class="font-semibold text-cf-orange underline">Logs</router-link> 查看 cloudflared 的錯誤訊息。若服務回 400，檢查它是否拒絕反向代理；例如 Home Assistant 需在 HTTP 設定啟用 Trust X-Forwarded-For，並把叢集的 Pod 網段加入 Trusted proxies。</p>
            <a href="https://www.home-assistant.io/integrations/http/#reverse-proxies" target="_blank" rel="noopener noreferrer" class="mt-2 inline-block font-semibold text-cf-orange underline">Home Assistant 反向代理設定說明 ↗</a>
          </details>
          <template v-if="bootstrap?.authorized">
            <button :disabled="busy" class="mt-4 rounded-lg border border-cf-orange bg-orange-50 px-4 py-2 text-sm font-semibold text-cf-orange hover:bg-orange-100 disabled:opacity-50" @click="refreshServices">我已在 PaaS 完成，重新讀取服務</button>
            <div class="mt-5 grid gap-3 sm:grid-cols-2">
              <label class="text-sm font-medium text-gray-700">工作區
                <select v-model="workspaceId" class="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm" data-test="workspace-select" @change="onWorkspaceChange">
                  <option :value="null">請選擇工作區</option>
                  <option v-for="workspace in workspaces" :key="workspace.id" :value="workspace.id">{{ workspace.name }}{{ workspace.id === thisWorkspace?.id ? '（此工作區）' : '' }}</option>
                </select>
              </label>
              <label class="text-sm font-medium text-gray-700">安全存取服務
                <select v-model="accessId" :disabled="!workspaceId" class="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm disabled:bg-gray-100" data-test="access-select" @change="loadReview">
                  <option :value="null">請選擇服務</option>
                  <option v-for="access in accesses" :key="access.id" :value="access.id">{{ access.name }} · {{ serviceLabel(access.state) }}</option>
                </select>
              </label>
            </div>
            <div v-if="otherWorkspaceSelected" class="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700" data-test="other-workspace-note">
              這個 WebGUI 位於「{{ thisWorkspace?.name }}」工作區；工作區裡的服務只能透過「{{ thisWorkspace?.name }}」的安全存取服務對外開通。
              <button v-if="thisWorkspaceListed" type="button" class="ml-1 font-semibold text-cf-orange underline" @click="selectThisWorkspace">改選「{{ thisWorkspace?.name }}」</button>
            </div>
            <div v-if="workspaceId && !accesses.length" class="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">這個工作區還沒有安全存取服務。<a :href="workspacePortal || undefined" target="_blank" rel="noopener noreferrer" class="font-semibold underline">到 PaaS 建立 ↗</a></div>
            <div v-if="review" class="mt-5 rounded-xl border p-5" :class="review.ready && !review.public_routes.length ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'" data-test="review">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h3 class="font-semibold text-gray-900">{{ review.access.name }} · {{ review.ready ? (review.public_routes.length ? '可以連結（含公開網址）' : '可以連結') : '需要完成設定' }}</h3>
                <button class="text-xs font-semibold text-slate-700 underline" @click="loadReview">重新檢查</button>
              </div>
              <p class="mt-2 text-xs text-gray-600">訂閱：{{ review.access.subscription?.plan_name || '尚未訂閱' }}（{{ subscriptionLabel(review.access.subscription?.state) }}） · 服務：{{ serviceLabel(review.access.state) }} · 綁定：{{ bindingLabel(review.access.binding_state) }}</p>
              <p v-if="review.access.subscription?.ac_max_access_seats != null" class="mt-2 text-xs text-gray-600">Access 席次：已使用 {{ review.access.subscription.ac_used_access_seats ?? '—' }} / {{ review.access.subscription.ac_max_access_seats }} 席。0 席時可用公開路由；受 Access 保護的路由需要席次。</p>
              <div v-for="(route, index) in review.access.routes" :key="route.id ?? `${route.hostname}-${index}`" class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 rounded-lg bg-white px-4 py-3 text-sm text-gray-700" data-test="review-route">
                <span :class="route.public ? 'text-amber-700' : route.protected ? 'text-emerald-700' : route.awaiting_publication ? 'text-amber-700' : 'text-red-700'" class="font-bold">{{ route.awaiting_publication ? '…' : route.public ? '○' : route.protected ? '✓' : '!' }}</span>
                <span class="font-medium">{{ route.hostname }}</span>
                <span class="text-xs text-gray-500">{{ route.public ? (route.awaiting_publication ? '公開路由，等待 PaaS 發布' : '公開路由，未啟用 Access') : route.protected ? 'Access 保護已確認' : route.awaiting_publication ? 'Access 保護已設定，等待發布' : '保護設定未完成' }}</span>
                <span v-if="routesWrite && route.id != null" class="ml-auto flex flex-wrap items-center gap-2">
                  <template v-if="confirmRemoveId === route.id">
                    <span class="text-xs text-red-700">移除後這個網址會停止對外服務，確定嗎？</span>
                    <button type="button" class="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50" :disabled="removingId !== null" data-test="confirm-remove-route" @click="removeRoute(route)">{{ removingId === route.id ? '移除中…' : '確定移除' }}</button>
                    <button type="button" class="text-xs font-semibold text-gray-600 underline disabled:opacity-50" :disabled="removingId !== null" data-test="cancel-remove-route" @click="confirmRemoveId = null">取消</button>
                  </template>
                  <button v-else type="button" class="text-xs font-semibold text-red-700 underline" data-test="remove-route" @click="askRemove(route)">移除</button>
                </span>
              </div>
              <p v-if="routeError" role="alert" class="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{{ routeError }}</p>
              <ul v-if="review.issues.length" class="mt-4 list-inside list-disc space-y-1 text-sm text-amber-900"><li v-for="issue in review.issues" :key="issue">{{ issue }}</li></ul>
              <p v-if="review.public_routes.length" class="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">{{ review.public_routes.join('、') }} 未啟用 Cloudflare Access。連上 Tunnel 後，任何知道網址的人都能到達來源服務；請確認該服務自己的登入已啟用。</p>
              <p v-if="review.awaiting_publication" class="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">PaaS 剛記下新的存取設定，要等這個 WebGUI 的 connector 上線後才會發布。發布前網址只會回 503，不會轉到你的服務；連結後可在下方「刷新連線狀態」看到發布完成。</p>
              <div class="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
                <a :href="review.portal_routes_url" target="_blank" rel="noopener noreferrer" class="text-cf-orange underline">設定應用路由 ↗</a>
                <a :href="review.portal_access_url" target="_blank" rel="noopener noreferrer" class="text-cf-orange underline">選用 Access 保護 ↗</a>
              </div>
            </div>
            <div v-if="review" class="mt-5 rounded-xl border border-gray-200 bg-white p-5" data-test="bulk-section">
              <h3 class="font-semibold text-gray-900">工作區服務一次開通</h3>
              <p v-if="otherWorkspaceSelected" class="mt-2 text-sm leading-6 text-gray-600">要一次開通工作區服務，請改選「{{ thisWorkspace?.name }}」工作區的安全存取服務。</p>
              <template v-else-if="routesWrite">
                <p class="mt-2 text-sm leading-6 text-gray-600">勾選這個工作區裡要對外的服務，一次替「{{ review.access.name }}」新增路由，網址是「前綴.{{ bootstrap?.route_domain || '網域' }}」。新路由是公開的（不啟用 Cloudflare Access），PaaS 會直接推送到 Tunnel，不需要重新啟動；需要保護時，再到 PaaS 的「存取控制」開啟。</p>
                <button type="button" class="mt-3 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50" :disabled="bulkBusy" data-test="open-picker" @click="openPicker">選擇工作區服務</button>
                <div v-if="bulkCreated.length" class="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" data-test="bulk-created">
                  <p class="font-semibold">已新增 {{ bulkCreated.length }} 條路由：</p>
                  <ul class="mt-2 space-y-1">
                    <li v-for="route in bulkCreated" :key="route.id" class="break-all"><span class="font-medium">{{ route.hostname }}</span> → <code class="text-xs">{{ route.service_url }}</code></li>
                  </ul>
                </div>
                <div v-if="bulkError" role="alert" class="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" data-test="bulk-error">
                  <p class="font-semibold">{{ bulkError.message }}</p>
                  <ul v-if="Object.keys(bulkError.errors).length" class="mt-2 list-inside list-disc space-y-1">
                    <li v-for="(reason, prefix) in bulkError.errors" :key="prefix"><code>{{ prefix }}</code>：{{ reason }}</li>
                  </ul>
                  <p v-if="bulkError.status === 409 || bulkError.status === 422" class="mt-2 text-xs">這一批路由都沒有建立。修正後再送出一次。</p>
                </div>
              </template>
              <template v-else>
                <p class="mt-2 text-sm leading-6 text-gray-600">這個 PaaS 還沒開放由這裡新增路由，請到 PaaS 的「應用路由」逐一新增。內部網址填下方各服務的網址（cloudflared 在自己的 Pod 執行，不能填 localhost）。</p>
                <a :href="review.portal_routes_url" target="_blank" rel="noopener noreferrer" class="mt-2 inline-block text-sm font-semibold text-cf-orange underline">到 PaaS 新增應用路由 ↗</a>
                <p v-if="workspaceInfoError" class="mt-3 text-sm text-red-700">{{ workspaceInfoError }}</p>
                <p v-else-if="!workspaceInfo" class="mt-3 text-sm text-gray-500">讀取工作區服務中…</p>
                <p v-else-if="!workspaceInfo.available" class="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">{{ workspaceInfo.reason || '目前無法讀取這個工作區的服務。' }}</p>
                <template v-else>
                  <p v-if="!workspaceServices.length" class="mt-3 text-sm text-gray-500">這個工作區目前沒有其他服務。</p>
                  <ul v-else class="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200" data-test="service-urls">
                    <li v-for="service in workspaceServices" :key="service.release" class="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                      <span class="font-medium text-gray-900">{{ serviceDisplayName(service) }}</span>
                      <code class="select-all break-all rounded bg-gray-50 px-2 py-1 text-xs text-gray-800">{{ primaryEndpoint(service)?.url || '沒有可以連線的連接埠' }}</code>
                    </li>
                  </ul>
                  <div v-if="serviceUrlLines" class="mt-3 flex flex-wrap items-center gap-3">
                    <button type="button" class="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50" data-test="copy-service-urls" @click="copy(serviceUrlLines)">複製清單</button>
                    <span v-if="copyFeedback" class="text-xs text-gray-600">{{ copyFeedback }}</span>
                  </div>
                  <textarea v-if="copyManual" readonly rows="4" class="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs" :value="copyManual" />
                </template>
              </template>
            </div>
          </template>
        </div>
      </div>
    </section>

    <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-7">
      <div class="flex items-start gap-4">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 font-bold text-cf-orange">4</span>
        <div class="min-w-0 flex-1">
          <h2 class="text-lg font-semibold text-gray-900">連結並啟用</h2>
          <p class="mt-1 text-sm leading-6 text-gray-600">按下前系統會再檢查一次所有網址。通過後才取得 Tunnel 憑證，綁定這個 WebGUI 並以 token 模式啟動 cloudflared。</p>
          <button :disabled="!review?.ready || busy" class="mt-4 rounded-lg bg-cf-orange px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-gray-300" @click="connect">{{ busy ? '處理中…' : '連結並啟用' }}</button>
          <p v-if="bootstrap?.connection && !bootstrap.release_pending" class="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">✓ 已連結 {{ bootstrap.connection.name }}。可到 Dashboard 查看 Tunnel 狀態。</p>
          <div v-if="bootstrap?.release_pending" class="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            本機 Tunnel 已停止，但遠端綁定尚未確認解除（PaaS 暫時無法連線）。服務重新啟動時也會自動重試。
            <button class="ml-2 font-semibold underline" @click="finishDisconnect">重新嘗試解除綁定</button>
          </div>
          <div v-if="bootstrap?.connection" class="mt-4 flex flex-wrap items-center gap-3">
            <button class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50" @click="loadStatus(false)">刷新連線狀態</button>
            <button class="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100" @click="checkExternal">測試外部網址</button>
            <button v-if="!bootstrap.release_pending" class="text-xs font-semibold text-red-700 underline" @click="disconnect">停止本機連線並解除綁定</button>
            <button v-else class="text-xs font-semibold text-amber-800 underline" @click="finishDisconnect">檢查並完成遠端解除綁定</button>
          </div>
          <div v-if="connectionStatus?.connected" class="mt-4 grid gap-3 sm:grid-cols-3">
            <div class="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm"><p class="text-xs text-gray-500">訂閱</p><p class="mt-1 font-semibold text-gray-900">{{ subscriptionLabel(connectionStatus.subscription?.state) }}</p></div>
            <div class="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm"><p class="text-xs text-gray-500">網址存取模式</p><p class="mt-1 font-semibold" :class="!connectionStatus.service_ready ? 'text-red-700' : connectionStatus.public_routes.length || connectionStatus.awaiting_publication ? 'text-amber-700' : 'text-emerald-700'">{{ !connectionStatus.service_ready ? '需要修復' : connectionStatus.public_routes.length ? `含 ${connectionStatus.public_routes.length} 條公開網址（無 Access）` : connectionStatus.awaiting_publication ? '等待 PaaS 發布（網址暫回 503）' : 'Access 保護已確認' }}</p></div>
            <div class="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm"><p class="text-xs text-gray-500">Tunnel</p><p class="mt-1 font-semibold text-gray-900">{{ tunnelLabel(connectionStatus.tunnel_status) }}</p></div>
            <p class="sm:col-span-3 text-xs text-gray-500">檢查時間：{{ new Date(connectionStatus.checked_at * 1000).toLocaleString() }}。{{ connectionStatus.external.length ? '匿名外部探測只確認回應，不代表指定使用者登入成功。' : '外部網址尚未獨立測試；Tunnel 在線不等於公開網址可用。' }}</p>
            <div v-for="result in connectionStatus.external" :key="result.hostname" class="rounded-xl border border-gray-200 bg-white p-4 text-sm" data-test="external-result">
              <p class="font-medium text-gray-900">{{ result.hostname }}</p>
              <p class="mt-1 text-xs" :class="externalClass(result)">{{ externalLabel(result) }}</p>
            </div>
            <ul v-if="connectionStatus.issues.length" class="sm:col-span-3 list-inside list-disc text-sm text-red-700"><li v-for="issue in connectionStatus.issues" :key="issue">{{ issue }}</li></ul>
          </div>
          <p class="mt-3 text-xs text-gray-500">Tunnel 連線成功只代表通道在線；公開網址與登入保護的外部驗證仍需個別確認。</p>
        </div>
      </div>
    </section>
    <section class="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-700">
      <h2 class="font-semibold text-slate-900">刪除路由或取消訂閱時</h2>
      <p class="mt-2 leading-6">此頁解除綁定只會停止這個 WebGUI 的 Tunnel 並釋放 PaaS 的裝置綁定。請回 PaaS 的應用路由或服務頁完成 DNS、Access 與訂閱清理；本頁不會把「已解除綁定」誤當成「公開網址已刪除」。</p>
      <a :href="review?.portal_routes_url || workspacePortal || undefined" target="_blank" rel="noopener noreferrer" class="mt-3 inline-block font-semibold text-cf-orange underline">前往 PaaS 管理路由 ↗</a>
    </section>
    <p class="text-center text-xs text-gray-500">自行管理 Cloudflare？<router-link to="/setup" class="font-semibold text-cf-orange underline">前往 Local 模式設定</router-link></p>

    <WorkspaceServicePicker
      v-if="pickerOpen"
      mode="paas"
      :route-domain="bootstrap?.route_domain || ''"
      :existing="existingPrefixes"
      :busy="bulkBusy"
      :server-error="bulkError"
      @submit="onBulkSubmit"
      @close="pickerOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { api, ApiError, createAccessRoutes, deleteAccessRoute, getWorkspace } from '@/api'
import WorkspaceServicePicker from '@/components/WorkspaceServicePicker.vue'
import { useCopy } from '@/composables/useCopy'
import { primaryEndpoint, serviceDisplayName } from '@/utils/workspace'
import type {
  PaasBootstrap,
  PaasCreatedRoute,
  PaasReview,
  PaasReviewRoute,
  PaasRouteRequest,
  Route,
  RouteBatchError,
  WorkspaceInfo,
} from '@/types'

interface Workspace { id: number; name: string; portal_url: string }
interface Access { id: number; name: string; state: string }
interface Authorization { user_code: string; verification_url: string; interval: number }
interface ExternalResult { hostname: string; status: string; http_status?: number }
interface ConnectionStatus { connected: boolean; subscription: { state: string } | null; access_ready: boolean; service_ready: boolean; public_routes: string[]; awaiting_publication: boolean; issues: string[]; tunnel_status: string; checked_at: number; external: ExternalResult[] }

const steps = ['開通訂閱', '授權帳戶', '檢查網址', '連結啟用']
const bootstrap = ref<PaasBootstrap | null>(null)
const authorization = ref<Authorization | null>(null)
const authStatus = ref('')
const workspaces = ref<Workspace[]>([])
const accesses = ref<Access[]>([])
const workspaceId = ref<number | null>(null)
const accessId = ref<number | null>(null)
const review = ref<PaasReview | null>(null)
const connectionStatus = ref<ConnectionStatus | null>(null)
const busy = ref(false)
const error = ref('')
const message = ref('')
let authTimer: ReturnType<typeof setTimeout> | undefined
const workspacePortal = computed(() => workspaces.value.find((item) => item.id === workspaceId.value)?.portal_url || bootstrap.value?.portal_url || '')

// Workspace services and the route write API (PaaS edition).
const workspaceInfo = ref<WorkspaceInfo | null>(null)
const workspaceInfoError = ref('')
const pickerOpen = ref(false)
const bulkBusy = ref(false)
const bulkError = ref<RouteBatchError | null>(null)
const bulkCreated = ref<PaasCreatedRoute[]>([])
const confirmRemoveId = ref<number | null>(null)
const removingId = ref<number | null>(null)
const routeError = ref('')
const { copy, feedback: copyFeedback, manualText: copyManual } = useCopy()

const routesWrite = computed(() => bootstrap.value?.routes_write === true)
/** The workspace this WebGUI runs in, when the platform knows it. */
const thisWorkspace = computed(() => workspaceInfo.value?.workspace ?? null)
const thisWorkspaceListed = computed(() => workspaces.value.some((item) => item.id === thisWorkspace.value?.id))
const otherWorkspaceSelected = computed(() => !!thisWorkspace.value && workspaceId.value !== null && workspaceId.value !== thisWorkspace.value.id)
const workspaceServices = computed(() => workspaceInfo.value?.services ?? [])
const serviceUrlLines = computed(() => workspaceServices.value
  .flatMap((service) => {
    const url = primaryEndpoint(service)?.url
    return url ? [`${serviceDisplayName(service)} → ${url}`] : []
  })
  .join('\n'))
/** Prefixes the reviewed access already uses (older reviews only carry the hostname). */
const existingPrefixes = computed(() => {
  const domain = bootstrap.value?.route_domain
  return (review.value?.access.routes ?? []).flatMap((route) => {
    if (route.subdomain_prefix) return [route.subdomain_prefix]
    if (domain && route.hostname?.endsWith(`.${domain}`)) return [route.hostname.slice(0, -(domain.length + 1))]
    return []
  })
})

function label(value: string | undefined, names: Record<string, string>): string {
  return value ? (names[value] || `待確認（${value}）`) : '無法確認'
}

function serviceLabel(value: string): string {
  return label(value, { pending: '待建立', provisioning: '建立中', active: '已啟用', active_no_route: '已啟用，尚無網址', error: '設定錯誤', suspended: '已停權', deleting: '刪除中' })
}

function subscriptionLabel(value?: string): string {
  return label(value, { in_progress: '有效', draft: '待開通', paused: '已暫停', closed: '已結束', cancel: '已取消' })
}

function bindingLabel(value: string): string {
  return label(value, { unbound: '尚未綁定', claimed: '已綁定一台裝置', legacy: '舊版綁定，需檢查' })
}

function tunnelLabel(value: string): string {
  return label(value, { running: '在線', starting: '啟動中', stopped: '未運行' })
}

async function loadBootstrap() {
  bootstrap.value = await api<PaasBootstrap>('/api/paas/bootstrap')
  if (bootstrap.value.authorized) {
    await Promise.all([loadWorkspaces(), loadWorkspaceInfo()])
    if (bootstrap.value.connection) {
      workspaceId.value = bootstrap.value.connection.workspace_id
      await onWorkspaceChange()
      accessId.value = bootstrap.value.connection.access_id
      await loadReview()
      await loadStatus()
    } else if (workspaceId.value === null && thisWorkspaceListed.value && thisWorkspace.value) {
      // Preselect the workspace this WebGUI runs in; the user can still pick another.
      workspaceId.value = thisWorkspace.value.id
      await onWorkspaceChange()
    }
  }
}

async function loadWorkspaces() {
  workspaces.value = (await api<{ workspaces: Workspace[] }>('/api/paas/workspaces')).workspaces
}

/** The services next to this WebGUI. A failure here must not block the PaaS flow. */
async function loadWorkspaceInfo() {
  try {
    workspaceInfo.value = await getWorkspace()
    workspaceInfoError.value = ''
  } catch (cause) {
    workspaceInfo.value = null
    workspaceInfoError.value = `無法讀取工作區服務：${cause instanceof Error ? cause.message : '請稍後重試'}`
  }
}

async function refreshServices() {
  busy.value = true
  error.value = ''
  try {
    const previousWorkspace = workspaceId.value
    const previousAccess = accessId.value
    await Promise.all([loadWorkspaces(), loadWorkspaceInfo()])
    if (workspaces.value.some((item) => item.id === previousWorkspace)) workspaceId.value = previousWorkspace
    else workspaceId.value = thisWorkspaceListed.value && thisWorkspace.value ? thisWorkspace.value.id : null
    await onWorkspaceChange()
    if (accesses.value.some((item) => item.id === previousAccess)) {
      accessId.value = previousAccess
      await loadReview()
    }
    if (!error.value) message.value = '服務列表已更新。請選擇服務，確認網址存取模式後再連結。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '暫時無法更新服務列表'
  } finally {
    busy.value = false
  }
}

async function onWorkspaceChange() {
  review.value = null
  accessId.value = null
  accesses.value = []
  if (workspaceId.value !== null) {
    accesses.value = (await api<{ accesses: Access[] }>(`/api/paas/workspaces/${workspaceId.value}/accesses`)).accesses
  }
}

async function selectThisWorkspace() {
  if (!thisWorkspace.value) return
  workspaceId.value = thisWorkspace.value.id
  try {
    await onWorkspaceChange()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '無法讀取安全存取服務'
  }
}

async function loadReview() {
  review.value = null
  bulkCreated.value = []
  bulkError.value = null
  confirmRemoveId.value = null
  routeError.value = ''
  if (accessId.value === null) return
  try {
    review.value = await api<PaasReview>(`/api/paas/accesses/${accessId.value}/review`)
    error.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '無法檢查服務'
  }
}

function openPicker() {
  bulkError.value = null
  bulkCreated.value = []
  pickerOpen.value = true
}

async function onBulkSubmit(items: PaasRouteRequest[] | Route[]) {
  if (accessId.value === null) return
  const routes = items as PaasRouteRequest[] // the picker runs in paas mode on this page
  bulkBusy.value = true
  bulkError.value = null
  try {
    const result = await createAccessRoutes(accessId.value, routes)
    review.value = result.review
    bulkCreated.value = result.created
    pickerOpen.value = false
    await refreshStatusIfConnected()
  } catch (cause) {
    bulkError.value = {
      status: cause instanceof ApiError ? cause.status : 0,
      message: cause instanceof Error ? cause.message : '開通失敗，請稍後重試',
      errors: cause instanceof ApiError ? cause.errors : {},
    }
  } finally {
    bulkBusy.value = false
  }
}

function askRemove(route: PaasReviewRoute) {
  routeError.value = ''
  confirmRemoveId.value = route.id ?? null
}

async function removeRoute(route: PaasReviewRoute) {
  if (accessId.value === null || route.id == null) return
  removingId.value = route.id
  routeError.value = ''
  try {
    const result = await deleteAccessRoute(accessId.value, route.id)
    review.value = result.review
    confirmRemoveId.value = null
    message.value = `已移除 ${route.hostname}。`
    await refreshStatusIfConnected()
  } catch (cause) {
    routeError.value = `無法移除 ${route.hostname}：${cause instanceof Error ? cause.message : '請稍後重試'}`
  } finally {
    removingId.value = null
  }
}

/** Routes changed: the connection summary below is stale if this access is the connected one. */
async function refreshStatusIfConnected() {
  if (bootstrap.value?.connection && bootstrap.value.connection.access_id === accessId.value) await loadStatus()
}

async function beginAuthorization() {
  busy.value = true
  error.value = ''
  if (authTimer) clearTimeout(authTimer)
  try {
    authorization.value = await api<Authorization>('/api/paas/authorization', { method: 'POST' })
    authStatus.value = 'waiting'
    authTimer = setTimeout(pollAuthorization, authorization.value.interval * 1000)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '無法開始授權'
  } finally {
    busy.value = false
  }
}

async function pollAuthorization() {
  try {
    const result = await api<{ status: string; interval?: number }>('/api/paas/authorization/status')
    authStatus.value = result.status
    if (result.status === 'authorized') {
      authorization.value = null
      await loadBootstrap()
      message.value = 'PaaS 帳戶已授權。現在選擇工作區與安全存取服務。'
      return
    }
    if (result.status === 'waiting') {
      authTimer = setTimeout(pollAuthorization, (result.interval || authorization.value?.interval || 5) * 1000)
      return
    }
    error.value = result.status === 'denied' ? '授權被拒絕。請重新取得短碼。' : '授權已逾時。請重新取得短碼。'
    authorization.value = null
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '授權狀態暫時無法確認'
    authTimer = setTimeout(pollAuthorization, 10000)
  }
}

async function connect() {
  if (accessId.value === null || !review.value?.ready) return
  if (review.value.public_routes.length && !window.confirm(
    `以下網址沒有 Cloudflare Access，連結後可由網際網路直接到達來源服務：\n${review.value.public_routes.join('\n')}\n\n確定啟用公開路由嗎？`
  )) return
  busy.value = true
  error.value = ''
  try {
    await api(`/api/paas/accesses/${accessId.value}/connect`, {
      method: 'POST', body: JSON.stringify({ allow_public_routes: review.value.public_routes.length > 0 }),
    })
    message.value = '已連結，cloudflared 已以 token 模式啟動。'
    await loadBootstrap()
    await loadStatus()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '連結失敗'
    await loadReview()
  } finally {
    busy.value = false
  }
}

async function loadStatus(probe = false) {
  try {
    connectionStatus.value = await api<ConnectionStatus>(`/api/paas/connection/status${probe ? '?probe=true' : ''}`)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '無法讀取連線狀態'
  }
}

async function checkExternal() {
  message.value = '正在從這個 WebGUI 檢查公開網址…'
  await loadStatus(true)
  message.value = ''
}

function externalClass(result: ExternalResult): string {
  const isPublic = connectionStatus.value?.public_routes.includes(result.hostname)
  if (isPublic) return 'text-amber-700'
  return result.status === 'login_required' ? 'text-emerald-700' : result.status === 'public_response' ? 'text-red-700' : 'text-amber-700'
}

function externalLabel(result: ExternalResult): string {
  const isPublic = connectionStatus.value?.public_routes.includes(result.hostname)
  if (isPublic && result.status === 'public_response') return '匿名可直接到達服務；請再確認來源服務自己的登入'
  if (isPublic && result.status === 'login_required') return '外部出現 Access 登入，與 PaaS 的公開設定不同；請檢查 Cloudflare 狀態'
  const labels: Record<string, string> = {
    login_required: '匿名訪問進入 Cloudflare Access 登入流程',
    public_response: '匿名訪問直接得到 200；請立即檢查 Access 保護',
    blocked_or_protected: 'HTTP 403：可能被 Access 或其他規則封鎖，無法單獨判定',
    origin_error: '來源服務或 Tunnel 回傳錯誤',
    blocked_private_address: '網址解析到私有/保留位址，已取消探測',
    unreachable: 'DNS、TLS 或網路連線失敗',
    undetermined: '回應無法判定，請到 PaaS 與瀏覽器再驗證',
  }
  return labels[result.status] || '無法判定'
}

async function disconnect() {
  if (!window.confirm('將停止這個 WebGUI 的 PaaS Tunnel、清除本機路由，接著解除遠端綁定。\n經由這條 Tunnel 開出去的網址會立即中斷。要繼續嗎？')) return
  error.value = ''
  try {
    const result = await api<{ stopped: boolean; release_pending: boolean }>('/api/paas/disconnect', { method: 'POST' })
    message.value = result.release_pending
      ? '本機 Tunnel 已停止，但遠端綁定尚未解除；請稍後按「重新嘗試解除綁定」。'
      : '本機連線與遠端綁定均已解除。'
    connectionStatus.value = null
    await loadBootstrap()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '無法停止連線'
  }
}

async function finishDisconnect() {
  error.value = ''
  try {
    await api('/api/paas/disconnect/finish', { method: 'POST' })
    message.value = '本機連線與遠端綁定均已解除。'
    connectionStatus.value = null
    await loadBootstrap()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '遠端解除綁定尚未完成；請稍後重試或到 PaaS 處理'
  }
}

async function revokeAuthorization() {
  error.value = ''
  try {
    await api('/api/paas/authorization/revoke', { method: 'POST' })
    workspaces.value = []
    accesses.value = []
    review.value = null
    workspaceId.value = null
    accessId.value = null
    await loadBootstrap()
    message.value = 'PaaS 帳戶授權已撤銷。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '撤銷授權失敗'
  }
}

onMounted(() => { loadBootstrap().catch((cause) => { error.value = cause instanceof Error ? cause.message : '無法讀取 PaaS 狀態' }) })
onUnmounted(() => { if (authTimer) clearTimeout(authTimer) })
</script>
