"""Service layer: pluggable storage, liveness and notifications.

Each service exposes a small interface plus a config-driven factory so the
default hackathon behaviour is dependency-free, while the CARB-intended
implementations (Azure Blob, Azure AI Face, email/SMS) can slot in by setting
environment variables without touching the routers.
"""
