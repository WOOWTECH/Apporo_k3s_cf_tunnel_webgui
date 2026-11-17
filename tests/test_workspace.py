"""Workspace service discovery (docs/paas-api.md §1, GET /api/workspace)."""
from unittest.mock import patch

import pytest

from backend.routers import paas as paas_router
from backend.services import workspace


def _svc(name, ports, release=None, chart=None, cluster_ip="10.43.1.1", stype="ClusterIP"):
    labels = {}
    if release:
        labels["app.kubernetes.io/instance"] = release
    if chart:
        labels["app.kubernetes.io/name"] = chart
    return {
        "metadata": {"name": name, "labels": labels},
        "spec": {"clusterIP": cluster_ip, "type": stype,
                 "ports": [{"name": n, "port": p, "protocol": proto} for n, p, proto in ports]},
    }


SERVICES = {"items": [
    _svc("svc-11111111-pi-agent", [("http", 8080, "TCP")], "svc-11111111", "pi-agent"),
    _svc("svc-22222222-omnigent", [("http", 8000, "TCP")], "svc-22222222", "omnigent"),
    _svc("svc-33333333-open-design", [("http", 7457, "TCP")], "svc-33333333", "open-design"),
    _svc("svc-33333333-open-design-console", [("console", 18790, "TCP"), ("ttyd", 7681, "TCP")],
         "svc-33333333", "open-design"),
    _svc("svc-44444444-postgresql", [("tcp-postgresql", 5432, "TCP")], "svc-44444444", "postgresql"),
    _svc("svc-44444444-postgresql-hl", [("tcp-postgresql", 5432, "TCP")], "svc-44444444",
         "postgresql", cluster_ip="None"),
    _svc("svc-1a2b3c4d-cf-tunnel-webgui", [("http", 8080, "TCP")], "svc-1a2b3c4d", "cf-tunnel-webgui"),
    _svc("plain", [("web", 443, "TCP"), ("dns", 53, "UDP")]),
]}

SLICES = {"items": [
    {"metadata": {"labels": {"kubernetes.io/service-name": "svc-11111111-pi-agent"}},
     "endpoints": [{"conditions": {"ready": True}}]},
    {"metadata": {"labels": {"kubernetes.io/service-name": "svc-22222222-omnigent"}},
     "endpoints": [{"conditions": {"ready": False}}]},
]}


def _by_release(entries):
    return {e["release"]: e for e in entries}


def test_groups_by_release_and_skips_self_and_headless():
    entries = _by_release(workspace.build_services(SERVICES, SLICES, "svc-1a2b3c4d"))
    assert "svc-1a2b3c4d" not in entries
    assert set(entries) == {"svc-11111111", "svc-22222222", "svc-33333333", "svc-44444444", "plain"}
    # the headless twin of postgresql is not offered
    assert [e["service"] for e in entries["svc-44444444"]["endpoints"]] == ["svc-44444444-postgresql"]


def test_primary_endpoint_follows_the_operator_port_rule():
    entries = _by_release(workspace.build_services(SERVICES, SLICES, None))
    od = entries["svc-33333333"]["endpoints"]
    # Services sorted by name: open-design (7457, no preferred port) comes first.
    assert od[0] == {"service": "svc-33333333-open-design", "port": 7457, "port_name": "http",
                     "protocol": "TCP", "kind": "http", "url": "http://svc-33333333-open-design:7457",
                     "primary": True}
    assert sum(e["primary"] for e in od) == 1
    assert entries["svc-11111111"]["endpoints"][0]["url"] == "http://svc-11111111-pi-agent:8080"


def test_kinds_and_schemes():
    entries = _by_release(workspace.build_services(SERVICES, SLICES, None))
    pg = entries["svc-44444444"]["endpoints"][0]
    assert pg["kind"] == "tcp" and pg["url"] == "tcp://svc-44444444-postgresql:5432"
    plain = entries["plain"]["endpoints"]
    assert [(e["port"], e["kind"]) for e in plain] == [(443, "https")]  # UDP is dropped
    assert plain[0]["url"] == "https://plain:443"


