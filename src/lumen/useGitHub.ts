import { useState, useCallback } from "react";

const STORAGE_KEY = "lumen_github";

export interface GitHubSettings {
  token: string;
  repo: string;
  filePath: string;
}

const DEFAULT: GitHubSettings = {
  token: "",
  repo: "denis22078533-coder/Lumin-platform",
  filePath: "index.html",
};

function load(): GitHubSettings {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? { ...DEFAULT, ...JSON.parse(s) } : DEFAULT;
  } catch { return DEFAULT; }
}

export interface FetchResult {
  ok: boolean;
  html: string;
  sha: string;
  filePath: string;
  message?: string;
}

export function useGitHub() {
  const [ghSettings, setGhSettings] = useState<GitHubSettings>(load);

  const saveGhSettings = useCallback((s: GitHubSettings) => {
    setGhSettings(s);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }, []);

  const fetchFromGitHub = useCallback(async (): Promise<FetchResult> => {
    const { token, repo, filePath } = ghSettings;
    const path = (filePath || "index.html").trim().replace(/^\//, "");
    if (!token || !repo) return { ok: false, html: "", sha: "", filePath: path, message: "Нет токена или репозитория" };

    const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}?ref=main`;
    try {
      const res = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { message?: string };
        return { ok: false, html: "", sha: "", filePath: path, message: `GitHub HTTP ${res.status}: ${errData.message || "неизвестная ошибка"}` };
      }
      const data = await res.json() as { content: string; sha: string };
      const decoded = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ""))));
      return { ok: true, html: decoded, sha: data.sha, filePath: path };
    } catch (e) {
      return { ok: false, html: "", sha: "", filePath: path, message: String(e) };
    }
  }, [ghSettings]);

  const pushToGitHub = useCallback(async (
    html: string,
    sha: string,
    filePath: string
  ): Promise<{ ok: boolean; message: string }> => {
    const { token, repo } = ghSettings;
    if (!token) return { ok: false, message: "Введите GitHub Personal Token в настройках" };
    if (!repo) return { ok: false, message: "Введите путь к репозиторию" };

    const path = (filePath || "index.html").trim().replace(/^\//, "");
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}`;

    // Всегда получаем свежий SHA из ветки main перед записью
    let actualSha = sha;
    try {
      const getRes = await fetch(`${apiUrl}?ref=main`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      });
      if (getRes.ok) {
        const data = await getRes.json() as { sha: string };
        actualSha = data.sha;
      }
    } catch (_e) {
      // файл новый — sha не нужен
    }

    const content = btoa(unescape(encodeURIComponent(html)));

    const doPut = async (shaToUse: string) => {
      const reqBody: Record<string, string> = {
        message: `Lumen: правки в ${path}`,
        content,
        branch: "main",
      };
      if (shaToUse) reqBody.sha = shaToUse;
      const r = await fetch(apiUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(reqBody),
      });
      const d = await r.json().catch(() => ({})) as { message?: string };
      return { status: r.status, ok: r.ok, data: d };
    };

    console.log("[Lumen→GitHub] PUT", apiUrl, { sha: actualSha, branch: "main", contentLength: content.length });
    let result = await doPut(actualSha);
    console.log("[Lumen→GitHub] Response", result.status, result.data);

    // Если SHA не совпал — перезапрашиваем актуальный и повторяем (до 3 попыток)
    let attempts = 0;
    while (!result.ok && attempts < 3 && /sha|match|conflict/i.test(result.data.message || "")) {
      attempts++;
      console.log(`[Lumen→GitHub] SHA mismatch, retry #${attempts}`);
      try {
        const refresh = await fetch(`${apiUrl}?ref=main&_=${Date.now()}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Cache-Control": "no-cache" },
        });
        if (refresh.ok) {
          const fresh = await refresh.json() as { sha: string };
          actualSha = fresh.sha;
          result = await doPut(actualSha);
          console.log("[Lumen→GitHub] Retry response", result.status, result.data);
        } else {
          break;
        }
      } catch (_e) {
        break;
      }
    }

    if (result.ok) {
      return { ok: true, message: `Файл ${path} обновлён в GitHub (HTTP ${result.status})` };
    } else {
      return { ok: false, message: result.data.message || `Ошибка GitHub: HTTP ${result.status}` };
    }
  }, [ghSettings]);

  return { ghSettings, saveGhSettings, fetchFromGitHub, pushToGitHub };
}