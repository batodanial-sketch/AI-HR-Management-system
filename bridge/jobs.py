"""Fluxentiq bridge — in-memory background job queue.

Provides async background-task execution for long-running bridge work (web
scraping, FX fetches, lead enrichment) without blocking the HTTP event loop or
adding an external broker (Redis/Celery). Jobs are tracked in a bounded,
lock-guarded registry so Next.js Server Actions can poll ``GET /api/jobs/{id}``
for status/results.

Design notes
    * ``dispatch`` returns a :class:`Job` immediately (status ``pending``) and
      schedules the work on the running event loop — the caller returns HTTP 202
      with the ``job_id`` right away.
    * Work is expected to be an ``async`` callable; blocking I/O (e.g.
      ``urllib`` scraping) should be wrapped in ``asyncio.to_thread`` by the
      caller so the event loop is never blocked.
    * The registry is bounded (oldest finished jobs are evicted first) so a
      long-running process cannot grow the job map without limit.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

# A task factory: an async callable producing the job's result.
JobFn = Callable[[], Awaitable[Any]]


@dataclass
class Job:
    id: str
    kind: str
    status: str  # pending | running | completed | failed
    created_at: float
    started_at: float | None = None
    finished_at: float | None = None
    result: Any = None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """JSON-safe snapshot returned to pollers."""
        return {
            "job_id": self.id,
            "kind": self.kind,
            "status": self.status,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "result": self.result,
            "error": self.error,
        }


class JobRegistry:
    """Thread-safe (asyncio) registry of background jobs."""

    def __init__(self, max_jobs: int = 1000) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = asyncio.Lock()
        self._max_jobs = max_jobs

    async def create(self, kind: str) -> Job:
        job = Job(
            id=uuid.uuid4().hex,
            kind=kind,
            status="pending",
            created_at=time.time(),
        )
        async with self._lock:
            self._jobs[job.id] = job
            self._evict_if_needed()
        return job

    async def get(self, job_id: str) -> Job | None:
        async with self._lock:
            return self._jobs.get(job_id)

    async def set_status(self, job_id: str, status: str) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is not None:
                job.status = status

    async def complete(self, job_id: str, result: Any) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is not None:
                job.status = "completed"
                job.result = result
                job.finished_at = time.time()

    async def fail(self, job_id: str, error: str) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is not None:
                job.status = "failed"
                job.error = error
                job.finished_at = time.time()

    async def queue_depth(self) -> int:
        """Number of in-flight (pending/running) jobs."""
        async with self._lock:
            return sum(1 for j in self._jobs.values() if j.status in {"pending", "running"})

    async def _evict_if_needed(self) -> None:
        """Drop oldest *finished* jobs once the registry exceeds its bound."""
        if len(self._jobs) <= self._max_jobs:
            return
        finished = [
            (job.finished_at or job.created_at, job.id)
            for job in self._jobs.values()
            if job.status in {"completed", "failed"}
        ]
        finished.sort()
        for _ts, job_id in finished:
            if len(self._jobs) <= self._max_jobs:
                break
            self._jobs.pop(job_id, None)


async def dispatch(registry: JobRegistry, kind: str, fn: JobFn) -> Job:
    """Creates a job and schedules ``fn`` to run in the background."""
    job = await registry.create(kind)

    async def _run() -> None:
        await registry.set_status(job.id, "running")
        job.started_at = time.time()
        try:
            result = await fn()
            await registry.complete(job.id, result)
        except Exception as exc:  # noqa: BLE001 — capture + surface to pollers
            await registry.fail(job.id, str(exc))

    asyncio.create_task(_run())
    return job


# Process-wide registry shared by server.py and the engine router, so
# background jobs dispatched from either surface are pollable via the same
# ``GET /api/jobs/{id}`` endpoint.
default_registry = JobRegistry()

