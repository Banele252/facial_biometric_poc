# Backend/app/routers/stream.py
"""Server-sent events for the management console.

SSE rather than WebSockets: the traffic is one-way (backend to console),
it survives proxies and load balancers as ordinary HTTP, and it reconnects
on its own. A WebSocket would add a second protocol to secure, log and
proxy for no gain here.

Auth note: the browser's native EventSource cannot set request headers, so
it can carry neither the bearer token nor the zero-trust headers this API
requires. The console therefore consumes this endpoint with fetch() and a
stream reader (see console/src/lib/eventStream.ts) rather than EventSource.
Do not "fix" that by accepting the token as a query parameter -- it would
land in access logs and proxy logs in cleartext.
"""
from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from Backend.app.services.events import subscribe

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/management", tags=["management"])

# Proxies and browsers drop idle connections. A comment frame well inside
# the usual 60s idle timeout keeps the stream alive without waking the
# client's event handlers.
KEEPALIVE_SECONDS = 20


@router.get("/stream")
async def stream_events(request: Request) -> StreamingResponse:
    async def event_source():
        # Tell the client how long to wait before reconnecting after a drop.
        yield "retry: 3000\n\n"

        events = subscribe()

        try:
            while True:
                if await request.is_disconnected():
                    break

                try:
                    message = await asyncio.wait_for(
                        events.__anext__(),
                        timeout=KEEPALIVE_SECONDS,
                    )
                except asyncio.TimeoutError:
                    # Comment frame: keeps the connection warm, ignored by
                    # the client parser.
                    yield ": keepalive\n\n"
                    continue
                except StopAsyncIteration:
                    break

                parsed = json.loads(message)
                yield f"event: {parsed['type']}\n"
                yield f"data: {json.dumps(parsed['payload'])}\n\n"
        except asyncio.CancelledError:
            raise
        finally:
            await events.aclose()
            logger.debug("Console event stream closed")

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            # Defeats nginx response buffering, which otherwise holds each
            # event until the buffer fills and makes the stream look dead.
            "X-Accel-Buffering": "no",
        },
    )
