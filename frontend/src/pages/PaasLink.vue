<template>
  <div class="space-y-6 pb-12">
    <section class="overflow-hidden rounded-3xl bg-ink px-6 py-8 text-white shadow-xl sm:px-9">
      <p class="text-xs font-semibold uppercase tracking-[0.25em] text-brand-300">Apporo · Security Access</p>
      <h1 class="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Link this WebGUI to Apporo Security Access</h1>
      <p class="mt-3 max-w-2xl text-sm leading-7 text-stone-300">Sign in at www.apporo.ai with a device code, pick your workspace and Security Access service, review the routes, then connect. This page checks every route and binding condition and links this WebGUI only when they all pass.</p>
      <div class="mt-6 flex flex-wrap gap-2 text-xs font-medium">
        <span v-for="(step, index) in steps" :key="step" class="rounded-full border border-white/20 bg-white/10 px-3 py-1.5"><span class="mr-1.5 font-semibold text-brand-300">{{ index + 1 }}</span>{{ step }}</span>
      </div>
    </section>

    <div v-if="error" role="alert" class="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">{{ error }}</div>
    <div v-if="message" role="status" class="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-800">{{ message }}</div>

    <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-7">
      <div class="flex items-start gap-4">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 font-bold text-brand-700">1</span>
        <div class="min-w-0 flex-1">
          <h2 class="text-lg font-semibold text-ink">Subscribe on Apporo</h2>
          <p class="mt-1 text-sm leading-6 text-gray-600">On www.apporo.ai, choose a workspace and a plan, then create a Security Access service. Prices and payment are confirmed on Apporo; nothing is charged from this page.</p>
          <div class="mt-3 rounded-xl bg-brand-100 px-4 py-3 text-sm leading-6 text-brand-900">
            <p class="font-semibold">One public hostname needs one route. Access seats are optional.</p>
            <p class="mt-1">You can bind the tunnel without Access seats, but the hostname is then open to the whole internet. To have Cloudflare let in only the email addresses you allow, buy Access seats for the number of people and turn on protection for the route.</p>
          </div>
          <a :href="bootstrap?.portal_url || undefined" target="_blank" rel="noopener noreferrer" class="mt-4 inline-flex rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700" data-test="portal-link">Subscribe on Apporo ↗</a>
          <p class="mt-3 text-xs text-gray-500">Already subscribed? Sign in below to choose your existing service.</p>
        </div>
      </div>
    </section>

    <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-7">
      <div class="flex items-start gap-4">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 font-bold text-brand-700">2</span>
        <div class="min-w-0 flex-1">
          <h2 class="text-lg font-semibold text-ink">Authorize this WebGUI</h2>
          <p class="mt-1 text-sm leading-6 text-gray-600">Get a device code, enter it on www.apporo.ai and allow the connection. This page never asks you to paste a tunnel token.</p>
          <div v-if="bootstrap?.authorized" class="mt-4 flex flex-wrap items-center gap-3">
            <span class="inline-flex rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800">✓ Apporo account connected</span>
            <button v-if="!bootstrap.connection && !bootstrap.release_pending" class="text-xs font-semibold text-gray-600 underline" @click="revokeAuthorization">Revoke account authorization</button>
          </div>
          <div v-else class="mt-4 space-y-4">
            <button :disabled="busy" class="rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" @click="beginAuthorization">Get device code</button>
            <div v-if="authorization" class="rounded-xl border border-blue-200 bg-blue-50 p-5">
              <p class="text-sm font-medium text-blue-900">Enter this code on the Apporo device page, then select Allow</p>
              <p class="mt-2 select-all font-mono text-2xl font-bold tracking-widest text-ink">{{ authorization.user_code }}</p>
              <a :href="authorization.verification_url" target="_blank" rel="noopener noreferrer" class="mt-3 inline-block rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Open the device page ↗</a>
              <p class="mt-3 text-xs text-blue-700">{{ authStatus === 'waiting' ? 'Waiting for you to allow the connection on Apporo. This page updates automatically.' : 'The code is valid for about 15 minutes.' }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-7" :class="!bootstrap?.authorized ? 'opacity-70' : ''">
      <div class="flex items-start gap-4">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 font-bold text-brand-700">3</span>
        <div class="min-w-0 flex-1">
          <h2 class="text-lg font-semibold text-ink">Choose a service and review each hostname's access mode</h2>
          <p class="mt-1 text-sm leading-6 text-gray-600">First add your hostnames on the Application tab of the Security Access service on Apporo<template v-if="routesWrite">, or choose the Security Access service below and add them directly under “Publish workspace services”</template>. If a hostname needs Cloudflare Access, set its login method and allow list on the Access tab; otherwise leave Access off for that route. Then come back here and choose the service.</p>
          <details class="mt-3 rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-700">
            <summary class="cursor-pointer font-semibold">Which service URL should an Apporo route use? What if it returns 400 or 502?</summary>
            <p class="mt-3 leading-6">cloudflared runs in its own pod in this workspace, so <code>localhost</code> only reaches cloudflared itself, never your other services. Use the workspace service's name and port as the service URL, for example <code>http://&lt;service-name&gt;:8080</code>. Once you choose a Security Access service, “Publish workspace services” below lists the right URL for each service.</p>
            <p class="mt-2 leading-6">A 502 usually means a wrong service name or port, or a service that has not started yet. Check the service's status on the workspace page in the Apporo portal, and see cloudflared's errors on the <router-link to="/logs" class="font-semibold text-brand underline">Logs</router-link> page. If the service answers 400, check whether it rejects reverse proxies: Home Assistant, for example, needs <code>use_x_forwarded_for</code> turned on in its <code>http</code> settings, with the cluster's pod network in <code>trusted_proxies</code>.</p>
            <a href="https://www.home-assistant.io/integrations/http/#reverse-proxies" target="_blank" rel="noopener noreferrer" class="mt-2 inline-block font-semibold text-brand underline">Home Assistant reverse proxy settings ↗</a>
          </details>
          <template v-if="bootstrap?.authorized">
            <button :disabled="busy" class="mt-4 rounded-lg border border-brand bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50" @click="refreshServices">I've finished on Apporo, reload services</button>
            <div class="mt-5 grid gap-3 sm:grid-cols-2">
              <label class="text-sm font-medium text-gray-700">Workspace
                <select v-model="workspaceId" class="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm" data-test="workspace-select" @change="onWorkspaceChange">
                  <option :value="null">Choose a workspace</option>
                  <option v-for="workspace in workspaces" :key="workspace.id" :value="workspace.id">{{ workspace.name }}{{ workspace.id === thisWorkspace?.id ? ' (this workspace)' : '' }}</option>
                </select>
              </label>
              <label class="text-sm font-medium text-gray-700">Security Access service
                <select v-model="accessId" :disabled="!workspaceId" class="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm disabled:bg-gray-100" data-test="access-select" @change="loadReview">
                  <option :value="null">Choose a service</option>
                  <option v-for="access in accesses" :key="access.id" :value="access.id">{{ access.name }} · {{ serviceLabel(access.state) }}</option>
                </select>
              </label>
            </div>
            <div v-if="otherWorkspaceSelected" class="mt-4 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-700" data-test="other-workspace-note">
              This WebGUI runs in the “{{ thisWorkspace?.name }}” workspace, and its services can only be published through a Security Access service of “{{ thisWorkspace?.name }}”.
              <button v-if="thisWorkspaceListed" type="button" class="ml-1 font-semibold text-brand underline" @click="selectThisWorkspace">Switch to “{{ thisWorkspace?.name }}”</button>
            </div>
            <div v-if="workspaceId && accessesLoading" class="mt-4 rounded-lg bg-stone-50 px-4 py-3 text-sm text-stone-600" data-test="accesses-loading">Loading this workspace's Security Access services…</div>
            <div v-else-if="workspaceId && !accesses.length" class="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">This workspace has no Security Access service yet. <a :href="workspacePortal || undefined" target="_blank" rel="noopener noreferrer" class="font-semibold underline">Create one on Apporo ↗</a></div>
            <div v-if="review" class="mt-5 rounded-xl border p-5" :class="review.ready && !review.public_routes.length ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'" data-test="review">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h3 class="font-semibold text-ink">{{ review.access.name }} · {{ review.ready ? (review.public_routes.length ? 'Ready to connect (includes public hostnames)' : 'Ready to connect') : 'Setup needed' }}</h3>
                <button class="text-xs font-semibold text-stone-700 underline" @click="loadReview">Check again</button>
              </div>
              <p class="mt-2 text-xs text-gray-600">Subscription: {{ review.access.subscription?.plan_name || 'Not subscribed' }} ({{ subscriptionLabel(review.access.subscription?.state) }}) · Service: {{ serviceLabel(review.access.state) }} · Binding: {{ bindingLabel(review.access.binding_state) }}</p>
              <p v-if="review.access.subscription?.ac_max_access_seats != null" class="mt-2 text-xs text-gray-600">Access seats: {{ review.access.subscription.ac_used_access_seats ?? '—' }} of {{ review.access.subscription.ac_max_access_seats }} in use. Public routes work with 0 seats; routes protected by Access need seats.</p>
              <div v-for="(route, index) in review.access.routes" :key="route.id ?? `${route.hostname}-${index}`" class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 rounded-lg bg-white px-4 py-3 text-sm text-gray-700" data-test="review-route">
                <span :class="route.public ? 'text-amber-700' : route.protected ? 'text-emerald-700' : route.awaiting_publication ? 'text-amber-700' : 'text-red-700'" class="font-bold">{{ route.awaiting_publication ? '…' : route.public ? '○' : route.protected ? '✓' : '!' }}</span>
                <span class="font-medium">{{ route.hostname }}</span>
                <span class="text-xs text-gray-500">{{ route.public ? (route.awaiting_publication ? 'Public route, waiting for Apporo to publish it' : 'Public route, Access not enabled') : route.protected ? 'Access protection confirmed' : route.awaiting_publication ? 'Access protection set up, waiting to be published' : 'Protection not finished' }}</span>
                <span v-if="routesWrite && route.id != null" class="ml-auto flex flex-wrap items-center gap-2">
                  <template v-if="confirmRemoveId === route.id">
                    <span class="text-xs text-red-700">The hostname stops working once the route is removed. Remove it?</span>
                    <button type="button" class="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50" :disabled="removingId !== null" data-test="confirm-remove-route" @click="removeRoute(route)">{{ removingId === route.id ? 'Removing…' : 'Remove route' }}</button>
                    <button type="button" class="text-xs font-semibold text-gray-600 underline disabled:opacity-50" :disabled="removingId !== null" data-test="cancel-remove-route" @click="confirmRemoveId = null">Cancel</button>
                  </template>
                  <button v-else type="button" class="text-xs font-semibold text-red-700 underline" data-test="remove-route" @click="askRemove(route)">Remove</button>
                </span>
              </div>
              <p v-if="routeError" role="alert" class="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{{ routeError }}</p>
              <ul v-if="review.issues.length" class="mt-4 list-inside list-disc space-y-1 text-sm text-amber-900"><li v-for="issue in review.issues" :key="issue">{{ issue }}</li></ul>
              <p v-if="review.public_routes.length" class="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">Not protected by Cloudflare Access: {{ review.public_routes.join(', ') }}. Once the tunnel is connected, anyone who knows the URL can reach the origin service, so make sure the service's own login is turned on.</p>
              <p v-if="review.awaiting_publication" class="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">Apporo has just saved the new access settings and publishes them once this WebGUI's connector is online. Until then the URL only answers 503 and never reaches your service. After you connect, use “Refresh connection status” below to see when publishing is done.</p>
              <div class="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
                <a :href="review.portal_routes_url" target="_blank" rel="noopener noreferrer" class="text-brand underline">Set up routes ↗</a>
                <a :href="review.portal_access_url" target="_blank" rel="noopener noreferrer" class="text-brand underline">Access protection (optional) ↗</a>
              </div>
            </div>
            <div v-if="review" class="mt-5 rounded-xl border border-gray-200 bg-white p-5" data-test="bulk-section">
              <h3 class="font-semibold text-ink">Publish workspace services</h3>
              <p v-if="otherWorkspaceSelected" class="mt-2 text-sm leading-6 text-gray-600">To publish workspace services, choose a Security Access service of the “{{ thisWorkspace?.name }}” workspace instead.</p>
              <template v-else-if="routesWrite">
                <p class="mt-2 text-sm leading-6 text-gray-600">Select the services of this workspace to make public, and they are added to “{{ review.access.name }}” as routes in one step, each at &lt;prefix&gt;.{{ bootstrap?.route_domain || 'your-domain' }}. New routes are public (no Cloudflare Access). Apporo pushes them to the tunnel directly, with no restart; to protect one, turn on Access for it on the Access tab in the Apporo portal.</p>
                <button type="button" class="mt-3 rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50" :disabled="bulkBusy" data-test="open-picker" @click="openPicker">Choose workspace services</button>
                <div v-if="bulkCreated.length" class="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" data-test="bulk-created">
                  <p class="font-semibold">Added {{ plural(bulkCreated.length, 'route') }}:</p>
                  <ul class="mt-2 space-y-1">
                    <li v-for="route in bulkCreated" :key="route.id" class="break-all"><span class="font-medium">{{ route.hostname }}</span> → <code class="text-xs">{{ route.service_url }}</code></li>
                  </ul>
                </div>
                <div v-if="bulkError" role="alert" class="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" data-test="bulk-error">
                  <p class="font-semibold">{{ bulkError.message }}</p>
                  <ul v-if="Object.keys(bulkError.errors).length" class="mt-2 list-inside list-disc space-y-1">
                    <li v-for="(reason, prefix) in bulkError.errors" :key="prefix"><code>{{ prefix }}</code>: {{ reason }}</li>
                  </ul>
                  <p v-if="bulkError.status === 409 || bulkError.status === 422" class="mt-2 text-xs">None of the routes in this batch were created. Fix the problems and submit again.</p>
                </div>
              </template>
              <template v-else>
                <p class="mt-2 text-sm leading-6 text-gray-600" data-test="portal-routes-help">Apporo does not let this page add routes yet, so add them in the Apporo portal, one route per service:</p>
                <ol class="mt-2 list-inside list-decimal space-y-1 text-sm leading-6 text-gray-600">
                  <li>Open the Application tab of “{{ review.access.name }}” with the link below.</li>
                  <li>Add a route for each service you want to publish: choose a subdomain prefix (the hostname becomes &lt;prefix&gt;.{{ bootstrap?.route_domain || 'your-domain' }}) and paste the service's internal URL from the list below as its service URL.</li>
                  <li>Come back and select “Check again” above to review the new routes.</li>
                </ol>
                <p class="mt-2 text-xs leading-5 text-gray-500">Use these internal URLs, not localhost: cloudflared runs in its own pod, where localhost only reaches cloudflared itself.</p>
                <a :href="review.portal_routes_url" target="_blank" rel="noopener noreferrer" class="mt-2 inline-block text-sm font-semibold text-brand underline">Add routes in the Apporo portal ↗</a>
                <p v-if="workspaceInfoError" class="mt-3 text-sm text-red-700">{{ workspaceInfoError }}</p>
                <p v-else-if="!workspaceInfo" class="mt-3 text-sm text-gray-500">Loading the workspace services…</p>
                <p v-else-if="!workspaceInfo.available" class="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">{{ workspaceInfo.reason || 'The services of this workspace cannot be read right now.' }}</p>
                <template v-else>
                  <p v-if="!workspaceServices.length" class="mt-3 text-sm text-gray-500">This workspace has no other services.</p>
                  <ul v-else class="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200" data-test="service-urls">
                    <li v-for="service in workspaceServices" :key="service.release" class="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                      <span class="font-medium text-ink">{{ serviceDisplayName(service) }}</span>
                      <code class="select-all break-all rounded bg-gray-50 px-2 py-1 text-xs text-gray-800">{{ primaryEndpoint(service)?.url || 'No port to connect to' }}</code>
                    </li>
                  </ul>
                  <div v-if="serviceUrlLines" class="mt-3 flex flex-wrap items-center gap-3">
                    <button type="button" class="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50" data-test="copy-service-urls" @click="copy(serviceUrlLines)">Copy list</button>
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
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 font-bold text-brand-700">4</span>
        <div class="min-w-0 flex-1">
          <h2 class="text-lg font-semibold text-ink">Connect and enable</h2>
          <p class="mt-1 text-sm leading-6 text-gray-600">Every hostname is checked once more first. Only when that check passes does this WebGUI get the tunnel credential, bind to the service and start cloudflared in token mode.</p>
          <button :disabled="!review?.ready || busy" class="mt-4 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-gray-300" @click="connect">{{ busy ? 'Working…' : 'Connect and enable' }}</button>
          <p v-if="bootstrap?.connection && !bootstrap.release_pending" class="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">✓ Linked to {{ bootstrap.connection.name }}. See the tunnel status on the Dashboard.</p>
          <div v-if="bootstrap?.release_pending" class="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            The local tunnel is stopped, but the remote binding is not confirmed as released yet (Apporo could not be reached). It is also retried automatically when the service restarts.
            <button class="ml-2 font-semibold underline" @click="finishDisconnect">Retry releasing the binding</button>
          </div>
          <div v-if="bootstrap?.connection" class="mt-4 flex flex-wrap items-center gap-3">
            <button class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50" @click="loadStatus(false)">Refresh connection status</button>
            <button class="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100" @click="checkExternal">Test public URLs</button>
            <button v-if="!bootstrap.release_pending" class="text-xs font-semibold text-red-700 underline" @click="disconnect">Stop the local connection and release the binding</button>
            <button v-else class="text-xs font-semibold text-amber-800 underline" @click="finishDisconnect">Check and finish the remote release</button>
          </div>
          <div v-if="connectionStatus?.connected" class="mt-4 grid gap-3 sm:grid-cols-3">
            <div class="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm"><p class="text-xs text-gray-500">Subscription</p><p class="mt-1 font-semibold text-ink">{{ subscriptionLabel(connectionStatus.subscription?.state) }}</p></div>
            <div class="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm"><p class="text-xs text-gray-500">Hostname access</p><p class="mt-1 font-semibold" :class="!connectionStatus.service_ready ? 'text-red-700' : connectionStatus.public_routes.length || connectionStatus.awaiting_publication ? 'text-amber-700' : 'text-emerald-700'">{{ !connectionStatus.service_ready ? 'Needs fixing' : connectionStatus.public_routes.length ? `${plural(connectionStatus.public_routes.length, 'public hostname')} (no Access)` : connectionStatus.awaiting_publication ? 'Waiting for Apporo to publish (URLs answer 503 for now)' : 'Access protection confirmed' }}</p></div>
            <div class="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm"><p class="text-xs text-gray-500">Tunnel</p><p class="mt-1 font-semibold text-ink">{{ tunnelLabel(connectionStatus.tunnel_status) }}</p></div>
            <p class="sm:col-span-3 text-xs text-gray-500">Checked {{ formatTime(connectionStatus.checked_at) }}. {{ connectionStatus.external.length ? 'The anonymous external check only confirms a response; it does not prove that an allowed user can sign in.' : 'Public URLs have not been tested separately yet; an online tunnel does not mean the public URLs work.' }}</p>
            <div v-for="result in connectionStatus.external" :key="result.hostname" class="rounded-xl border border-gray-200 bg-white p-4 text-sm" data-test="external-result">
              <p class="font-medium text-ink">{{ result.hostname }}</p>
              <p class="mt-1 text-xs" :class="externalClass(result)">{{ externalLabel(result) }}</p>
            </div>
            <ul v-if="connectionStatus.issues.length" class="sm:col-span-3 list-inside list-disc text-sm text-red-700"><li v-for="issue in connectionStatus.issues" :key="issue">{{ issue }}</li></ul>
          </div>
          <p class="mt-3 text-xs text-gray-500">A connected tunnel only means the tunnel is online. Public URLs and login protection still have to be checked one by one.</p>
        </div>
      </div>
    </section>
    <section class="rounded-2xl border border-stone-200 bg-stone-50 p-6 text-sm text-stone-700">
      <h2 class="font-semibold text-ink">Removing routes or cancelling the subscription</h2>
      <p class="mt-2 leading-6">Releasing the binding here only stops this WebGUI's tunnel and frees the device binding on Apporo. Clean up DNS, Access and the subscription on the Application tab or the service page on Apporo; this page never treats “binding released” as “public URL deleted”.</p>
      <a :href="review?.portal_routes_url || workspacePortal || undefined" target="_blank" rel="noopener noreferrer" class="mt-3 inline-block font-semibold text-brand underline">Manage routes on Apporo ↗</a>
    </section>
    <p class="text-center text-xs text-gray-500">Managing Cloudflare yourself? <router-link to="/setup" class="font-semibold text-brand underline">Go to local mode setup</router-link></p>

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
import { plural } from '@/utils/plural'
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

const steps = ['Subscribe', 'Sign in', 'Review routes', 'Connect']
const bootstrap = ref<PaasBootstrap | null>(null)
const authorization = ref<Authorization | null>(null)
const authStatus = ref('')
const workspaces = ref<Workspace[]>([])
const accesses = ref<Access[]>([])
// True while the selected workspace's services are being read: the "no
// Security Access yet" hint must not flash during that request.
const accessesLoading = ref(false)
const workspaceId = ref<number | null>(null)
const accessId = ref<number | null>(null)
const review = ref<PaasReview | null>(null)
const connectionStatus = ref<ConnectionStatus | null>(null)
const busy = ref(false)
const error = ref('')
const message = ref('')
let authTimer: ReturnType<typeof setTimeout> | undefined
const workspacePortal = computed(() => workspaces.value.find((item) => item.id === workspaceId.value)?.portal_url || bootstrap.value?.portal_url || '')

// Workspace services and the route write API (k3s/PaaS edition).
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
  return value ? (names[value] || `Unrecognized (${value})`) : 'Unknown'
}

