import hashlib
import json
import os
import threading
import time
import re

# Quá thời gian này (giây) mà Gemini chưa xong thì coi như lỗi.
GEMINI_TIMEOUT_SEC = 30

# Thư mục lưu cache 
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
# Đổi chuỗi này khi bạn sửa prompt, để cache cũ không còn được dùng.
CACHE_VERSION = "v3-stream"

_client = None


def _get_client(key: str):
    """Tạo Gemini client MỘT lần rồi dùng lại, để kết nối không bị đóng giữa chừng."""
    global _client
    if _client is None:
        from google import genai
        from google.genai import types
        _client = genai.Client(
            api_key=key,
            http_options=types.HttpOptions(timeout=GEMINI_TIMEOUT_SEC * 1000),  # đơn vị: mili giây
        )
    return _client


SYSTEM_PROMPT = (
    "You are a helpful chef. Write a clear, practical recipe for the dish using ONLY the ingredient "
    "list and amounts given, already scaled to the requested servings. Do not change the amounts. "
    "You may add water and basic seasonings (salt, pepper, cooking oil), but say they are optional. "
    "Include times and temperatures where needed. "
    "Use EXACTLY this plain-text format and nothing else (no markdown symbols such as ** or #):\n"
    "Line 1: one or two sentences describing the dish.\n"
    "Line 2: a line like 'Prep: 15 min | Cook: 30 min' (leave out a part you do not know).\n"
    "Then a line that says 'Steps:' followed by numbered lines like '1. ...' (at most 8 steps, "
    "one or two sentences each).\n"
    "Then a line that says 'Tips:' followed by lines starting with '- ' (at most 3 short tips).\n"
    "Optionally a last line starting with 'Notes:'."
)


class AIError(Exception):
    """Lỗi có kèm mã HTTP để main.py trả về cho trình duyệt."""
    def __init__(self, status: int, message: str):
        self.status, self.message = status, message


# ---------- Cache (lưu file JSON) ----------
def _cache_path(prefix: str, text: str) -> str:
    h = hashlib.sha256(f"{CACHE_VERSION}|{text}".encode("utf-8")).hexdigest()[:24]
    return os.path.join(CACHE_DIR, f"{prefix}_{h}.json")


def _cache_get(path: str):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _cache_set(path: str, data) -> None:
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        tmp = f"{path}.{threading.get_ident()}.tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, path)          # ghi nguyên tử, tránh file hỏng khi 2 người gọi cùng lúc
    except OSError:
        pass                           # không ghi được cache thì thôi, không làm hỏng kết quả


def _dish_text(r: dict) -> str:
    lines = []
    for i in r["ingredients"]:
        measure = i.get("measure") if i.get("measure") != "<unit>" else ""
        lines.append(re.sub(r"\s+", " ", f"- {i.get('quantity') or ''} {measure or ''} {i['food']}"))
    return (f"Dish: {r['name']}\nServings: {r['servings']}\n"
            f"Ingredients (already scaled to {r['servings']} servings):\n" + "\n".join(lines))


# ---------- Gọi Gemini ở chế độ stream ----------
def _gemini_stream(instructions: str, prompt: str):
    """Trả về (yield) từng mẩu chữ khi Gemini viết tới đâu."""
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise AIError(503, "GEMINI_API_KEY is not configured on the server")
    from google.genai import types

    client = _get_client(key)
    # Model chính (lần đầu) và model dự phòng (các lần thử lại khi model chính quá tải hoặc quá chậm).
    main_model = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash")
    backup_model = os.environ.get("GEMINI_FALLBACK_MODEL", main_model)
    thinking_off = True      # thử tắt "thinking" cho nhanh; model nào không cho thì tự bỏ qua
    started = time.time()
    for attempt in range(3):
        model = main_model if attempt == 0 else backup_model
        config = types.GenerateContentConfig(
            system_instruction=instructions,
            thinking_config=types.ThinkingConfig(thinking_budget=0) if thinking_off else None,
        )
        got_any = False
        try:
            for chunk in client.models.generate_content_stream(
                    model=model, contents=prompt, config=config):
                piece = chunk.text or ""
                if piece:
                    if not got_any:
                        print(f"[recipe] first text after {time.time() - started:.1f}s (model: {model})")
                    got_any = True
                    yield piece
            print(f"[recipe] finished after {time.time() - started:.1f}s")
            return
        except Exception as e:
            print("GEMINI ERROR (recipe):", repr(e))
            msg = str(e)
            if not got_any:
                if thinking_off and "thinking" in msg.lower():
                    thinking_off = False      # model này không cho tắt thinking -> thử lại không tắt
                    continue
                busy = any(w in msg for w in ("503", "504", "UNAVAILABLE", "timed out"))
                if busy and attempt < 2:
                    time.sleep(1)
                    continue
            limited = "429" in msg or "RESOURCE_EXHAUSTED" in msg
            raise AIError(429 if limited else 502,
                          "AI service is busy, please retry" if limited else "AI service error, please retry")
    raise AIError(502, "AI service error, please retry")

# ---------- Hàm main.py gọi: công thức dạng stream ----------
def stream_recipe(r: dict):
    cp = _cache_path("recipetext", _dish_text(r))
    cached = _cache_get(cp)
    if cached and cached.get("text"):
        yield cached["text"]                       # có sẵn trong cache -> trả cả công thức một lần, không gọi AI
        return

    parts = []
    try: 
        for piece in _gemini_stream(SYSTEM_PROMPT, _dish_text(r)):
            parts.append(piece)
            yield piece
    except AIError:
        if not parts:
            raise                                  # chưa có chữ nào -> để main.py trả mã lỗi cho trình duyệt
        yield "\n\nNotes: The recipe was cut off. Please press the button again."
        return                                     # viết dở thì KHÔNG lưu cache

    text = "".join(parts)
    if text.strip():
        _cache_set(cp, {"text": text})
