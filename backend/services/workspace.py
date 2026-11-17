"""The services that run next to this WebGUI in the same workspace.

In the WOOW PaaS a workspace is one Kubernetes namespace and every cloud
service is one Helm release in it. The chart gives this pod a namespaced Role
that can only list Services (and EndpointSlices, for readiness), so the GUI can
offer "publish these services" without the user typing any address.

Kubernetes knows releases and ports but not the names people gave their
services in the PaaS portal; the router adds those from the platform when an
account is linked (routers/paas.py: workspace_context).
"""
from __future__ import annotations

import os
import re
import ssl
from pathlib import Path
from typing import Any

import aiohttp

SA_DIR = Path(os.environ.get("K8S_SA_DIR", "/var/run/secrets/kubernetes.io/serviceaccount"))
INSTANCE_LABEL = "app.kubernetes.io/instance"
NAME_LABEL = "app.kubernetes.io/name"
SERVICE_NAME_LABEL = "kubernetes.io/service-name"
# The platform operator publishes the first of these ports it finds
# (paas-operator api/releases.py, route detection).
PRIMARY_PORTS = (80, 8080, 3000, 8000, 443, 8443)
TCP_PORTS = {22, 1883, 3306, 5432, 5672, 6379, 8883, 9042, 11211, 27017}
TCP_PORT_NAMES = ("postgres", "redis", "mqtt", "ssh", "mysql", "mongo", "amqp", "memcache")
PREFIX_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$")


class KubeError(Exception):
    """The Kubernetes API could not be used. The message is for the GUI."""


def namespace() -> str | None:
    value = os.environ.get("WORKSPACE_NAMESPACE")
    if value:
        return value.strip()
    try:
        return (SA_DIR / "namespace").read_text().strip() or None
    except OSError:
        return None


def self_release() -> str | None:
    return (os.environ.get("SELF_RELEASE") or "").strip() or None


def _api_origin() -> str | None:
    host = os.environ.get("KUBERNETES_SERVICE_HOST")
    if not host:
        return None
    port = os.environ.get("KUBERNETES_SERVICE_PORT", "443")
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    return f"https://{host}:{port}"


async def kube_get(path: str, timeout: float = 8) -> dict:
    """GET a Kubernetes API path with this pod's service account."""
    origin = _api_origin()
    if not origin:
        raise KubeError("不在 Kubernetes 內執行，無法列出工作區服務")
    try:
        # Projected service-account tokens rotate: read the file on every call.
        token = (SA_DIR / "token").read_text().strip()
        ctx = ssl.create_default_context(cafile=str(SA_DIR / "ca.crt"))
    except (OSError, ssl.SSLError) as exc:
        raise KubeError("這個 WebGUI 沒有掛載 Kubernetes 服務帳號，無法列出工作區服務") from exc
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as session:
            async with session.get(f"{origin}{path}", ssl=ctx,
                                   headers={"Authorization": f"Bearer {token}"}) as response:
                if response.status in (401, 403):
                    raise KubeError("WebGUI 沒有讀取工作區服務的權限（請確認 chart 的 rbac.create）")
                if response.status >= 400:
                    raise KubeError(f"Kubernetes API 回應 {response.status}")
                data = await response.json(content_type=None)
                if not isinstance(data, dict):
                    raise KubeError("Kubernetes API 回應格式不正確")
                return data
    except (aiohttp.ClientError, TimeoutError) as exc:
        raise KubeError("連不上 Kubernetes API（請確認 NetworkPolicy 放行 apiserver）") from exc


def _kind(port: dict) -> str:
    number = port.get("port")
    name = (port.get("name") or "").lower()
    if number in (443, 8443) or "https" in name:
        return "https"
    if number in TCP_PORTS or any(word in name for word in TCP_PORT_NAMES):
        return "tcp"
    return "http"


def _url(service: str, port: dict, kind: str) -> str:
    number = port.get("port")
    if kind == "tcp":
        scheme = "ssh" if number == 22 or "ssh" in (port.get("name") or "").lower() else "tcp"
    else:
        scheme = kind
    return f"{scheme}://{service}:{number}"


