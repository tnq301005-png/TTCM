"""Backend cho Bếp thông minh.
Chạy từ thư mục gốc dự án:
    uvicorn api.main:app --port 8000
rồi mở http://localhost:8000
"""
import hashlib
import hmac
import os
import secrets
import sqlite3
import time
import itertools
from fastapi.responses import StreamingResponse
from typing import List, Optional, Union

from fastapi import Cookie, FastAPI, HTTPException, Response
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from . import llm


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv
load_dotenv(os.path.join(ROOT, ".env")) #đọc key từ .env
MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
DB_PATH = os.path.join(ROOT, "users.db")

app = FastAPI(title="Bếp thông minh API")

# Cho phép trang web mở từ công cụ khác (Live Server cổng 5500...) vẫn gọi được API này, kể cả đăng nhập (cookie).
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)


# Lỗi cơ sở dữ liệu (ví dụ users.db bị khóa / chỉ đọc) -> trả JSON có nội dung để giao diện hiện ra
@app.exception_handler(sqlite3.Error)
def db_error(request, exc):
    return JSONResponse({"detail": f"Database error: {exc}"}, status_code=500)


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at REAL NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at REAL NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    conn.commit()
    conn.close()


init_db()


def hash_password(password: str, salt: bytes | None = None):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
    return salt.hex() + ":" + digest.hex()


def verify_password(password: str, stored: str):
    try:
        salt_hex, digest_hex = stored.split(":", 1)
        salt = bytes.fromhex(salt_hex)
        check = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
        return hmac.compare_digest(check.hex(), digest_hex)
    except Exception:
        return False


def current_user(session: str | None):
    if not session:
        return None
    conn = db()
    row = conn.execute("""
        SELECT u.id, u.username, u.email
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > ?
    """, (session, time.time())).fetchone()
    conn.close()
    return dict(row) if row else None


class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    email: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=128)


@app.post("/api/register")
def register(body: RegisterIn, response: Response):
    username = body.username.strip()
    email = body.email.strip().lower()

    if not re_fullmatch(r"[A-Za-z0-9_]+", username):
        raise HTTPException(400, "Tên đăng nhập chỉ được gồm chữ, số và dấu gạch dưới.")
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(400, "Email không hợp lệ.")

    conn = db()
    if conn.execute("SELECT 1 FROM users WHERE lower(username)=lower(?)", (username,)).fetchone():
        conn.close()
        raise HTTPException(409, "username_taken")
    if conn.execute("SELECT 1 FROM users WHERE lower(email)=lower(?)", (email,)).fetchone():
        conn.close()
        raise HTTPException(409, "email_taken")

    cur = conn.execute(
        "INSERT INTO users(username,email,password_hash,created_at) VALUES(?,?,?,?)",
        (username, email, hash_password(body.password), time.time())
    )
    user_id = cur.lastrowid
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)",
        (token, user_id, time.time() + 7 * 24 * 3600)
    )
    conn.commit()
    conn.close()

    response.set_cookie(
        "session", token, httponly=True, samesite="lax",
        max_age=7 * 24 * 3600, path="/"
    )
    return {"ok": True, "username": username, "email": email}


@app.post("/api/login")
def login(body: LoginIn, response: Response):
    identity = body.username.strip()
    conn = db()
    row = conn.execute(
        "SELECT id, username, email, password_hash FROM users WHERE lower(username)=lower(?) OR lower(email)=lower(?)",
        (identity, identity)
    ).fetchone()

    if not row or not verify_password(body.password, row["password_hash"]):
        conn.close()
        raise HTTPException(401, "Tên đăng nhập/email hoặc mật khẩu không đúng.")

    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)",
        (token, row["id"], time.time() + 7 * 24 * 3600)
    )
    conn.commit()
    conn.close()

    response.set_cookie(
        "session", token, httponly=True, samesite="lax",
        max_age=7 * 24 * 3600, path="/"
    )
    return {"ok": True, "username": row["username"], "email": row["email"]}


@app.post("/api/logout")
def logout(response: Response, session: str | None = Cookie(default=None)):
    if session:
        conn = db()
        conn.execute("DELETE FROM sessions WHERE token=?", (session,))
        conn.commit()
        conn.close()
    response.delete_cookie("session", path="/")
    return {"ok": True}


@app.get("/api/me")
def me(session: str | None = Cookie(default=None)):
    user = current_user(session)
    return {"logged_in": bool(user), "user": user}


class Turn(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=8000)


class GenIn(BaseModel):
    input: Union[str, List[Turn]]

    @field_validator("input")
    @classmethod
    def check(cls, v):
        if isinstance(v, str):
            if not 1 <= len(v.strip()) <= 8000:
                raise ValueError("input must be 1-8000 characters")
        elif not 1 <= len(v) <= 20 or v[-1].role != "user":
            raise ValueError("invalid conversation (1-20 turns, ending with a user turn)")
        return v


@app.get("/api/health")
def health():
    return {"ai": bool(os.environ.get("GEMINI_API_KEY"))}


@app.post("/api/generate")
def generate(body: GenIn):
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise HTTPException(503, "GEMINI_API_KEY is not configured on the server")
    from google import genai
    contents = body.input if isinstance(body.input, str) else [
        {"role": "user" if t.role == "user" else "model", "parts": [{"text": t.content}]}
        for t in body.input
    ]
    client = genai.Client(api_key=key)  # giữ client trong biến để kết nối không bị đóng sớm
    try:
        r = client.models.generate_content(
            model=MODEL, contents=contents
        )
        return {"text": r.text or ""}
    except Exception as e:
        raise HTTPException(
            429 if ("429" in str(e) or "RESOURCE_EXHAUSTED" in str(e)) else 502,
            "AI service error or overloaded, please retry"
        )

#call AI công thức
class IngIn(BaseModel):
    food: str = Field(max_length=120)
    quantity: Optional[float] = None
    measure: Optional[str] = Field(default=None, max_length=40)


class RecipeIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    servings: float = Field(gt=0, le=60)
    ingredients: List[IngIn] = Field(min_length=1, max_length=80)

@app.post("/api/recipe-ai-stream")
def recipe_ai_stream(body: RecipeIn, session: str | None = Cookie(default=None)):
    if not current_user(session):
        raise HTTPException(401, "Vui lòng đăng nhập để tạo công thức.")
    stream = llm.stream_recipe(body.model_dump())
    try:
        first = next(stream)   # lấy mẩu chữ đầu tiên; nếu lỗi thì báo đúng mã HTTP
    except llm.AIError as e:
        raise HTTPException(e.status, e.message)
    except StopIteration:
        raise HTTPException(502, "The AI reply was empty, please retry.")
    return StreamingResponse(itertools.chain([first], stream),
                             media_type="text/plain; charset=utf-8",
                             headers={"Cache-Control": "no-cache"})


@app.get("/api/recipe-videos")
def recipe_videos(name: str, session: str | None = Cookie(default=None)):
    if not current_user(session):
        raise HTTPException(401, "Vui lòng đăng nhập.")
    return llm.find_videos(name[:200])


def re_fullmatch(pattern, value):
    import re
    return re.fullmatch(pattern, value) is not None


app.mount("/", StaticFiles(directory=os.path.join(ROOT, "web"), html=True), name="web")
