"""
Mock RICA registration service.

A stand-in for South Africa's RICA (SIM registration) database: stores which
ID number + full name a given MSISDN is registered to, plus the most recent
new SIM number issued to it via a SIM swap. Exists so the SIM swap flow
(Backend/sim_swap_service) has something real to check a swap request
against instead of trusting the caller's claims outright.

Run locally with (from this directory):
    uv run uvicorn main:app --reload

Then open http://127.0.0.1:8000/docs for interactive Swagger docs.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from db import get_db
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from store import get_by_msisdn, list_records, upsert_record, verify

load_dotenv()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    get_db()  # creates rica_records if it doesn't exist yet
    yield


app = FastAPI(title="Mock RICA Service API", version="0.1.0", lifespan=lifespan)


class RicaRecordRequest(BaseModel):
    id_number: str = Field(..., min_length=1, max_length=32)
    full_name: str = Field(..., min_length=1, max_length=200)
    msisdn: str = Field(..., min_length=1, max_length=32)
    new_sim_number: str | None = Field(default=None, max_length=32)


class VerifyRequest(BaseModel):
    id_number: str = Field(..., min_length=1, max_length=32)
    full_name: str = Field(..., min_length=1, max_length=200)
    msisdn: str = Field(..., min_length=1, max_length=32)


@app.post("/api/v1/rica/records", status_code=201)
async def create_or_update_record(payload: RicaRecordRequest) -> dict[str, Any]:
    """Seed or update a mock RICA registration.

    Returns the stored record so a successful call is immediately visible -
    this is what to check when testing that data was parsed and saved.
    """
    record = upsert_record(
        id_number=payload.id_number,
        full_name=payload.full_name,
        msisdn=payload.msisdn,
        new_sim_number=payload.new_sim_number,
    )
    return {"status": "stored", "record": record}


@app.get("/api/v1/rica/records")
async def list_all_records() -> dict[str, Any]:
    return {"records": list_records()}


@app.get("/api/v1/rica/records/{msisdn}")
async def get_record(msisdn: str) -> dict[str, Any]:
    record = get_by_msisdn(msisdn)
    if record is None:
        raise HTTPException(status_code=404, detail="No RICA record for this msisdn.")
    return record


@app.post("/api/v1/rica/verify")
async def verify_record(payload: VerifyRequest) -> dict[str, Any]:
    """Check a claimed id_number + full_name against the RICA record for msisdn."""
    return verify(id_number=payload.id_number, full_name=payload.full_name, msisdn=payload.msisdn)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