function serviceLabel(value: string): string {
  return label(value, { pending: 'Pending', provisioning: 'Setting up', active: 'Active', active_no_route: 'Active, no hostname yet', error: 'Configuration error', suspended: 'Suspended', deleting: 'Deleting' })
}

function subscriptionLabel(value?: string): string {
  return label(value, { in_progress: 'Active', draft: 'Awaiting activation', paused: 'Paused', closed: 'Ended', cancel: 'Cancelled' })
}

function bindingLabel(value: string): string {
  return label(value, { unbound: 'Not bound', claimed: 'Bound to one device', legacy: 'Legacy binding, needs checking' })
}

function tunnelLabel(value: string): string {
  return label(value, { running: 'Online', starting: 'Starting', stopped: 'Not running' })
}

// English like the rest of the UI, whatever the browser locale.
function formatTime(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

async function loadBootstrap() {
  bootstrap.value = await api<PaasBootstrap>('/api/paas/bootstrap')
  if (bootstrap.value.authorized) {
    if (!bootstrap.value.connection) await Promise.all([loadWorkspaces(), loadWorkspaceInfo()])
    if (bootstrap.value.connection) {
      // Every call below goes to the platform; run what does not depend on
      // another call side by side so a linked page is ready sooner.
      workspaceId.value = bootstrap.value.connection.workspace_id
      await Promise.all([loadWorkspaces(), loadWorkspaceInfo(), onWorkspaceChange()])
      accessId.value = bootstrap.value.connection.access_id
      await Promise.all([loadReview(), loadStatus()])
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
    workspaceInfoError.value = `Could not load the workspace services: ${cause instanceof Error ? cause.message : 'please try again later.'}`
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
    if (!error.value) message.value = 'Service list updated. Choose a service and check how each hostname is accessed before you connect.'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not update the service list right now'
  } finally {
    busy.value = false
  }
}

async function onWorkspaceChange() {
  review.value = null
  accessId.value = null
  accesses.value = []
  if (workspaceId.value !== null) {
    accessesLoading.value = true
    try {
      accesses.value = (await api<{ accesses: Access[] }>(`/api/paas/workspaces/${workspaceId.value}/accesses`)).accesses
    } finally {
      accessesLoading.value = false
    }
  }
}

async function selectThisWorkspace() {
  if (!thisWorkspace.value) return
  workspaceId.value = thisWorkspace.value.id
  try {
    await onWorkspaceChange()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not load the Security Access services'
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
    error.value = cause instanceof Error ? cause.message : 'Could not check the service'
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
      message: cause instanceof Error ? cause.message : 'Could not publish the services. Please try again later.',
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
    message.value = `Removed ${route.hostname}.`
    await refreshStatusIfConnected()
  } catch (cause) {
    routeError.value = `Could not remove ${route.hostname}: ${cause instanceof Error ? cause.message : 'please try again later.'}`
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
    error.value = cause instanceof Error ? cause.message : 'Could not start the authorization'
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
      message.value = 'Apporo account authorized. Now choose the workspace and the Security Access service.'
      return
    }
    if (result.status === 'waiting') {
      authTimer = setTimeout(pollAuthorization, (result.interval || authorization.value?.interval || 5) * 1000)
      return
    }
    error.value = result.status === 'denied' ? 'The authorization was denied. Get a new device code.' : 'The authorization expired. Get a new device code.'
    authorization.value = null
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not check the authorization status right now'
    authTimer = setTimeout(pollAuthorization, 10000)
  }
}

async function connect() {
  if (accessId.value === null || !review.value?.ready) return
  if (review.value.public_routes.length && !window.confirm(
    `These hostnames have no Cloudflare Access. Once connected, anyone on the internet can reach their origin service:\n${review.value.public_routes.join('\n')}\n\nTurn on these public routes?`
  )) return
  busy.value = true
  error.value = ''
  try {
    await api(`/api/paas/accesses/${accessId.value}/connect`, {
      method: 'POST', body: JSON.stringify({ allow_public_routes: review.value.public_routes.length > 0 }),
    })
    message.value = 'Connected. cloudflared is running in token mode.'
    await loadBootstrap()
    await loadStatus()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not connect'
    await loadReview()
  } finally {
    busy.value = false
  }
}

async function loadStatus(probe = false) {
  try {
    connectionStatus.value = await api<ConnectionStatus>(`/api/paas/connection/status${probe ? '?probe=true' : ''}`)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not read the connection status'
  }
}

async function checkExternal() {
  message.value = 'Checking the public URLs from this WebGUI…'
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
  if (isPublic && result.status === 'public_response') return 'Public route answers directly; make sure the origin service has its own login'
  if (isPublic && result.status === 'login_required') return 'An anonymous visit gets an Access login, although the route is public on Apporo; check its state in Cloudflare'
  const labels: Record<string, string> = {
    login_required: 'An anonymous visit gets the Cloudflare Access login',
    public_response: 'An anonymous visit got 200 directly; check the Access protection now',
    blocked_or_protected: 'HTTP 403: blocked by Access or another rule; this check cannot tell which',
    origin_error: 'The origin service or the tunnel returned an error',
    blocked_private_address: 'The hostname resolves to a private or reserved address; check skipped',
    unreachable: 'DNS, TLS or the network connection failed',
    undetermined: 'The response could not be classified; check again on Apporo and in a browser',
  }
  return labels[result.status] || 'Could not be determined'
}

async function disconnect() {
  if (!window.confirm('This stops the Apporo tunnel of this WebGUI, clears the local routes and then releases the remote binding.\nEvery hostname published through this tunnel goes offline immediately. Continue?')) return
  error.value = ''
  try {
    const result = await api<{ stopped: boolean; release_pending: boolean }>('/api/paas/disconnect', { method: 'POST' })
    message.value = result.release_pending
      ? 'The local tunnel is stopped, but the remote binding is not released yet. Select “Retry releasing the binding” in a moment.'
      : 'The local connection is stopped and the remote binding is released.'
    connectionStatus.value = null
    await loadBootstrap()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not stop the connection'
  }
}

async function finishDisconnect() {
  error.value = ''
  try {
    await api('/api/paas/disconnect/finish', { method: 'POST' })
    message.value = 'The local connection is stopped and the remote binding is released.'
    connectionStatus.value = null
    await loadBootstrap()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The remote release is not finished yet. Try again later or release the binding on Apporo.'
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
    message.value = 'Apporo account authorization revoked.'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not revoke the authorization'
  }
}

onMounted(() => { loadBootstrap().catch((cause) => { error.value = cause instanceof Error ? cause.message : 'Could not read the Apporo link status' }) })
onUnmounted(() => { if (authTimer) clearTimeout(authTimer) })
</script>
