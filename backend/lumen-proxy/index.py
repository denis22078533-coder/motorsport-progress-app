import json
import urllib.request
import urllib.error
import re


# Известные алиасы: если пользователь вводит proxyapi.ru — используем правильный API-домен
PROXYAPI_ALIASES = {"proxyapi.ru", "www.proxyapi.ru", "api.proxyapi.ru"}


def normalize_base_url(raw: str, fallback: str) -> str:
    url = (raw or "").strip().rstrip("/")
    if not url:
        return fallback
    # Добавляем схему если нет
    if not re.match(r"^https?://", url):
        url = "https://" + url
    # Убираем двойные слеши (кроме ://)
    url = re.sub(r"(?<!:)/{2,}", "/", url)
    return url.rstrip("/")


def build_openai_endpoint(raw_base: str) -> str:
    url = normalize_base_url(raw_base, "https://api.proxyapi.ru/openai/v1")

    # Специальная обработка proxyapi.ru — правильный путь жёстко прописан
    parsed_host = re.sub(r"^https?://", "", url).split("/")[0].lower()
    if parsed_host in PROXYAPI_ALIASES:
        return "https://api.proxyapi.ru/openai/v1/chat/completions"

    # Для остальных: если уже содержит /chat/completions — не трогаем
    if url.endswith("/chat/completions"):
        return url
    # Если заканчивается на /v1 — добавляем /chat/completions
    if url.endswith("/v1"):
        return url + "/chat/completions"
    # Иначе добавляем /v1/chat/completions
    return url + "/v1/chat/completions"


def build_claude_endpoint(raw_base: str) -> str:
    url = normalize_base_url(raw_base, "https://api.anthropic.com/v1")

    parsed_host = re.sub(r"^https?://", "", url).split("/")[0].lower()
    if parsed_host in PROXYAPI_ALIASES:
        return "https://api.proxyapi.ru/anthropic/v1/messages"

    if url.endswith("/messages"):
        return url
    if url.endswith("/v1"):
        return url + "/messages"
    return url + "/v1/messages"


def handler(event: dict, context) -> dict:
    """Проксирует запросы к OpenAI/Claude API. api_key и base_url берутся из тела запроса."""

    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers, "body": ""}

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return {"statusCode": 400, "headers": cors_headers, "body": json.dumps({"error": "Invalid JSON body"})}

    provider = body.pop("__provider__", "openai")
    api_key = (body.pop("__api_key__", "") or "").strip()
    raw_base = (body.pop("__base_url__", "") or "").strip()

    if provider == "openai":
        endpoint = build_openai_endpoint(raw_base)
        req_headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {api_key}",
        }
    else:
        endpoint = build_claude_endpoint(raw_base)
        req_headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        }

    print(f"[lumen-proxy] provider={provider} endpoint={endpoint}")

    payload = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(endpoint, data=payload, headers=req_headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            resp_body = resp.read().decode("utf-8")
            try:
                resp_data = json.loads(resp_body)
                resp_data["__endpoint__"] = endpoint
                return {"statusCode": 200, "headers": cors_headers, "body": json.dumps(resp_data)}
            except Exception:
                return {"statusCode": 200, "headers": cors_headers, "body": resp_body}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            err_data = json.loads(err_body)
            err_data["__endpoint__"] = endpoint
            err_body = json.dumps(err_data)
        except Exception:
            err_body = json.dumps({"error": err_body[:500], "__endpoint__": endpoint})
        return {"statusCode": e.code, "headers": cors_headers, "body": err_body}
    except Exception as e:
        return {
            "statusCode": 502,
            "headers": cors_headers,
            "body": json.dumps({"error": str(e), "__endpoint__": endpoint}),
        }
