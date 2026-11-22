"""Log-in for the client's workspace: salted PBKDF2 password hashes, server-side sessions in an HttpOnly cookie."""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import time

from .config import env
from .store import Store

COOKIE = "vetted_session"
SESSION_DAYS = 7

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,            -- admin | approver | analyst
    password_hash TEXT NOT NULL,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    created_at REAL NOT NULL,
    expires_at REAL NOT NULL
);
"""


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return f"pbkdf2${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, dk = stored.split("$")
    except ValueError:
        return False
    return hmac.compare_digest(hash_password(password, bytes.fromhex(salt)).split("$")[2], dk)


def setup(store: Store) -> None:
    store.conn.executescript(SCHEMA)
    # accounts from the environment: APP_USERS="email|password|Name|role;..." plus a public demo account
    seeds = []
    for part in (env("APP_USERS") or "").split(";"):
        bits = [b.strip() for b in part.split("|")]
        if len(bits) == 4 and bits[0] and bits[1]:
            seeds.append(bits)
    demo_pw = env("DEMO_PASSWORD", "vetted-demo")
    if demo_pw:
        seeds.append(["demo@vetted.example", demo_pw, "Demo vendor desk", "approver"])
    for email, pw, name, role in seeds:
        row = store.q("SELECT password_hash FROM users WHERE email=?", (email.lower(),))
        if not row or not verify_password(pw, row[0]["password_hash"]):
            store.x("INSERT OR REPLACE INTO users VALUES (?,?,?,?,?)", (email.lower(), name, role, hash_password(pw), time.time()))


def login(store: Store, email: str, password: str) -> tuple[str, dict] | None:
    row = store.q("SELECT * FROM users WHERE email=?", ((email or "").strip().lower(),))
    if not row or not verify_password(password or "", row[0]["password_hash"]):
        return None
    token = secrets.token_urlsafe(32)
    now = time.time()
    store.x("INSERT INTO sessions VALUES (?,?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), row[0]["email"], now, now + SESSION_DAYS * 86400))
    return token, public_user(dict(row[0]))


def user_for(store: Store, token: str | None) -> dict | None:
    if not token:
        return None
    rows = store.q("""SELECT u.* FROM sessions s JOIN users u ON u.email = s.email
                      WHERE s.token_hash=? AND s.expires_at > ?""", (hashlib.sha256(token.encode()).hexdigest(), time.time()))
    return public_user(dict(rows[0])) if rows else None


def logout(store: Store, token: str | None) -> None:
    if token:
        store.x("DELETE FROM sessions WHERE token_hash=?", (hashlib.sha256(token.encode()).hexdigest(),))


def public_user(u: dict) -> dict:
    return {"email": u["email"], "name": u["name"], "role": u["role"]}
