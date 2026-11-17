"""cloudflared supervision in the PaaS edition (no container healthcheck to
restart it from outside): a child that exits while wanted is started again,
Stop ends the supervision, and the output can be echoed to stdout."""
import asyncio
import sys

import pytest

from backend.services.process_manager import ProcessManager


def _script(code: str) -> list[str]:
    return [sys.executable, "-c", code]


async def _wait_for(predicate, timeout=5.0):
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        if predicate():
            return True
        await asyncio.sleep(0.05)
    return False


@pytest.mark.asyncio
async def test_supervised_child_is_restarted_after_it_exits():
    pm = ProcessManager(supervise=True, restart_delays=(0.1,))
    await pm.start(_script("print('up', flush=True)"))
    try:
        assert await _wait_for(lambda: pm.restart_count >= 2)
        assert pm.last_exit_code == 0
        assert any("restarting in" in line for line in pm.recent_logs())
    finally:
        await pm.stop()


@pytest.mark.asyncio
async def test_stop_ends_supervision():
    pm = ProcessManager(supervise=True, restart_delays=(0.1,))
    await pm.start(_script("import time; time.sleep(30)"))
    await pm.stop(timeout=5)
    count = pm.restart_count
    await asyncio.sleep(0.4)
    assert not pm.is_running()
    assert pm.restart_count == count


@pytest.mark.asyncio
async def test_unsupervised_child_stays_down():
    pm = ProcessManager(supervise=False)
    await pm.start(_script("pass"))
    assert await _wait_for(lambda: not pm.is_running())
    await asyncio.sleep(0.3)
    assert not pm.is_running()
    assert pm.restart_count == 0


@pytest.mark.asyncio
async def test_start_while_supervised_replaces_the_child():
    pm = ProcessManager(supervise=True, restart_delays=(0.1,))
    await pm.start(_script("import time; time.sleep(30)"))
    first = pm._proc
    await pm.start(_script("import time; time.sleep(30)"))
    try:
        assert pm._proc is not first
        assert first.returncode is not None
        assert pm.is_running()
    finally:
        await pm.stop(timeout=5)


@pytest.mark.asyncio
async def test_echo_prints_redacted_lines(capsys):
    pm = ProcessManager(supervise=False, echo=True)
    await pm.start(_script("print('--token eyJhIjoiYWNjdCIsInQiOiJ0dW4iLCJzIjoic2VjcmV0In0', flush=True)"))
    assert await _wait_for(lambda: pm.recent_logs())
    await pm.stop()
    out = capsys.readouterr().out
    assert "cloudflared:" in out
    assert "eyJhIjoiYWNjdCIsInQiOiJ0dW4iLCJzIjoic2VjcmV0In0" not in out
