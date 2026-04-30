import json
import urllib.request
import urllib.error
import base64
import os


CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
}

INCLUDE_DIRS = ["src", "backend", "db_migrations", "scripts", "public"]
INCLUDE_ROOT_FILES = [
    "package.json", "vite.config.ts", "vite.config.js",
    "tailwind.config.ts", "tailwind.config.js",
    "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json",
    "postcss.config.js", "postcss.config.cjs",
    "index.html", ".env.example", "bun.lockb",
]
SKIP_DIRS = {"node_modules", ".git", "dist", "build", ".cache", "__pycache__", ".venv"}
SKIP_EXT = {".pyc", ".pyo", ".log", ".lock"}
MAX_FILE_SIZE = 400 * 1024


def _find_project_root() -> str:
    """
    Ищет корень проекта — папку где есть package.json.
    В Cloud Function файл лежит в /function/code/backend/github-download/index.py
    Корень проекта = /function/code/
    """
    # Начинаем от текущего файла и идём вверх
    current = os.path.abspath(__file__)
    for _ in range(6):  # максимум 6 уровней вверх
        current = os.path.dirname(current)
        if os.path.isfile(os.path.join(current, "package.json")):
            return current
        # Также проверяем vite.config.ts как маркер
        if os.path.isfile(os.path.join(current, "vite.config.ts")):
            return current

    # Fallback: стандартный путь для Cloud Function
    fallback = "/function/code"
    if os.path.isdir(fallback):
        return fallback

    # Последний fallback — три уровня вверх от файла
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def handler(event: dict, context) -> dict:
    """GitHub helper: скачать архив репозитория (action=download) или
    выгрузить исходники платформы в GitHub (action=push).
    Принимает: { action, token, repo, branch }"""

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Invalid JSON"})}

    token = (body.get("token") or "").strip()
    repo = (body.get("repo") or "").strip()
    branch = (body.get("branch") or "main").strip()
    action = (body.get("action") or "download").strip()

    if not token or not repo:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "token and repo required"})}

    if action == "push":
        return _push_to_github(token, repo, branch)

    if action == "debug":
        # Диагностический режим — показываем что видит функция
        base_dir = _find_project_root()
        found_dirs = []
        for d in INCLUDE_DIRS:
            p = os.path.join(base_dir, d)
            found_dirs.append({"dir": d, "exists": os.path.isdir(p), "path": p})
        root_files = []
        for f in INCLUDE_ROOT_FILES:
            p = os.path.join(base_dir, f)
            root_files.append({"file": f, "exists": os.path.isfile(p)})
        return {
            "statusCode": 200,
            "headers": CORS,
            "body": json.dumps({
                "base_dir": base_dir,
                "__file__": __file__,
                "dirs": found_dirs,
                "root_files": root_files,
            }),
        }

    # action == "download" — оригинальная логика
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
            return {"statusCode": 200, "headers": CORS, "body": json.dumps({"zip_b64": zip_b64, "size": len(zip_bytes)})}
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        return {"statusCode": e.code, "headers": CORS, "body": json.dumps({"error": f"GitHub {e.code}: {err[:300]}"})}
    except Exception as e:
        return {"statusCode": 502, "headers": CORS, "body": json.dumps({"error": str(e)})}


