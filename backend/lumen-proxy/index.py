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
    url = re.sub(r"/+", "/", url.replace("://", "|||")).replace("|||", "://")
    return url


def handler(event: dict, context) -> dict:
    """Проксирует запросы к OpenAI-совместимым API (ProxyAPI и др.) для обхода CORS."""

    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Api-Key, X-Base-Url",
        "Content-Type": "application/json",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers, "body": ""}

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return {"statusCode": 400, "headers": cors_headers, "body": json.dumps({"error": "Invalid JSON body"})}

    headers = event.get("headers") or {}
    api_key = (headers.get("x-api-key") or headers.get("X-Api-Key") or "").strip()
    raw_base = headers.get("x-base-url") or headers.get("X-Base-Url") or ""
    provider = body.pop("__provider__", "openai")

    if provider == "openai":
        base_url = clean_base_url(raw_base, "https://proxyapi.ru")
        if base_url.endswith("/v1"):
            endpoint = f"{base_url}/chat/completions"
        else:
            endpoint = f"{base_url}/v1/chat/completions"
        req_headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }
    else:
        base_url = clean_base_url(raw_base, "https://api.anthropic.com")
        if base_url.endswith("/v1"):
            endpoint = f"{base_url}/messages"
        else:
            endpoint = f"{base_url}/v1/messages"
        req_headers = {
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        }

    print(f"[lumen-proxy] endpoint={endpoint} provider={provider}")

    payload = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(endpoint, data=payload, headers=req_headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            resp_body = resp.read().decode("utf-8")
            return {"statusCode": 200, "headers": cors_headers, "body": resp_body}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        return {"statusCode": e.code, "headers": cors_headers, "body": err_body}
    except Exception as e:
        return {"statusCode": 502, "headers": cors_headers, "body": json.dumps({"error": str(e)})}
