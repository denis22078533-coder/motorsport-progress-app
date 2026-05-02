import json
import urllib.request
import urllib.error
import urllib.parse
import re


PROXYAPI_ALIASES = {"proxyapi.ru", "www.proxyapi.ru", "api.proxyapi.ru"}


def normalize_base_url(raw: str, fallback: str) -> str:
    url = (raw or "").strip().rstrip("/")
    if not url:
        return fallback
    if not re.match(r"^https?://", url):
        url = "https://" + url
    url = re.sub(r"(?<!:)/{2,}", "/", url)
    return url.rstrip("/")


def build_openai_endpoint(raw_base: str) -> str:
    url = normalize_base_url(raw_base, "https://api.proxyapi.ru/openai/v1")
    parsed_host = re.sub(r"^https?://", "", url).split("/")[0].lower()
    if parsed_host in PROXYAPI_ALIASES:
        return "https://api.proxyapi.ru/openai/v1/chat/completions"
    if url.endswith("/chat/completions"):
        return url
    if url.endswith("/v1"):
        return url + "/chat/completions"
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


def parse_openai_stream(raw: str) -> str:
    """Собирает полный текст из SSE-стрима OpenAI."""
    result = []
    for line in raw.splitlines():
        line = line.strip()
        if not line.startswith("data:"):
            continue
        data = line[5:].strip()
        if data == "[DONE]":
            break
        try:
            chunk = json.loads(data)
            delta = chunk.get("choices", [{}])[0].get("delta", {})
            content = delta.get("content")
            if content:
                result.append(content)
        except Exception:
            continue
    return "".join(result)


def parse_claude_stream(raw: str) -> str:
    """Собирает полный текст из SSE-стрима Claude."""
    result = []
    for line in raw.splitlines():
        line = line.strip()
        if not line.startswith("data:"):
            continue
        data = line[5:].strip()
        try:
            chunk = json.loads(data)
            if chunk.get("type") == "content_block_delta":
                delta = chunk.get("delta", {})
                if delta.get("type") == "text_delta":
                    result.append(delta.get("text", ""))
        except Exception:
            continue
    return "".join(result)


def search_product_image_unsplash(query: str) -> str | None:
    """Ищет фото через Unsplash (бесплатный публичный API)"""
    try:
        encoded = urllib.parse.quote(query)
        url = f"https://source.unsplash.com/featured/800x600/?{encoded}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        # Unsplash делает redirect — нам нужен финальный URL
        import http.client
        # Делаем HEAD запрос чтобы получить redirect URL
        parsed = urllib.parse.urlparse(url)
        conn = http.client.HTTPSConnection(parsed.netloc, timeout=10)
        conn.request("HEAD", parsed.path + (f"?{parsed.query}" if parsed.query else ""), headers={'User-Agent': 'Mozilla/5.0'})
        resp = conn.getresponse()
        location = resp.getheader('Location')
        if location and location.startswith('http'):
            print(f'[search-image] unsplash: {location}')
            return location
    except Exception as e:
        print(f'[search-image] unsplash error: {e}')
    return None


def generate_product_image_pollinations(name: str, article: str) -> str | None:
    """Генерирует фото товара через Pollinations.ai если поиск не нашёл"""
    try:
        import time
        query = f"product photo of {name} {article}, white background, professional, high quality".strip()
        encoded = urllib.parse.quote(query)
        seed = int(time.time()) % 99999
        url = f"https://image.pollinations.ai/prompt/{encoded}?width=800&height=800&seed={seed}&nologo=true&model=flux"
        print(f'[search-image] pollinations: {url}')
        return url
    except Exception as e:
        print(f'[search-image] pollinations error: {e}')
    return None


def search_product_image(article: str, name: str) -> str | None:
    """Ищет или генерирует фото товара по артикулу и/или названию"""
    search_query = name or article

    # Пробуем Unsplash
    img = search_product_image_unsplash(search_query)
    if img:
        return img

    # Fallback — генерируем через Pollinations
    img = generate_product_image_pollinations(name, article)
    return img


def handler(event: dict, context) -> dict:
    """Проксирует запросы к OpenAI/Claude API. Также поддерживает поиск фото товаров (__action__: search_image)."""

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

    # Поиск фото товара
    if body.get("__action__") == "search_image":
        article = body.get("article", "").strip()
        name = body.get("name", "").strip()
        if not article and not name:
            return {"statusCode": 400, "headers": cors_headers, "body": json.dumps({"error": "article or name required"})}
        img_url = search_product_image(article, name)
        if img_url:
            return {"statusCode": 200, "headers": cors_headers, "body": json.dumps({"url": img_url, "article": article, "name": name})}
        return {"statusCode": 404, "headers": cors_headers, "body": json.dumps({"error": "image not found"})}

    provider = body.pop("__provider__", "openai")
    api_key = (body.pop("__api_key__", "") or "").strip()
    raw_base = (body.pop("__base_url__", "") or "").strip()

    # Включаем стриминг
    body["stream"] = True

    if provider == "openai":
        endpoint = build_openai_endpoint(raw_base)
        req_headers = {
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            "Authorization": f"Bearer {api_key}",
        }
    else:
        endpoint = build_claude_endpoint(raw_base)
        req_headers = {
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        }

    print(f"[lumen-proxy] provider={provider} endpoint={endpoint} stream=true")

    payload = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(endpoint, data=payload, headers=req_headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw_stream = resp.read().decode("utf-8")

            if provider == "openai":
                text = parse_openai_stream(raw_stream)
                result = {
                    "choices": [{"message": {"content": text}, "finish_reason": "stop"}],
                    "__endpoint__": endpoint,
                    "__streamed__": True,
                }
            else:
                text = parse_claude_stream(raw_stream)
                result = {
                    "content": [{"type": "text", "text": text}],
                    "__endpoint__": endpoint,
                    "__streamed__": True,
                }

            return {"statusCode": 200, "headers": cors_headers, "body": json.dumps(result)}

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