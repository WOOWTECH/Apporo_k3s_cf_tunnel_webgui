"""PaaS edition: add/remove Security Access routes from the WebGUI
(docs/paas-api.md), the extra OAuth scope, the platform name lookup, and the
same-origin rule for WebSockets."""
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from urllib.parse import parse_qs, urlparse

import pytest
from starlette.testclient import TestClient

from backend.routers import paas as paas_router


ACCESS = {
    "id": 25, "workspace_id": 4, "name": "my-workspace 對外", "state": "active",
    "tunnel_id": "tunnel-25", "binding_state": "unbound", "binding_conflict": False,
    "connector_count": 0, "subscription": {"state": "in_progress", "plan_name": "10 routes",
                                           "ac_max_access_seats": 0, "ac_used_access_seats": 0},
    "routes": [],
}


@pytest.fixture()
def platform(monkeypatch):
    class State(list):
        routes = []
        next_id = 100
        post_status = 200
        post_payload = None

    received = State()

    class Handler(BaseHTTPRequestHandler):
        def _send(self, status, payload):
            data = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _access(self):
            return {**ACCESS, "routes": list(received.routes)}

        def do_POST(self):
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length).decode()
            path = urlparse(self.path).path
            if path == "/oauth2/device_authorization":
                received.append((path, parse_qs(raw)))
                port = self.server.server_port
                self._send(200, {"device_code": "D", "user_code": "ABCD-EFGH",
                                 "verification_uri": f"http://127.0.0.1:{port}/device",
                                 "expires_in": 900, "interval": 5})
                return
            body = json.loads(raw or "{}")
            received.append((path, body, self.headers.get("Authorization", "")))
            if path == "/api/security-access/accesses/25/routes":
                if received.post_status != 200:
                    self._send(received.post_status, received.post_payload or {})
                    return
                created = []
                for item in body["routes"]:
                    received.next_id += 1
                    route = {"id": received.next_id, "subdomain_prefix": item["subdomain_prefix"],
                             "hostname": f"{item['subdomain_prefix']}.woowtech.io",
                             "service_url": item["service_url"], "is_protected": False,
                             "access_protection_lost": False, "access_publish_pending": False}
                    received.routes.append(route)
                    created.append(route)
                self._send(200, {"routes": created, "access": self._access()})
            else:
                self._send(404, {"error": "Not Found"})

        def do_GET(self):
            received.append((self.path, self.headers.get("Authorization", "")))
            path = urlparse(self.path).path
            query = parse_qs(urlparse(self.path).query)
            if path == "/api/security-access/accesses/25":
                self._send(200, {"access": self._access()})
            elif path == "/api/security-access/routes/check":
                prefix = query["prefix"][0]
                taken = prefix == "taken-name"
                self._send(200, {"prefix": prefix, "available": not taken,
                                 "reason": "already used by another route" if taken else ""})
            elif path == "/api/security-access/workspaces/lookup":
                if query.get("namespace") == ["paas-ws-0a1b2c3d"]:
                    self._send(200, {"workspace": {"id": 4, "name": "my-workspace", "slug": "my-workspace",
                                                   "namespace": "paas-ws-0a1b2c3d"}})
                else:
                    self._send(404, {"error": "not_found"})
            elif path == "/api/security-access/workspaces/4/services":
                self._send(200, {"workspace": {"id": 4, "name": "my-workspace"},
                                 "services": [{"id": 9, "name": "pi-1", "template_slug": "pi-agent",
                                               "release": "svc-11111111", "state": "running"}]})
            else:
                self._send(404, {"error": "Not Found"})

        def do_DELETE(self):
            received.append((self.path, self.headers.get("Authorization", "")))
            path = urlparse(self.path).path
            prefix = "/api/security-access/accesses/25/routes/"
            if path.startswith(prefix):
                route_id = int(path[len(prefix):])
                before = len(received.routes)
                received.routes = [r for r in received.routes if r["id"] != route_id]
                if len(received.routes) == before:
                    self._send(404, {"error": "Not Found"})
                else:
                    self._send(200, {"deleted": True})
            else:
                self._send(404, {"error": "Not Found"})

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setenv("PAAS_API_BASE", f"http://127.0.0.1:{server.server_port}")
    monkeypatch.setenv("PAAS_ROUTES_WRITE", "true")
    paas_router._context_cache.clear()
    yield received
    paas_router._context_cache.clear()
    server.shutdown()
    server.server_close()
    thread.join(timeout=2)