def test_readiness_from_endpointslices():
    entries = _by_release(workspace.build_services(SERVICES, SLICES, None))
    assert entries["svc-11111111"]["ready"] is True
    assert entries["svc-22222222"]["ready"] is False
    assert entries["svc-44444444"]["ready"] is False
    unknown = _by_release(workspace.build_services(SERVICES, None, None))
    assert unknown["svc-11111111"]["ready"] is None


def test_platform_names_and_unique_valid_prefixes():
    platform = [
        {"release": "svc-11111111", "name": "pi-1", "template_slug": "pi-agent", "state": "running"},
        {"release": "svc-22222222", "name": "PI 1", "template_slug": "omnigent", "state": "running"},
        {"release": "svc-33333333", "name": "設計工具", "template_slug": "open-design", "state": "running"},
    ]
    entries = workspace.build_services(SERVICES, SLICES, "svc-1a2b3c4d", platform)
    by = _by_release(entries)
    assert by["svc-11111111"]["display_name"] == "pi-1"
    assert by["svc-11111111"]["template_slug"] == "pi-agent"
    prefixes = [e["suggested_prefix"] for e in entries]
    assert len(prefixes) == len(set(prefixes))
    assert all(workspace.PREFIX_RE.match(p) for p in prefixes)
    # "PI 1" slugifies to the same prefix as "pi-1" → made unique
    assert {by["svc-11111111"]["suggested_prefix"], by["svc-22222222"]["suggested_prefix"]} == {
        "pi-1", "pi-1-2"}
    # a CJK-only name falls back to chart + release suffix
    assert by["svc-33333333"]["suggested_prefix"] == "open-design-33333333"
    # named services come first
    assert [e["display_name"] is not None for e in entries][:3] == [True, True, True]


@pytest.mark.asyncio
async def test_router_reports_unavailable_outside_kubernetes(client, monkeypatch):
    monkeypatch.delenv("WORKSPACE_NAMESPACE", raising=False)
    monkeypatch.setattr(workspace, "SA_DIR", workspace.Path("/nonexistent-sa-dir"))
    body = (await client.get("/api/workspace")).json()
    assert body["available"] is False
    assert body["services"] == []
    assert body["reason"]


@pytest.mark.asyncio
async def test_router_lists_services_and_merges_platform_names(client, monkeypatch):
    monkeypatch.setenv("WORKSPACE_NAMESPACE", "paas-ws-0a1b2c3d")
    monkeypatch.setenv("SELF_RELEASE", "svc-1a2b3c4d")
    calls = []

    async def fake_kube_get(path, timeout=8):
        calls.append(path)
        return SLICES if "endpointslices" in path else SERVICES

    async def fake_context(namespace):
        assert namespace == "paas-ws-0a1b2c3d"
        return {"workspace": {"id": 4, "name": "my-workspace"},
                "services": [{"release": "svc-11111111", "name": "pi-1",
                              "template_slug": "pi-agent", "state": "running"}]}

    with patch.object(workspace, "kube_get", fake_kube_get), \
            patch.object(paas_router, "workspace_context", fake_context):
        body = (await client.get("/api/workspace")).json()
    assert calls == ["/api/v1/namespaces/paas-ws-0a1b2c3d/services",
                     "/apis/discovery.k8s.io/v1/namespaces/paas-ws-0a1b2c3d/endpointslices"]
    assert body["available"] is True
    assert body["workspace"] == {"id": 4, "name": "my-workspace"}
    assert body["self_release"] == "svc-1a2b3c4d"
    names = {s["release"]: s["display_name"] for s in body["services"]}
    assert names["svc-11111111"] == "pi-1"
    assert "svc-1a2b3c4d" not in names


@pytest.mark.asyncio
async def test_router_surfaces_kube_errors(client, monkeypatch):
    monkeypatch.setenv("WORKSPACE_NAMESPACE", "paas-ws-0a1b2c3d")

    async def denied(path, timeout=8):
        raise workspace.KubeError("This WebGUI is not allowed to list the workspace services (check rbac.create in the chart).")

    with patch.object(workspace, "kube_get", denied):
        body = (await client.get("/api/workspace")).json()
    assert body["available"] is False
    assert "not allowed" in body["reason"]
