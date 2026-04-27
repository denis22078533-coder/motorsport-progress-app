import { useState, useCallback } from "react";

const STORAGE_KEY = "lumen_github";

export interface GitHubSettings {
  token: string;
  repo: string;
}

const DEFAULT: GitHubSettings = {
  token: "",
  repo: "denis22078533-coder/Lumin-platform",
};

function load(): GitHubSettings {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? { ...DEFAULT, ...JSON.parse(s) } : DEFAULT;
  } catch { return DEFAULT; }
}

export function useGitHub() {
  const [ghSettings, setGhSettings] = useState<GitHubSettings>(load);

  const saveGhSettings = useCallback((s: GitHubSettings) => {
    setGhSettings(s);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }, []);

  const fetchFromGitHub = useCallback(async (): Promise<{ ok: boolean; html: string; message?: string }> => {
    const { token, repo } = ghSettings;
    if (!token || !repo) return { ok: false, html: "", message: "Нет токена или репозитория" };

    const apiUrl = `https://api.github.com/repos/${repo}/contents/index.html`;
    try {
      const res = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      });
      if (!res.ok) return { ok: false, html: "", message: `GitHub вернул HTTP ${res.status}` };
      const data = await res.json();
      const decoded = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ""))));
      return { ok: true, html: decoded };
    } catch (e) {
      return { ok: false, html: "", message: String(e) };
    }
  }, [ghSettings]);

  const pushToGitHub = useCallback(async (html: string): Promise<{ ok: boolean; message: string }> => {
    const { token, repo } = ghSettings;
    if (!token) return { ok: false, message: "Введите GitHub Personal Token в настройках" };
    if (!repo) return { ok: false, message: "Введите путь к репозиторию" };

    const apiUrl = `https://api.github.com/repos/${repo}/contents/index.html`;

    let sha: string | undefined;
    try {
      const getRes = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      });
      if (getRes.ok) {
        const data = await getRes.json();
        sha = data.sha as string;
      }
    } catch (_e) {
      // файл не существует — создадим новый
    }

    const content = btoa(unescape(encodeURIComponent(html)));
    const body: Record<string, string> = {
      message: "Lumen: обновление сайта",
      content,
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (putRes.ok) {
      return { ok: true, message: "Сайт обновлён в GitHub!" };
    } else {
      const err: { message?: string } = await putRes.json().catch(() => ({}));
      return { ok: false, message: err.message || `Ошибка GitHub: HTTP ${putRes.status}` };
    }
  }, [ghSettings]);

  return { ghSettings, saveGhSettings, fetchFromGitHub, pushToGitHub };
}