def _authorized(data_dir):
    (data_dir / "paas-link.json").write_text(json.dumps({
        "access_token": "PRIVATE_ACCESS_TOKEN", "refresh_token": "PRIVATE_REFRESH_TOKEN",
        "expires_at": time.time() + 3600}))


BULK = {"routes": [
    {"subdomain_prefix": "pi-1", "service_url": "http://svc-11111111-pi-agent:8080"},
    {"subdomain_prefix": "Omnigent-1", "service_url": "http://svc-22222222-omnigent:8000"},
]}


@pytest.mark.asyncio
async def test_bootstrap_reports_route_writing(client, platform, monkeypatch):
    monkeypatch.setenv("PAAS_PORTAL_BASE", "https://paas.example.com")
    monkeypatch.setenv("PAAS_ROUTE_DOMAIN", "woowtech.io")
    body = (await client.get("/api/paas/bootstrap")).json()
    assert body["routes_write"] is True
    assert body["route_domain"] == "woowtech.io"
    assert body["portal_url"] == "https://paas.example.com/woow#/workspaces"


@pytest.mark.asyncio
async def test_device_authorization_asks_for_the_routes_scope_when_enabled(client, platform):
    assert (await client.post("/api/paas/authorization")).status_code == 200
    path, form = platform[0]
    assert path == "/oauth2/device_authorization"
    assert form["scope"] == [
        "workspace:read security-access:read security-access:tunnel security-access:routes"]


@pytest.mark.asyncio
async def test_bulk_create_forwards_json_and_returns_a_fresh_review(client, platform, tmp_config_dir):
    _authorized(tmp_config_dir)
    response = await client.post("/api/paas/accesses/25/routes", json=BULK)
    assert response.status_code == 200, response.text
    body = response.json()
    assert [r["subdomain_prefix"] for r in body["created"]] == ["pi-1", "omnigent-1"]
    assert body["created"][0]["hostname"] == "pi-1.woowtech.io"
    sent = [entry for entry in platform if entry[0] == "/api/security-access/accesses/25/routes"]
    assert sent[0][1] == {"routes": [
        {"subdomain_prefix": "pi-1", "service_url": "http://svc-11111111-pi-agent:8080"},
        {"subdomain_prefix": "omnigent-1", "service_url": "http://svc-22222222-omnigent:8000"}]}
    assert sent[0][2] == "Bearer PRIVATE_ACCESS_TOKEN"
    review_routes = body["review"]["access"]["routes"]
    assert [(r["id"], r["public"]) for r in review_routes] == [(101, True), (102, True)]
    assert body["review"]["public_routes"] == ["pi-1.woowtech.io", "omnigent-1.woowtech.io"]
    assert "PRIVATE" not in response.text


@pytest.mark.asyncio
@pytest.mark.parametrize("payload", [
    {"routes": []},
    {"routes": [{"subdomain_prefix": "a", "service_url": "http://x:80"}]},
    {"routes": [{"subdomain_prefix": "-bad-", "service_url": "http://x:80"}]},
    {"routes": [{"subdomain_prefix": "good-one", "service_url": "localhost:80"}]},
    {"routes": [{"subdomain_prefix": "good-one", "service_url": "ftp://x:21"}]},
    {"routes": [{"subdomain_prefix": "same-name", "service_url": "http://a:80"},
                {"subdomain_prefix": "same-name", "service_url": "http://b:80"}]},
    {"routes": [{"subdomain_prefix": f"name-{i:02d}", "service_url": "http://a:80"} for i in range(11)]},
])
async def test_bulk_create_rejects_bad_input_before_calling_the_platform(
        client, platform, tmp_config_dir, payload):
    _authorized(tmp_config_dir)
    response = await client.post("/api/paas/accesses/25/routes", json=payload)
    assert response.status_code == 422
    assert not [e for e in platform if e[0] == "/api/security-access/accesses/25/routes"]


@pytest.mark.asyncio
async def test_bulk_create_maps_platform_conflicts(client, platform, tmp_config_dir):
    _authorized(tmp_config_dir)
    platform.post_status = 409
    platform.post_payload = {"error": "unavailable", "detail": "x",
                             "prefixes": {"pi-1": "already used by another route"}}
    response = await client.post("/api/paas/accesses/25/routes", json=BULK)
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["errors"] == {"pi-1": "already used by another route"}
    assert "無法使用" in detail["message"]


