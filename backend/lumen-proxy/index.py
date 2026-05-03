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


def search_via_google_cse(query: str, api_key: str, cx: str) -> str | None:
    """Ищет фото через Google Custom Search API"""
    try:
        encoded = urllib.parse.quote(query)
        url = f"https://www.googleapis.com/customsearch/v1?q={encoded}&searchType=image&num=5&key={api_key}&cx={cx}&imgSize=medium&safe=active"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode('utf-8'))
        items = data.get('items', [])
        for item in items:
            link = item.get('link', '')
            if link and link.startswith('http'):
                print(f'[search-image] google cse: {link}')
                return link
    except Exception as e:
        print(f'[search-image] google cse error: {e}')
    return None


def search_via_bing(query: str) -> str | None:
    """Ищет фото через Bing Images scraping (без ключей)"""
    try:
        encoded_q = urllib.parse.quote(query)
        url = f"https://www.bing.com/images/search?q={encoded_q}&form=HDRSC2&first=1&tsc=ImageHoverTitle"
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': 'https://www.bing.com/',
        })
        with urllib.request.urlopen(req, timeout=12) as r:
            html = r.read().decode('utf-8', errors='ignore')
        # Bing хранит URL картинок в murl= параметре
        matches = re.findall(r'"murl":"(https?://[^"]+?\.(?:jpg|jpeg|png|webp))"', html)
        for img in matches[:10]:
            if img and not any(x in img for x in ['bing.com', 'microsoft.com']):
                print(f'[search-image] bing: {img}')
                return img
    except Exception as e:
        print(f'[search-image] bing error: {e}')
    return None


def search_via_yandex(query: str) -> str | None:
    """Ищет фото через Яндекс Картинки scraping"""
    try:
        encoded_q = urllib.parse.quote(query)
        url = f"https://yandex.ru/images/search?text={encoded_q}&itype=photo"
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language': 'ru-RU,ru;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        })
        with urllib.request.urlopen(req, timeout=12) as r:
            html = r.read().decode('utf-8', errors='ignore')
        matches = re.findall(r'"url":"(https?://[^"]+?\.(?:jpg|jpeg|png|webp))"', html)
        for img in matches[:10]:
            if img and not any(x in img for x in ['yandex.', 'ya.ru']):
                print(f'[search-image] yandex: {img}')
                return img
    except Exception as e:
        print(f'[search-image] yandex error: {e}')
    return None


def search_via_openverse(query: str) -> str | None:
    """Ищет фото через Openverse (открытая база фото, без ключей)"""
    try:
        encoded = urllib.parse.quote(query)
        url = f"https://api.openverse.org/v1/images/?q={encoded}&page_size=5&license_type=commercial"
        req = urllib.request.Request(url, headers={
            'User-Agent': 'ProductImageBot/1.0',
            'Accept': 'application/json',
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode('utf-8'))
        results = data.get('results', [])
        for item in results:
            img = item.get('url', '')
            if img and img.startswith('http'):
                print(f'[search-image] openverse: {img}')
                return img
    except Exception as e:
        print(f'[search-image] openverse error: {e}')
    return None


def generate_product_image_pollinations(name: str, article: str) -> str | None:
    """Генерирует реалистичное фото товара через Pollinations.ai"""
    try:
        import time
        # Строим точный промпт с названием товара
        product_desc = name if name else article
        query = f"professional product photo {product_desc}, isolated on white background, sharp focus, studio lighting, e-commerce style, high quality, real photo"
        encoded = urllib.parse.quote(query)
        seed = int(time.time()) % 99999
        url = f"https://image.pollinations.ai/prompt/{encoded}?width=800&height=800&seed={seed}&nologo=true&model=flux"
        print(f'[search-image] pollinations: {url}')
        return url
    except Exception as e:
        print(f'[search-image] pollinations error: {e}')
    return None


def search_product_image(article: str, name: str) -> str | None:
    """Ищет реальное фото товара из интернета: Google CSE → Bing → Яндекс → Openverse → AI-генерация"""
    import os

    google_key = os.environ.get('GOOGLE_CSE_KEY', '')
    google_cx = os.environ.get('GOOGLE_CSE_CX', '')
    # Запрос: название + артикул для точного поиска
    search_query = f"{name} {article}".strip() or name or article

    print(f'[search-image] query="{search_query}" article="{article}" name="{name}"')

    # 1. Google Custom Search (если настроен)
    if google_key and google_cx:
        img = search_via_google_cse(search_query, google_key, google_cx)
        if img:
            return img

    # 2. Bing Images — реальные фото из интернета
    img = search_via_bing(search_query)
    if img:
        return img

    # 3. Яндекс Картинки — особенно хорош для русских товаров
    img = search_via_yandex(search_query)
    if img:
        return img

    # 4. Openverse — открытая база лицензионных фото
    img = search_via_openverse(search_query)
    if img:
        return img

    # 5. Fallback — AI-генерация точного фото товара
    return generate_product_image_pollinations(name, article)


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