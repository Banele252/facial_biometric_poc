"""Local development entrypoint.

Runs the API with autoreload. This file previously duplicated the VerifyNow
script in Backend/external_backend/main.py verbatim; that logic now lives there
as importable functions, so this is the dev server launcher.

    uv run python main.py

In the container the app is served by uvicorn directly — see the Dockerfile.
"""

import os

import uvicorn
from dotenv import load_dotenv


def main() -> None:
    load_dotenv(override=True)
    uvicorn.run(
        "Backend.app.main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        reload=True,
    )


if __name__ == "__main__":
    main()
