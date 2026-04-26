import json
import urllib.request
import urllib.error
import re


def clean_base_url(raw: str, fallback: str) -> str:
    url = (raw or "").strip().rstrip("/")
    if not url:
        return fallback
    if not re.match(r"^https?://", url):
        url = "https://" + url
    # collapse double slashes but keep ://
    url = re.sub(r"(?<!:)/{2,}", "/", url)
    return url.rstrip("/")


def handler(event: dict, context) -> dict:
    """Проксирует запросы к OpenAI-совместимым API. api_key и base_url берутся из тела запроса."""

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

    # Извлекаем служебные поля из тела (не передаём в API)
    provider = body.pop("__provider__", "openai")
    api_key = (body.pop("__api_key__", "") or "").strip()
    raw_base = (body.pop("__base_url__", "") or "").strip()

    if provider == "openai":
        base_url = clean_base_url(raw_base, "https://proxyapi.ru")
        # proxyapi.ru уже имеет /v1 внутри — добавляем /v1 только если нет
        if base_url.rstrip("/").endswith("/v1"):
            endpoint = base_url.rstrip("/") + "/chat/completions"
        else:
            endpoint = base_url + "/v1/chat/completions"
        req_headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }
    else:
        base_url = clean_base_url(raw_base, "https://api.anthropic.com")
        if base_url.rstrip("/").endswith("/v1"):
            endpoint = base_url.rstrip("/") + "/messages"
        else:
            endpoint = base_url + "/v1/messages"
        req_headers = {
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        }

    print(f"[lumen-proxy] provider={provider} endpoint={endpoint}")

    payload = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(endpoint, data=payload, headers=req_headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            resp_body = resp.read().decode("utf-8")
            resp_data = json.loads(resp_body)
            resp_data["__endpoint__"] = endpoint
            return {"statusCode": 200, "headers": cors_headers, "body": json.dumps(resp_data)}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        # Пробуем добавить endpoint для диагностики
        try:
            err_data = json.loads(err_body)
            err_data["__endpoint__"] = endpoint
            err_body = json.dumps(err_data)
        except Exception:
            err_body = json.dumps({"error": err_body, "__endpoint__": endpoint})
        return {"statusCode": e.code, "headers": cors_headers, "body": err_body}
    except Exception as e:
        return {
            "statusCode": 502,
            "headers": cors_headers,
            "body": json.dumps({"error": str(e), "__endpoint__": endpoint}),
        }