@pytest.mark.asyncio
@pytest.mark.parametrize("status,expected", [(403, 403), (404, 404), (400, 422), (500, 502)])
async def test_bulk_create_maps_other_platform_errors(client, platform, tmp_config_dir, status, expected):
    _authorized(tmp_config_dir)
    platform.post_status = status
    platform.post_payload = {"error": "e", "detail": "平台說明"}
    response = await client.post("/api/paas/accesses/25/routes", json=BULK)
    assert response.status_code == expected


@pytest.mark.asyncio
async def test_route_writing_is_off_without_the_flag(client, platform, tmp_config_dir, monkeypatch):
    _authorized(tmp_config_dir)
    monkeypatch.delenv("PAAS_ROUTES_WRITE")
    assert (await client.post("/api/paas/accesses/25/routes", json=BULK)).status_code == 501
    assert (await client.delete("/api/paas/accesses/25/routes/101")).status_code == 501


@pytest.mark.asyncio
async def test_delete_route_returns_a_fresh_review(client, platform, tmp_config_dir):
    _authorized(tmp_config_dir)
    assert (await client.post("/api/paas/accesses/25/routes", json=BULK)).status_code == 200
    response = await client.delete("/api/paas/accesses/25/routes/101")
    assert response.status_code == 200
    assert [r["id"] for r in response.json()["review"]["access"]["routes"]] == [102]
    assert (await client.delete("/api/paas/accesses/25/routes/999")).status_code == 404


@pytest.mark.asyncio
async def test_prefix_check(client, platform, tmp_config_dir):
    _authorized(tmp_config_dir)
    ok = (await client.get("/api/paas/routes/check", params={"prefix": "Pi-1"})).json()
    assert ok == {"prefix": "pi-1", "available": True, "reason": ""}
    taken = (await client.get("/api/paas/routes/check", params={"prefix": "taken-name"})).json()
    assert taken["available"] is False and taken["reason"]
    bad = (await client.get("/api/paas/routes/check", params={"prefix": "x"})).json()
    assert bad["available"] is False
    assert not [e for e in platform if "prefix=x" in e[0]]


@pytest.mark.asyncio
async def test_workspace_context_reads_names_and_caches(platform, tmp_config_dir, monkeypatch):
    monkeypatch.setenv("PAAS_LINK_STATE", str(tmp_config_dir / "paas-link.json"))
    assert await paas_router.workspace_context("paas-ws-0a1b2c3d") is None  # not linked
    _authorized(tmp_config_dir)
    paas_router._context_cache.clear()
    ctx = await paas_router.workspace_context("paas-ws-0a1b2c3d")
    assert ctx["workspace"] == {"id": 4, "name": "my-workspace"}
    assert ctx["services"][0]["release"] == "svc-11111111"
    calls = len(platform)
    assert await paas_router.workspace_context("paas-ws-0a1b2c3d") == ctx
    assert len(platform) == calls  # cached
    assert await paas_router.workspace_context("paas-ws-ffffffff") is None


def test_cross_origin_websocket_is_refused():
    from backend.main import app
    from starlette.websockets import WebSocketDisconnect
    with TestClient(app) as tc:
        with pytest.raises(WebSocketDisconnect) as refused:
            with tc.websocket_connect("/ws/logs", headers={"origin": "https://evil.example"}):
                pass
        assert refused.value.code == 4403
        with tc.websocket_connect("/ws/logs", headers={"origin": "http://testserver"}) as ws:
            ws.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("payload,expected", [
    ({"error": "insufficient_role", "detail": "x"}, "擁有者或管理員"),
    ({"error": "Forbidden", "detail": "Insufficient scope. Required: security-access:routes"}, "重新授權"),
    ({"error": "Forbidden", "detail": "No access to the workspace"}, "不是這個工作區的成員"),
])
async def test_forbidden_reasons_are_told_apart(client, platform, tmp_config_dir, payload, expected):
    _authorized(tmp_config_dir)
    platform.post_status = 403
    platform.post_payload = payload
    response = await client.post("/api/paas/accesses/25/routes", json=BULK)
    assert response.status_code == 403
    assert expected in response.json()["detail"]


@pytest.mark.asyncio
async def test_not_writable_carries_the_platform_reason(client, platform, tmp_config_dir):
    _authorized(tmp_config_dir)
    platform.post_status = 409
    platform.post_payload = {"error": "not_writable", "detail": "Your subscription has expired."}
    response = await client.post("/api/paas/accesses/25/routes", json=BULK)
    assert response.status_code == 409
    assert response.json()["detail"]["message"].endswith("Your subscription has expired.")