def _push_to_github(token: str, repo: str, branch: str) -> dict:
    base_dir = _find_project_root()

    print(f"[push] base_dir={base_dir}, __file__={__file__}")

    files_to_push: list[tuple[str, str]] = []

    # Корневые файлы
    for fname in INCLUDE_ROOT_FILES:
        fpath = os.path.join(base_dir, fname)
        if os.path.isfile(fpath):
            files_to_push.append((fname, fpath))
            print(f"[push] root file: {fname}")

    # Директории
    for dname in INCLUDE_DIRS:
        dir_path = os.path.join(base_dir, dname)
        if not os.path.isdir(dir_path):
            print(f"[push] dir NOT found: {dname} -> {dir_path}")
            continue
        print(f"[push] scanning dir: {dname}")
        for root, dirs, files in os.walk(dir_path):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for fname in files:
                ext = os.path.splitext(fname)[1].lower()
                if ext in SKIP_EXT:
                    continue
                abs_path = os.path.join(root, fname)
                if os.path.getsize(abs_path) > MAX_FILE_SIZE:
                    print(f"[push] skip (too large): {abs_path}")
                    continue
                rel_path = os.path.relpath(abs_path, base_dir).replace("\\", "/")
                files_to_push.append((rel_path, abs_path))

    print(f"[push] total files to push: {len(files_to_push)}")

    if not files_to_push:
        # Последняя попытка — поищем src в /function/code напрямую
        alt_base = "/function/code"
        if os.path.isdir(os.path.join(alt_base, "src")):
            base_dir = alt_base
            print(f"[push] fallback to alt_base={alt_base}")
            for dname in INCLUDE_DIRS:
                dir_path = os.path.join(base_dir, dname)
                if not os.path.isdir(dir_path):
                    continue
                for root, dirs, files in os.walk(dir_path):
                    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
                    for fname in files:
                        ext = os.path.splitext(fname)[1].lower()
                        if ext in SKIP_EXT:
                            continue
                        abs_path = os.path.join(root, fname)
                        if os.path.getsize(abs_path) > MAX_FILE_SIZE:
                            continue
                        rel_path = os.path.relpath(abs_path, base_dir).replace("\\", "/")
                        files_to_push.append((rel_path, abs_path))
            for fname in INCLUDE_ROOT_FILES:
                fpath = os.path.join(base_dir, fname)
                if os.path.isfile(fpath):
                    files_to_push.append((fname, fpath))
            print(f"[push] after fallback: {len(files_to_push)} files")

    if not files_to_push:
        return {
            "statusCode": 200,
            "headers": CORS,
            "body": json.dumps({
                "ok": False,
                "pushed": 0,
                "total": 0,
                "errors": [f"Файлы проекта не найдены. base_dir={base_dir}, __file__={__file__}"],
                "message": f"Ошибка: не найдены исходники проекта (base_dir={base_dir})",
            }),
        }

    gh_headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "Lumen-Engine/1.0",
    }

    pushed = 0
    errors = []

    for rel_path, abs_path in files_to_push:
        try:
            with open(abs_path, "rb") as f:
                content_b64 = base64.b64encode(f.read()).decode("utf-8")

            api_url = f"https://api.github.com/repos/{repo}/contents/{rel_path}"

            # Получаем текущий SHA файла (нужен для обновления)
            sha = None
            get_req = urllib.request.Request(
                f"{api_url}?ref={branch}",
                headers=gh_headers,
            )
            try:
                with urllib.request.urlopen(get_req, timeout=10) as r:
                    sha = json.loads(r.read()).get("sha")
            except urllib.error.HTTPError as e:
                if e.code != 404:
                    errors.append(f"{rel_path}: GET {e.code}")
                    continue
                # 404 = новый файл, sha не нужен

            payload: dict = {
                "message": f"Муравей: обновил {rel_path}",
                "content": content_b64,
                "branch": branch,
            }
            if sha:
                payload["sha"] = sha

            put_req = urllib.request.Request(
                api_url,
                data=json.dumps(payload).encode("utf-8"),
                headers=gh_headers,
                method="PUT",
            )
            with urllib.request.urlopen(put_req, timeout=20) as r:
                r.read()
            pushed += 1
            print(f"[push] ok: {rel_path}")

        except urllib.error.HTTPError as e:
            err_body = ""
            try:
                err_body = e.read().decode("utf-8", errors="replace")[:120]
            except Exception:
                pass
            errors.append(f"{rel_path}: HTTP {e.code} {err_body}")
            print(f"[push] error {rel_path}: HTTP {e.code} {err_body}")
        except Exception as e:
            errors.append(f"{rel_path}: {str(e)[:80]}")
            print(f"[push] error {rel_path}: {e}")

    print(f"[push] done: pushed={pushed}, errors={len(errors)}")

    return {
        "statusCode": 200,
        "headers": CORS,
        "body": json.dumps({
            "ok": pushed > 0 or len(files_to_push) == 0,
            "pushed": pushed,
            "total": len(files_to_push),
            "errors": errors[:10],
            "message": f"Выгружено {pushed} из {len(files_to_push)} файлов в {repo}",
        }),
    }
