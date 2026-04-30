import { useState, useCallback } from "react";

const STORAGE_KEY = "lumen_github";

export interface GitHubSettings {
  token: string;
  repo: string;
  filePath: string;
  siteUrl: string;
  // Engine Git — второй репозиторий для исходников платформы
  engineToken: string;
  engineRepo: string;
  engineBranch: string;
}

const DEFAULT: GitHubSettings = {
  token: "",
  repo: "denis22078533-coder/Lumin-platform",
  filePath: "index.html",
  siteUrl: "",
  engineToken: "",
  engineRepo: "",
  engineBranch: "main",
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

const GITHUB_DOWNLOAD_URL = "https://functions.poehali.dev/b9736970-2710-4830-9cbf-3b2f015371be";

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

    let actualSha = sha;
    try {
      const getRes = await fetch(`${apiUrl}?ref=main`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      });
      if (getRes.ok) {
        const data = await getRes.json() as { sha: string };
        actualSha = data.sha;
      }
    } catch (_e) { /* файл новый */ }

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

    let result = await doPut(actualSha);

    let attempts = 0;
    while (!result.ok && attempts < 3 && /sha|match|conflict/i.test(result.data.message || "")) {
      attempts++;
      try {
        const refresh = await fetch(`${apiUrl}?ref=main&_=${Date.now()}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Cache-Control": "no-cache" },
        });
        if (refresh.ok) {
          const fresh = await refresh.json() as { sha: string };
          actualSha = fresh.sha;
          result = await doPut(actualSha);
        } else break;
      } catch (_e) { break; }
    }

    if (result.ok) {
      return { ok: true, message: `Файл ${path} обновлён в GitHub (HTTP ${result.status})` };
    } else {
      return { ok: false, message: result.data.message || `Ошибка GitHub: HTTP ${result.status}` };
    }
  }, [ghSettings]);

  // ── Engine Sync — загружает весь репозиторий платформы через backend ────────
  const syncEngine = useCallback(async (
    onProgress?: (msg: string) => void
  ): Promise<{ ok: boolean; message: string }> => {
    const token = ghSettings.engineToken || ghSettings.token;
    const repo = ghSettings.engineRepo;
    const branch = ghSettings.engineBranch || "main";

    if (!token) return { ok: false, message: "Укажите Engine GitHub Token в настройках" };
    if (!repo) return { ok: false, message: "Укажите Engine Repository (например: user/moi-lumin)" };

    onProgress?.("Скачиваю архив платформы...");

    const res = await fetch(GITHUB_DOWNLOAD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, repo, branch }),
    });
    const data = await res.json() as { zip_b64?: string; size?: number; error?: string };
    if (!res.ok || !data.zip_b64) throw new Error(data.error || `HTTP ${res.status}`);

    onProgress?.("Распаковываю архив...");

    const binary = atob(data.zip_b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const repoName = repo.split("/")[1] || "engine-source";
    a.href = url;
    a.download = `${repoName}-engine.zip`;
    a.click();
    URL.revokeObjectURL(url);

    return {
      ok: true,
      message: `Архив платформы скачан: ${repoName}-engine.zip (${Math.round((data.size || 0) / 1024)} КБ)\n/src, /backend и все конфиги внутри. Для запуска: npm install → npm run build.`,
    };
  }, [ghSettings]);

  return { ghSettings, saveGhSettings, fetchFromGitHub, pushToGitHub, syncEngine };
}
