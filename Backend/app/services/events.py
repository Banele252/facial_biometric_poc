# Backend/app/services/events.py
"""In-process event bus feeding the console's SSE stream.

`Backend.app.routers.stream` consumes `subscribe()`; the rest of the app
calls `publish()` when something the console renders has changed. The
payload is deliberately a *summary*, not the rows: the console reacts by
invalidating a React Query key and refetching through the normal
authenticated, scope-checked endpoint, so audit data has exactly one read
path rather than two that can disagree (see console/src/hooks/useLiveEvents.ts).

Event types are a contract with that hook's INVALIDATES map:

    audit.batch      -> audit-logs, fraud-intelligence, transactions
    fraud.decision   -> fraud-intelligence, audit-logs
    simswap.status   -> transactions, audit-logs

SCOPE: this bus is per-process. With more than one replica, a subscriber
only sees events raised by the replica holding its connection, so a console
attached to replica A stays stale until its poll backstop fires. That is
acceptable here because the stream is an optimisation over polling, never
the only path — but it is the reason to reach for Redis pub/sub rather than
this module if the stream ever becomes load-bearing.
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from typing import Any

logger = logging.getLogger(__name__)

# A slow or wedged console must not grow the publisher's memory without
# bound. At this depth the queue holds far more than the console can fall
# behind by in normal use; past it, the oldest event is dropped, because a
# stale event is worth less than a fresh one and the client refetches from
# the API regardless.
MAX_QUEUE_DEPTH = 100

_subscribers: set[asyncio.Queue[str]] = set()


def publish(event_type: str, payload: dict[str, Any] | None = None) -> None:
    """Fan an event out to every live subscriber.

    Non-blocking and never raises: publishing is a side effect of a request
    that has already succeeded, so a failure here must not turn a completed
    SIM swap into a 500 for the customer.
    """
    if not _subscribers:
        return

    message = json.dumps({"type": event_type, "payload": payload or {}})

    for queue in list(_subscribers):
        try:
            queue.put_nowait(message)
        except asyncio.QueueFull:
            # Drop the oldest, then retry once. If the queue drains between
            # the two calls the retry simply succeeds.
            try:
                queue.get_nowait()
                queue.put_nowait(message)
            except (asyncio.QueueEmpty, asyncio.QueueFull):
                logger.warning(
                    "events.publish.dropped type=%s reason=subscriber_backlogged",
                    event_type,
                )
        except Exception:  # pragma: no cover - defensive
            logger.exception("events.publish.failed type=%s", event_type)


async def subscribe() -> AsyncIterator[str]:
    """Yield JSON event strings until the consumer closes the generator.

    The queue is registered before the first yield so that events raised
    between subscribing and the first read are buffered rather than lost.
    """
    queue: asyncio.Queue[str] = asyncio.Queue(maxsize=MAX_QUEUE_DEPTH)
    _subscribers.add(queue)
    logger.debug("events.subscribe count=%d", len(_subscribers))

    try:
        while True:
            yield await queue.get()
    finally:
        _subscribers.discard(queue)
        logger.debug("events.unsubscribe count=%d", len(_subscribers))


def subscriber_count() -> int:
    """Number of live console streams. Used by tests and /readyz."""
    return len(_subscribers)
