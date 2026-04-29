import json
import urllib.request
import urllib.error
import base64


def handler(event: dict, context) -> dict:
    """Скачивает ZIP-архив репозитория GitHub через сервер (обход CORS).
    Принимает: { token, repo } — возвращает ZIP в base64."""

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
        return {"statusCode": 400, "headers": cors_headers, "body": json.dumps({"error": "Invalid JSON"})}

    token = (body.get("token") or "").strip()
    repo = (body.get("repo") or "").strip()
    branch = (body.get("branch") or "main").strip()

    if not token or not repo:
        return {"statusCode": 400, "headers": cors_headers, "body": json.dumps({"error": "token and repo required"})}

    url = f"https://api.github.com/repos/{repo}/zipball/{branch}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "Lumen-Platform/1.0",
    })

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            zip_bytes = resp.read()
            zip_b64 = base64.b64encode(zip_bytes).decode("utf-8")
            return {
                "statusCode": 200,
                "headers": cors_headers,
                "body": json.dumps({"zip_b64": zip_b64, "size": len(zip_bytes)}),
            }
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        return {"statusCode": e.code, "headers": cors_headers, "body": json.dumps({"error": f"GitHub {e.code}: {err[:300]}"})}
    except Exception as e:
        return {"statusCode": 502, "headers": cors_headers, "body": json.dumps({"error": str(e)})}