def _primary(services: list[dict]) -> tuple[str, int] | None:
    """(service name, port) the platform itself would publish for a release."""
    for service in sorted(services, key=lambda s: s["metadata"]["name"]):
        ports = [p.get("port") for p in service.get("spec", {}).get("ports") or []
                 if (p.get("protocol") or "TCP") == "TCP"]
        if not ports:
            continue
        for wanted in PRIMARY_PORTS:
            if wanted in ports:
                return service["metadata"]["name"], wanted
        return service["metadata"]["name"], ports[0]
    return None


def slugify(value: str) -> str:
    value = re.sub(r"[^a-z0-9-]+", "-", (value or "").lower())
    value = re.sub(r"-{2,}", "-", value).strip("-")
    return value[:63].strip("-")


def _suggest(display_name: str | None, chart: str, release: str, taken: set[str]) -> str:
    base = slugify(display_name or "")
    if not PREFIX_RE.match(base):
        suffix = release.removeprefix("svc-")
        base = slugify(f"{chart}-{suffix}" if chart and chart != release else release)
    if not PREFIX_RE.match(base):
        base = slugify(f"svc-{base or 'service'}")
    candidate, n = base, 2
    while candidate in taken:
        tail = f"-{n}"
        candidate = f"{base[:63 - len(tail)].rstrip('-')}{tail}"
        n += 1
    taken.add(candidate)
    return candidate


def _ready_by_service(slices: dict | None) -> dict[str, bool] | None:
    if slices is None:
        return None
    ready: dict[str, bool] = {}
    for item in slices.get("items") or []:
        name = (item.get("metadata", {}).get("labels") or {}).get(SERVICE_NAME_LABEL)
        if not name:
            continue
        ok = any((ep.get("conditions") or {}).get("ready") is not False
                 for ep in item.get("endpoints") or [])
        ready[name] = ready.get(name, False) or ok
    return ready


def build_services(services: dict, slices: dict | None, own_release: str | None,
                   platform_services: list[dict] | None = None) -> list[dict[str, Any]]:
    """Group the namespace's Services by Helm release (pure; see docs/paas-api.md)."""
    by_release: dict[str, list[dict]] = {}
    for service in services.get("items") or []:
        meta = service.get("metadata") or {}
        spec = service.get("spec") or {}
        if spec.get("clusterIP") in ("None", None) or spec.get("type") == "ExternalName":
            continue
        labels = meta.get("labels") or {}
        release = labels.get(INSTANCE_LABEL) or meta.get("name")
        if not release or (own_release and release == own_release):
            continue
        by_release.setdefault(release, []).append(service)

    named = {p.get("release"): p for p in platform_services or [] if p.get("release")}
    ready_map = _ready_by_service(slices)
    entries: list[dict[str, Any]] = []
    for release, members in by_release.items():
        primary = _primary(members)
        endpoints = []
        for service in sorted(members, key=lambda s: s["metadata"]["name"]):
            name = service["metadata"]["name"]
            for port in service.get("spec", {}).get("ports") or []:
                if (port.get("protocol") or "TCP") != "TCP" or not port.get("port"):
                    continue
                kind = _kind(port)
                endpoints.append({
                    "service": name,
                    "port": port["port"],
                    "port_name": port.get("name") or "",
                    "protocol": "TCP",
                    "kind": kind,
                    "url": _url(name, port, kind),
                    "primary": primary == (name, port["port"]),
                })
        if not endpoints:
            continue
        endpoints.sort(key=lambda e: (not e["primary"], e["service"], e["port"]))
        labels = members[0]["metadata"].get("labels") or {}
        chart = labels.get(NAME_LABEL) or members[0]["metadata"]["name"]
        platform = named.get(release) or {}
        ready = None
        if ready_map is not None:
            ready = bool(ready_map.get(endpoints[0]["service"]))
        entries.append({
            "release": release,
            "chart": chart,
            "display_name": platform.get("name") or None,
            "template_slug": platform.get("template_slug") or None,
            "state": platform.get("state") or None,
            "ready": ready,
            "endpoints": endpoints,
        })

    entries.sort(key=lambda e: (e["display_name"] is None,
                                (e["display_name"] or e["chart"]).lower(), e["release"]))
    taken: set[str] = set()
    for entry in entries:
        entry["suggested_prefix"] = _suggest(entry["display_name"], entry["chart"],
                                             entry["release"], taken)
    return entries
