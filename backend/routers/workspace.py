"""GET /api/workspace: the services of this WebGUI's workspace (docs/paas-api.md)."""
from fastapi import APIRouter

from ..services import workspace
from . import paas

router = APIRouter(tags=["workspace"])


@router.get("/api/workspace")
async def get_workspace() -> dict:
    ns = workspace.namespace()
    body = {
        "available": False,
        "reason": None,
        "namespace": ns,
        "self_release": workspace.self_release(),
        "workspace": None,
        "services": [],
    }
    if not ns:
        body["reason"] = "Not running in a Kubernetes namespace, so the workspace services cannot be listed."
        return body
    try:
        services = await workspace.kube_get(f"/api/v1/namespaces/{ns}/services")
    except workspace.KubeError as exc:
        body["reason"] = str(exc)
        return body
    try:
        slices = await workspace.kube_get(f"/apis/discovery.k8s.io/v1/namespaces/{ns}/endpointslices")
    except workspace.KubeError:
        slices = None  # readiness is optional
    context = await paas.workspace_context(ns)
    body["available"] = True
    body["workspace"] = context["workspace"] if context else None
    body["services"] = workspace.build_services(
        services, slices, body["self_release"],
        platform_services=context["services"] if context else None,
    )
    return body
