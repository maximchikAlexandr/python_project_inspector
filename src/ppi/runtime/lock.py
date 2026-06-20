"""Per-project write lock with stale-lock recovery."""

from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path


def _read_lock_pid(path: Path) -> int | None:
    """Read lock pid when the file exists."""
    if not path.is_file():
        return None
    try:
        return int(path.read_text(encoding="utf-8").strip())
    except ValueError:
        return None


def _pid_alive(pid: int) -> bool:
    """Return whether a process id is alive."""
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def is_locked(lock_file: Path) -> bool:
    """Return True when an active writer holds the lock."""
    pid = _read_lock_pid(lock_file)
    if pid is None:
        return False
    if _pid_alive(pid):
        return True
    lock_file.unlink(missing_ok=True)
    return False


@contextmanager
def write_lock(lock_file: Path):
    """Acquire an exclusive write lock for one project store."""
    lock_file.parent.mkdir(parents=True, exist_ok=True)
    if is_locked(lock_file):
        pid = _read_lock_pid(lock_file)
        raise RuntimeError(f"Analysis store is locked by pid {pid if pid is not None else 'unknown'}")
    try:
        fd = os.open(str(lock_file), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        if is_locked(lock_file):
            pid = _read_lock_pid(lock_file)
            raise RuntimeError(
                f"Analysis store is locked by pid {pid if pid is not None else 'unknown'}",
            ) from None
        lock_file.unlink(missing_ok=True)
        fd = os.open(str(lock_file), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(str(os.getpid()))
    try:
        yield
    finally:
        lock_file.unlink(missing_ok=True)
