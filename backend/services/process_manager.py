"""Manage the cloudflared child process lifecycle (engine-agnostic).

In the Podman edition a dead cloudflared was brought back from outside: the
container healthcheck failed, podman killed the container and systemd started
it again. In Kubernetes the liveness probe only watches the backend (a tunnel
that cannot reach the edge must not restart the pod in a loop), so the
process manager supervises cloudflared itself when CF_SUPERVISE is on: a child
that exits while it is still wanted is started again with the same argv after
a growing delay. Stop() ends the supervision; Start() begins it again.
"""
import asyncio
import os
import signal
import time
from collections import deque
from typing import Optional

from .redact import clean_line

# Delays (seconds) before restarting a cloudflared that exited on its own. A
# child that stayed up for RESET_AFTER seconds starts the sequence again.
RESTART_DELAYS = (2, 5, 10, 30, 60)
RESET_AFTER = 120


def _env_flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


class ProcessManager:
    def __init__(self, log_buffer: int = 500, supervise: Optional[bool] = None,
                 echo: Optional[bool] = None,
                 restart_delays: tuple = RESTART_DELAYS):
        self._proc: Optional[asyncio.subprocess.Process] = None
        self._args: list[str] = []
        self._logs: deque[str] = deque(maxlen=log_buffer)
        self._reader_task: Optional[asyncio.Task] = None
        self._watch_task: Optional[asyncio.Task] = None
        self._subscribers: set[asyncio.Queue] = set()
        self._supervise = _env_flag("CF_SUPERVISE") if supervise is None else supervise
        # Also print the (redacted) cloudflared output to stdout so it shows in
        # `kubectl logs`. The Podman edition kept it in the GUI ring only.
        self._echo = _env_flag("CF_LOG_STDOUT") if echo is None else echo
        self._restart_delays = restart_delays
        self._wanted = False
        self._started_at = 0.0
        self.restart_count = 0
        self.last_exit_code: Optional[int] = None

    def subscribe(self) -> asyncio.Queue:
        """Register a live log subscriber. Returns a queue fed each new line."""
        q: asyncio.Queue = asyncio.Queue(maxsize=1000)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subscribers.discard(q)

    def is_running(self) -> bool:
        return self._proc is not None and self._proc.returncode is None

    @property
    def supervised(self) -> bool:
        return self._supervise

    async def start(self, args: list[str]) -> None:
        if self.is_running() or self._watch_task:
            await self.stop()
        self._args = args
        self._wanted = True
        await self._spawn()
        if self._supervise:
            self._watch_task = asyncio.create_task(self._watch())

    async def _spawn(self) -> None:
        self._proc = await asyncio.create_subprocess_exec(
            *self._args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        self._started_at = time.monotonic()
        self._reader_task = asyncio.create_task(self._read_logs(self._proc))

    def _append(self, line: str) -> None:
        self._logs.append(line)
        if self._echo:
            print(f"cloudflared: {line}", flush=True)
        for q in list(self._subscribers):
            try:
                q.put_nowait(line)
            except asyncio.QueueFull:
                pass

    async def _read_logs(self, proc: asyncio.subprocess.Process) -> None:
        assert proc.stdout
        async for raw in proc.stdout:
            self._append(clean_line(raw.decode(errors="replace").rstrip("\n")))

    async def _watch(self) -> None:
        """Restart cloudflared when it exits while it is still wanted."""
        attempt = 0
        while self._wanted:
            proc = self._proc
            if proc is None:
                return
            code = await proc.wait()
            if not self._wanted or proc is not self._proc:
                return
            self.last_exit_code = code
            if time.monotonic() - self._started_at >= RESET_AFTER:
                attempt = 0
            delay = self._restart_delays[min(attempt, len(self._restart_delays) - 1)]
            attempt += 1
            self._append(f"[webgui] cloudflared exited (code {code}); restarting in {delay}s")
            await asyncio.sleep(delay)
            if not self._wanted or proc is not self._proc:
                return
            await self._spawn()
            self.restart_count += 1

    async def stop(self, timeout: int = 30) -> None:
        self._wanted = False
        watch = self._watch_task
        self._watch_task = None
        if watch and watch is not asyncio.current_task():
            watch.cancel()
        if not self._proc:
            return
        if self._proc.returncode is None:
            self._proc.send_signal(signal.SIGTERM)
            try:
                await asyncio.wait_for(self._proc.wait(), timeout=timeout)
            except asyncio.TimeoutError:
                self._proc.kill()
                await self._proc.wait()
        self._proc = None
        if self._reader_task:
            self._reader_task.cancel()
            self._reader_task = None

    async def restart(self) -> None:
        args = self._args
        await self.stop()
        await self.start(args)

    def recent_logs(self) -> list[str]:
        return list(self._logs)


DEFAULT_TOKEN_FILE = "/data/.tunnel_token"


def metrics_addr() -> str | None:
    """cloudflared metrics/readiness address from CF_METRICS_ADDR, or None.

    The chart sets it (127.0.0.1:20241) so the GUI status always knows where
    /ready is. Without it, cloudflared picks the first free port of
    20241-20245 by itself.
    """
    return os.environ.get("CF_METRICS_ADDR") or None


DEFAULT_METRICS_ADDR = "127.0.0.1:20241"


def effective_metrics_addr() -> str:
    """The address the app pins cloudflared's metrics to (CF_METRICS_ADDR, or
    127.0.0.1:20241). It stays on loopback: /config there exposes the ingress
    map."""
    return metrics_addr() or DEFAULT_METRICS_ADDR


def build_run_args(
    mode: str,
    binary: str = "cloudflared",
    token_file: str = DEFAULT_TOKEN_FILE,
    origincert: str = "/data/cert.pem",
    config: str = "/data/config.json",
    tunnel_name: str = "",
    post_quantum: bool = False,
    log_level: str = "info",
    metrics: str | None = None,
    run_parameters: list[str] | None = None,
) -> list[str]:
    """cloudflared argv. Token mode passes the token FILE, never the token:
    argv is readable by every process that can list the pod's processes.
    cloudflared reads the file and trims whitespace.
    """
    args = [binary, "tunnel", "--no-autoupdate"]
    if metrics:
        args.extend(["--metrics", metrics])
    if post_quantum:
        args.append("--post-quantum")
    if log_level and log_level != "info":
        args.extend(["--loglevel", log_level])
    # Tunnel-level flags go before `run`; they are allow-listed in the schema.
    args.extend(run_parameters or [])
    if mode == "token":
        args.extend(["run", "--token-file", token_file])
    else:
        args.extend(["--origincert", origincert, "--config", config,
                     "run", tunnel_name])
    return args


def autostart_args(
    cfg: dict,
    token: str | None,
    cert_exists: bool,
    tunnel_exists: bool,
    config_exists: bool,
    binary: str = "cloudflared",
    token_file: str = DEFAULT_TOKEN_FILE,
    metrics: str | None = None,
) -> list[str] | None:
    """Return cloudflared run args if the tunnel is fully configured, else None.

    Used at startup to auto-resume the tunnel after a pod restart. Token mode
    needs a stored token (only its presence is checked; cloudflared reads it
    from token_file); local mode needs the cert, tunnel credentials, and
    generated ingress config.
    """
    mode = cfg.get("mode", "local")
    if mode == "token":
        if not token:
            return None
        return build_run_args(
            mode="token", token_file=token_file, binary=binary,
            post_quantum=cfg.get("post_quantum", False),
            log_level=cfg.get("log_level", "info"),
            metrics=metrics,
            run_parameters=cfg.get("run_parameters") or [],
        )
    if cert_exists and tunnel_exists and config_exists:
        return build_run_args(
            mode="local", binary=binary,
            tunnel_name=cfg.get("tunnel_name", ""),
            post_quantum=cfg.get("post_quantum", False),
            log_level=cfg.get("log_level", "info"),
            metrics=metrics,
            run_parameters=cfg.get("run_parameters") or [],
        )
    return None
