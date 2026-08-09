"""Generate RSA key pair for JWT signing and emit .env.example.

Run:
    python Backend/scripts/generate_keys.py ./keys
"""

import os
import sys
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa


def generate_keys(output_dir: str = "./keys") -> None:
    """Generate RSA key pair and write .env.example."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()

    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    # Write raw keys
    (out / "private.pem").write_bytes(private_pem)
    (out / "public.pem").write_bytes(public_pem)

    # Build env file safely (avoid backslash in f-string for py311)
    private_b64 = private_pem.decode().strip().replace("\n", "\\n")
    public_b64 = public_pem.decode().strip().replace("\n", "\\n")

    env_lines = [
        "# JWT Configuration",
        f'JWT_PRIVATE_KEY="{private_b64}"',
        f'JWT_PUBLIC_KEY="{public_b64}"',
        "JWT_ALGORITHM=RS256",
        "JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60",
        "",
        "# Sandbox API Key (rotate weekly)",
        f"SANDBOX_API_KEY=sbx-ak-2026-08-05-{os.urandom(4).hex()}",
        f"ADMIN_API_KEY=admin-{os.urandom(8).hex()}",
        "",
        "# Environment",
        "ENV=development",
        "VERIFY_MODE=sandbox",
        "",
        "# Redis",
        "REDIS_URL=redis://localhost:6379/0",
        "",
    ]

    env_path = out / ".env.example"
    env_path.write_text("\n".join(env_lines), encoding="utf-8")
    print(f"Keys written to {out.resolve()}")


if __name__ == "__main__":
    output = sys.argv[1] if len(sys.argv) > 1 else "./keys"
    generate_keys(output)
