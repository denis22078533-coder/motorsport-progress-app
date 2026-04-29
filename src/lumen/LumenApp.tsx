import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import LumenTopBar from "./LumenTopBar";
import LivePreview from "./LivePreview";
import ChatPanel, { ChatMode } from "./ChatPanel";
import SettingsDrawer from "./SettingsDrawer";
import LumenLoginPage from "./LumenLoginPage";
import { useLumenAuth } from "./useLumenAuth";
import { useGitHub } from "./useGitHub";

type CycleStatus = "idle" | "reading" | "generating" | "done" | "error";
type MobileTab = "chat" | "preview";

export interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
  html?: string; // HTML-результат, который можно задеплоить
}

interface Settings {
  apiKey: string;
  provider: "openai" | "claude";
  model: string;
  baseUrl: string;
  proxyUrl: string;
}

const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  provider: "openai",
  model: "gpt-4o-mini",
  baseUrl: import.meta.env.VITE_DEFAULT_OPENAI_BASE || "https://proxyapi.ru",
  proxyUrl: import.meta.env.VITE_AI_PROXY_URL || "https://functions.poehali.dev/60463e71-1a34-44dc-bde3-90a47fc07cba",
};


const PROJECT_STRUCTURE = `
## Project file structure:
/src/                        — React/Vite frontend (TypeScript + Tailwind CSS)
  /src/lumen/                — AI assistant core (ChatPanel, LumenApp, LivePreview, SettingsDrawer, useGitHub.ts)
  /src/components/ui/        — shadcn/ui components (Button, Dialog, Drawer, etc.)
  /src/index.css             — global CSS variables and base styles
  /src/App.tsx               — application entry point
/backend/                    — Python 3.11 Cloud Functions (deployed serverless)
  /backend/lumen-proxy/      — OpenAI/Claude API proxy with streaming support
  /backend/generate-image/   — image generation via Pollinations + S3 CDN
  /backend/auth/             — authentication service
/db_migrations/              — PostgreSQL migrations (Flyway format: V{n}__{name}.sql)
/public/                     — static assets
package.json, vite.config.ts, tailwind.config.ts — project config
`;

// ── Базовая роль AI — Senior Fullstack Developer ────────────────────────────
const SENIOR_DEV_ROLE = `You are a Senior Fullstack Developer with 10+ years of experience in web development.
Your expertise: HTML/CSS/JS, React, TypeScript, Python, PostgreSQL, REST APIs, clean architecture.
Rules you always follow:
- Write production-quality, clean, maintainable code
- No placeholder comments like "// add your code here" — always write real implementation
- Semantic HTML, accessible markup, mobile-first responsive design
- Optimize for performance: minimal DOM, efficient CSS, no layout thrashing
- When editing existing code — preserve the architecture, only change what's asked
- Output ONLY the requested artifact — no explanations, no markdown wrappers unless it IS markdown
- Respond in the same language the user writes in (Russian if user writes in Russian)
${PROJECT_STRUCTURE}`;

const CREATE_SYSTEM_PROMPT = `${SENIOR_DEV_ROLE}
## Task: Create a complete website
Output ONLY a full standalone HTML document (<!DOCTYPE html>...</html>). No explanations, no markdown fences.
Technical requirements:
- Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- Lucide icons via CDN if needed: <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
- Google Fonts via CDN for typography if needed
- Default to light theme (white/light-gray background, dark text) unless explicitly asked for dark
- All JS inline in <script> tags, no external files
- Fully responsive, works on mobile and desktop
- IMAGES: If ready image URLs are provided in the request — use them in <img src="..."> tags. No placeholder images if real URLs exist.`;

const EDIT_SYSTEM_PROMPT_FULL = (currentHtml: string) =>
  `${SENIOR_DEV_ROLE}
## Task: Edit existing website code
Output ONLY the complete modified HTML document. No explanations, no markdown.
Rules:
- Make EXACTLY the requested changes, nothing more
- Preserve all existing styles, structure, content that was NOT mentioned in the request
- Keep the same framework/library versions already in the code
- Default to light theme unless user explicitly requests dark

--- CURRENT SITE CODE ---
${currentHtml}
--- END OF CODE ---`;

const ZIP_CONVERT_SYSTEM_PROMPT = `${SENIOR_DEV_ROLE}
## Task: Convert React/Vite project to single HTML file
Your ONLY goal is to faithfully recreate the existing site from the provided source files as one self-contained HTML file.
Strict rules:
1. Output ONLY the complete HTML document (<!DOCTYPE html>...) — no explanations, no markdown
2. DO NOT invent new design, colors, or copy — reproduce EXACTLY what's in the source files
3. Preserve all text, headings, descriptions from the original
4. Preserve color scheme, fonts, spacing from the original
5. Load via CDN: Tailwind CSS, Lucide icons, Google Fonts (if used in source)
6. All JS inline in <script> tags
7. Fully responsive`;

const LOCAL_FILE_EDIT_PROMPT = (currentHtml: string, fileName: string) =>
  `${SENIOR_DEV_ROLE}
## Task: Edit uploaded file «${fileName}»
Output ONLY the complete modified HTML document. No explanations, no markdown.
Make EXACTLY the requested changes — preserve everything else as-is.

--- CURRENT FILE CODE ---
${currentHtml}
--- END OF CODE ---`;

// ── Промпт для генерации SQL-миграций ──────────────────────────────────────
const SQL_MIGRATION_SYSTEM_PROMPT = `${SENIOR_DEV_ROLE}
## Task: Generate SQL migration
The user wants to change the database schema. Generate a proper SQL migration.
Rules:
1. Output a JSON object with two fields:
   - "sql": the complete SQL migration script (PostgreSQL syntax, also compatible with MySQL where possible)
   - "explanation": brief description of what this migration does (in Russian, 1-3 sentences)
2. Migration format: standard DDL (CREATE TABLE, ALTER TABLE, ADD COLUMN, CREATE INDEX, etc.)
3. Use IF NOT EXISTS where applicable to make migrations idempotent
4. Add comments in SQL for clarity
5. MySQL compatibility notes: avoid PostgreSQL-specific types (use VARCHAR instead of TEXT where possible, use TINYINT(1) for boolean)
Output ONLY valid JSON, no markdown fences.`;



let msgCounter = 0;

export default function LumenApp() {
  const { authed, login, logout } = useLumenAuth();
  const { ghSettings, saveGhSettings, fetchFromGitHub, pushToGitHub } = useGitHub();

  const liveUrl = (() => {
    if (ghSettings.siteUrl?.trim()) {
      const u = ghSettings.siteUrl.trim();
      return u.endsWith("/") ? u : u + "/";
    }
    const [user, repo] = (ghSettings.repo || "").split("/");
    return user && repo ? `https://${user}.github.io/${repo}/` : "";
  })();

  const [cycleStatus, setCycleStatus] = useState<CycleStatus>("idle");
  const [cycleLabel, setCycleLabel] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [htmlHistory, setHtmlHistory] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
  const [deployingId, setDeployingId] = useState<number | null>(null);
  const [deployResult, setDeployResult] = useState<{ id: number; ok: boolean; message: string } | null>(null);
  const [currentFileSha, setCurrentFileSha] = useState<string>("");
  const [currentFilePath, setCurrentFilePath] = useState<string>("");
  const [loadingFromGitHub, setLoadingFromGitHub] = useState(false);
  const [fullCodeContext, setFullCodeContext] = useState<{ html: string; fileName: string } | null>(null);
  const [showRebuildBanner, setShowRebuildBanner] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Сохраняем HTML в localStorage при каждом изменении
  const savePreviewHtml = (html: string | null) => {
    setPreviewHtml(prev => {
      if (prev) setHtmlHistory(h => [...h.slice(-9), prev]); // храним до 10 версий
      return html;
    });
    try {
      if (html) localStorage.setItem("lumen_last_html", html);
      else localStorage.removeItem("lumen_last_html");
    } catch { /* ignore */ }
  };

  const handleUndo = () => {
    setHtmlHistory(h => {
      const prev = h[h.length - 1];
      if (!prev) return h;
      setPreviewHtml(prev);
      try { localStorage.setItem("lumen_last_html", prev); } catch { /* ignore */ }
      return h.slice(0, -1);
    });
  };

  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const saved = localStorage.getItem("lumen_settings");
      return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    } catch { return DEFAULT_SETTINGS; }
  });

  const abortRef = useRef(false);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [convertingZip, setConvertingZip] = useState(false);

  // Загружаем JSZip через CDN один раз
  useEffect(() => {
    if (!(window as unknown as Record<string, unknown>).JSZip) {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      document.head.appendChild(script);
    }
  }, []);

  // Читаем ZIP и отдаём все текстовые файлы
  const readZipFiles = async (file: File): Promise<Record<string, string>> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const JSZip = (window as any).JSZip;
    if (!JSZip) throw new Error("JSZip ещё не загружен, попробуйте ещё раз");
    const zip = await JSZip.loadAsync(file);
    const result: Record<string, string> = {};
    const textExts = [".tsx", ".ts", ".jsx", ".js", ".css", ".html", ".json", ".md", ".svg"];
    const skipDirs = ["node_modules", ".git", "dist", "build", ".next"];

    const promises: Promise<void>[] = [];
    zip.forEach((relativePath: string, zipEntry: { dir: boolean; async: (type: string) => Promise<string> }) => {
      if (zipEntry.dir) return;
      const skip = skipDirs.some(d => relativePath.includes(`${d}/`));
      if (skip) return;
      const ext = relativePath.slice(relativePath.lastIndexOf(".")).toLowerCase();
      if (!textExts.includes(ext)) return;
      promises.push(
        zipEntry.async("string").then(content => {
          result[relativePath] = content;
        })
      );
    });
    await Promise.all(promises);
    return result;
  };

  const handleLoadZip = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setConvertingZip(true);
    setCycleStatus("reading");
    setCycleLabel("Читаю архив...");

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const JSZip = (window as any).JSZip;
      if (!JSZip) throw new Error("JSZip ещё не загружен, попробуйте ещё раз");
      const zip = await JSZip.loadAsync(file);

      // Собираем все пути в архиве для диагностики
      const allPaths: string[] = [];
      zip.forEach((relativePath: string, zipEntry: { dir: boolean }) => {
        if (!zipEntry.dir) allPaths.push(relativePath);
      });
      console.log("[ZIP] Все файлы в архиве:", allPaths);

      // Ищем готовый index.html — сначала точные пути, потом любой index.html
      let foundHtml = "";
      let foundPath = "";

      // Точные кандидаты
      const candidates = ["dist/index.html", "build/index.html", "index.html"];
      for (const candidate of candidates) {
        const entry = zip.file(candidate);
        if (entry) {
          foundHtml = await entry.async("string");
          foundPath = candidate;
          break;
        }
      }

      // Любой index.html в любой вложенной папке
      if (!foundHtml) {
        // Приоритет: dist > build > корень > остальное
        const htmlFiles = allPaths.filter(p => p.endsWith("index.html"));
        console.log("[ZIP] Найдены index.html:", htmlFiles);
        const pick = htmlFiles.find(p => p.includes("dist/")) 
          || htmlFiles.find(p => p.includes("build/"))
          || htmlFiles[0];
        if (pick) {
          foundPath = pick;
          foundHtml = await zip.file(pick)!.async("string");
        }
      }

      console.log("[ZIP] Выбран файл:", foundPath, "| длина HTML:", foundHtml.length);

      if (foundHtml) {
        // Инлайним все .css и .js из архива прямо в HTML (без AI)
        setCycleLabel("Встраиваю стили и скрипты...");
        const baseDir = foundPath.includes("/") ? foundPath.slice(0, foundPath.lastIndexOf("/") + 1) : "";

        // Собираем все текстовые файлы из архива
        const zipAssets: Record<string, string> = {};
        const assetPromises: Promise<void>[] = [];
        zip.forEach((relPath: string, entry: { dir: boolean; async: (t: string) => Promise<string> }) => {
          if (entry.dir) return;
          const ext = relPath.slice(relPath.lastIndexOf(".")).toLowerCase();
          if ([".css", ".js"].includes(ext)) {
            assetPromises.push(entry.async("string").then(c => { zipAssets[relPath] = c; }));
          }
        });
        await Promise.all(assetPromises);
        console.log("[ZIP] Assets найдено:", Object.keys(zipAssets));

        // Заменяем <link rel="stylesheet" href="..."> на инлайн <style>
        let inlinedHtml = foundHtml.replace(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi, (match, href) => {
          const normalized = href.startsWith("/") ? href.slice(1) : href;
          const key = zipAssets[baseDir + normalized] !== undefined ? baseDir + normalized
            : zipAssets[normalized] !== undefined ? normalized
            : Object.keys(zipAssets).find(k => k.endsWith(normalized.replace(/^.*\//, "")));
          if (key && zipAssets[key]) {
            console.log("[ZIP] Инлайн CSS:", key);
            return `<style>${zipAssets[key]}</style>`;
          }
          return match;
        });

        // Заменяем <script src="..."> на инлайн <script>
        inlinedHtml = inlinedHtml.replace(/<script([^>]+)src=["']([^"']+)["']([^>]*)><\/script>/gi, (match, pre, src, post) => {
          const normalized = src.startsWith("/") ? src.slice(1) : src;
          const key = zipAssets[baseDir + normalized] !== undefined ? baseDir + normalized
            : zipAssets[normalized] !== undefined ? normalized
            : Object.keys(zipAssets).find(k => k.endsWith(normalized.replace(/^.*\//, "")));
          if (key && zipAssets[key]) {
            console.log("[ZIP] Инлайн JS:", key);
            const attrs = (pre + post).replace(/\s*src=["'][^"']*["']/gi, "").replace(/\s*type=["']module["']/gi, "");
            return `<script${attrs}>${zipAssets[key]}</script>`;
          }
          return match;
        });

        const htmlWithBase = liveUrl ? injectBaseHref(inlinedHtml, liveUrl) : inlinedHtml;
        savePreviewHtml(injectLightTheme(htmlWithBase));
        setFullCodeContext({ html: inlinedHtml, fileName: foundPath });
        setMobileTab("preview");
        setCycleStatus("done");
        setCycleLabel("");
        setMessages(prev => [...prev, {
          id: ++msgCounter,
          role: "assistant",
          text: `Загружен «${foundPath}» из архива. Опишите что нужно изменить — отредактирую.`,
        }]);
      } else {
        // Готового HTML нет — конвертируем через ИИ
        const files = await readZipFiles(file);
        const fileCount = Object.keys(files).length;
        if (fileCount === 0) throw new Error("В архиве не найдены файлы проекта");

        const filesContext = Object.entries(files)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([path, content]) => `\n\n### Файл: ${path}\n\`\`\`\n${content.slice(0, 6000)}\n\`\`\``)
          .join("");

        const zipPrompt = `Конвертируй этот React/Vite проект (${fileCount} файлов) в один HTML файл. Сохрани все тексты, цвета и структуру точно как в оригинале. Верни ТОЛЬКО HTML.

--- ФАЙЛЫ ПРОЕКТА ---${filesContext}
--- КОНЕЦ ФАЙЛОВ ---`;

        setCycleLabel("Конвертирую...");
        setCycleStatus("generating");

        const rawResponse = await callAI(ZIP_CONVERT_SYSTEM_PROMPT, zipPrompt, (chars) => {
          setCycleLabel(`Конвертирую... ${chars} симв.`);
        });
        const cleanHtml = extractHtml(rawResponse);

        if (!/<[a-z][\s\S]*>/i.test(cleanHtml)) {
          throw new Error("Не удалось конвертировать проект. Попробуйте ещё раз.");
        }

        const htmlWithBase = liveUrl ? injectBaseHref(cleanHtml, liveUrl) : cleanHtml;
        savePreviewHtml(injectLightTheme(htmlWithBase));
        setMobileTab("preview");
        setCycleStatus("done");
        setCycleLabel("");
        setMessages(prev => [...prev, {
          id: ++msgCounter,
          role: "assistant",
          text: `Проект «${file.name}» конвертирован (${fileCount} файлов). Опишите что нужно изменить — отредактирую.`,
        }]);
      }

    } catch (err) {
      setCycleStatus("error");
      setCycleLabel("");
      const errText = err instanceof Error ? err.message : "Неизвестная ошибка";
      setMessages(prev => [...prev, { id: ++msgCounter, role: "assistant", text: `Ошибка: ${errText}` }]);
    } finally {
      setConvertingZip(false);
    }
  }, [settings, liveUrl]);

  const extractHtml = (raw: string): string => {
    const mdMatch = raw.match(/```html\s*\n([\s\S]*?)```/i) || raw.match(/```\s*\n([\s\S]*?)```/);
    if (mdMatch) raw = mdMatch[1].trim();
    const tagMatch = raw.match(/(<!DOCTYPE[\s\S]*)/i) || raw.match(/(<html[\s\S]*)/i);
    return tagMatch ? tagMatch[1].trim() : raw.trim();
  };

  // Инжектирует принудительный светлый фон если в HTML нет явного светлого background
  const injectLightTheme = (html: string): string => {
    const forceCss = `<style data-lumen-fix>
      html,body{background:#ffffff!important;color:#111111!important;}
    </style>`;
    if (/<\/head>/i.test(html)) {
      return html.replace(/<\/head>/i, `${forceCss}</head>`);
    }
    if (/<body/i.test(html)) {
      return html.replace(/<body([^>]*)>/i, `<head>${forceCss}</head><body$1>`);
    }
    return forceCss + html;
  };

  // Инжектирует <base href> в HTML чтобы относительные пути assets/ работали через живой домен
  const injectBaseHref = (html: string, baseUrl: string): string => {
    if (!baseUrl) return html;
    const base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
    // Если уже есть <base> тег — заменяем его
    if (/<base\s[^>]*href/i.test(html)) {
      return html.replace(/<base\s[^>]*href=["'][^"']*["'][^>]*>/i, `<base href="${base}">`);
    }
    // Иначе вставляем сразу после <head>
    if (/<head>/i.test(html)) {
      return html.replace(/<head>/i, `<head>\n  <base href="${base}">`);
    }
    // Fallback — вставляем после <html>
    if (/<html[^>]*>/i.test(html)) {
      return html.replace(/(<html[^>]*>)/i, `$1\n<head><base href="${base}"></head>`);
    }
    return html;
  };

  const buildChatHistory = (currentUserText: string, maxPairs = 8): { role: string; content: string }[] => {
    // Берём последние maxPairs пар (user+assistant) из истории, исключая картинки и длинный HTML
    const history: { role: string; content: string }[] = [];
    const recent = messages.slice(-maxPairs * 2);
    for (const msg of recent) {
      if (msg.html?.startsWith("__IMAGE__:")) continue; // пропускаем картинки
      const content = msg.html
        ? msg.html.length > 8000 ? msg.text + "\n[предыдущий HTML-код сайта обрезан для экономии токенов]" : msg.html
        : msg.text;
      history.push({ role: msg.role === "user" ? "user" : "assistant", content });
    }
    history.push({ role: "user", content: currentUserText });
    return history;
  };

  const callAI = async (systemPrompt: string, userText: string, onProgress?: (chars: number) => void, useHistory = false): Promise<string> => {
    const rawBase = (settings.baseUrl || "").trim().replace(/\/+$/, "");
    const baseUrl = rawBase || "https://proxyapi.ru";
    const isOpenAI = settings.provider === "openai";

    const chatMessages = useHistory
      ? buildChatHistory(userText)
      : [{ role: "user", content: userText }];

    const requestBody = isOpenAI
      ? {
          __provider__: "openai",
          __base_url__: baseUrl,
          __api_key__: settings.apiKey.trim(),
          model: settings.model,
          messages: [
            { role: "system", content: systemPrompt },
            ...chatMessages,
          ],
          max_tokens: 16000,
        }
      : {
          __provider__: "claude",
          __base_url__: baseUrl,
          __api_key__: settings.apiKey.trim(),
          model: settings.model,
          max_tokens: 16000,
          system: systemPrompt,
          messages: chatMessages,
        };

    const proxyUrl = (settings.proxyUrl || "").trim() || (import.meta.env.VITE_AI_PROXY_URL || "https://functions.poehali.dev/60463e71-1a34-44dc-bde3-90a47fc07cba");

    let res: Response;
    try {
      res = await fetch(proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
    } catch (e) {
      throw new Error(`Сетевая ошибка: ${String(e)}`);
    }

    // Читаем ответ с прогрессом
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let rawText = "";
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        rawText += decoder.decode(value, { stream: true });
        if (onProgress) onProgress(rawText.length);
      }
    } else {
      rawText = await res.text();
    }

    let data: Record<string, unknown>;
    try { data = JSON.parse(rawText); } catch {
      throw new Error(`Сервер вернул не JSON (HTTP ${res.status}): ${rawText.slice(0, 200)}`);
    }

    if (!res.ok || data.error) {
      const errMsg = data.error as { message?: string } | string | undefined;
      const detail = typeof errMsg === "string" ? errMsg : errMsg?.message;
      throw new Error(`HTTP ${res.status}: ${detail || rawText.slice(0, 200)}`);
    }

    if (isOpenAI) {
      return (data.choices as { message: { content: string } }[])?.[0]?.message?.content ?? "";
    } else {
      return (data.content as { text: string }[])?.[0]?.text ?? "";
    }
  };

  const IMAGE_GENERATE_URL = "https://functions.poehali.dev/0f178db7-a08a-4911-8f10-5f45a0d585a3";

  const handleSendImage = useCallback(async (text: string) => {
    setCycleStatus("generating");
    setCycleLabel("Генерирую картинку...");
    try {
      const r = await fetch(IMAGE_GENERATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      const d = await r.json();
      if (d.url) {
        setCycleStatus("done");
        setCycleLabel("");
        setMessages(prev => [...prev, {
          id: ++msgCounter,
          role: "assistant",
          text: `Картинка готова!`,
          html: `__IMAGE__:${d.url}`,
        }]);
      } else {
        throw new Error(d.error || "Ошибка генерации");
      }
    } catch (err) {
      setCycleStatus("error");
      setCycleLabel("");
      const errText = err instanceof Error ? err.message : "Неизвестная ошибка";
      setMessages(prev => [...prev, { id: ++msgCounter, role: "assistant", text: `Ошибка: ${errText}` }]);
    }
  }, []);

  const handleSendChat = useCallback(async (text: string) => {
    if (!settings.apiKey) { setSettingsOpen(true); return; }
    setCycleStatus("generating");
    setCycleLabel("Думаю...");
    try {
      const chatSystemPrompt = `Ты дружелюбный AI-ассистент Lumen. Отвечай кратко и по делу на русском языке. Помогай с вопросами о сайтах, бизнесе, маркетинге и всём остальном.
${PROJECT_STRUCTURE}`;
      const response = await callAI(
        chatSystemPrompt,
        text,
        (chars) => setCycleLabel(`Думаю... ${chars} симв.`),
        true // передаём историю чата
      );
      setCycleStatus("done");
      setCycleLabel("");
      setMessages(prev => [...prev, { id: ++msgCounter, role: "assistant", text: response }]);
    } catch (err) {
      setCycleStatus("error");
      setCycleLabel("");
      const errText = err instanceof Error ? err.message : "Неизвестная ошибка";
      setMessages(prev => [...prev, { id: ++msgCounter, role: "assistant", text: `Ошибка: ${errText}` }]);
    }
  }, [settings, messages]);

  // ── Генерация SQL-миграции по запросу в чате ───────────────────────────────
  const [pendingSql, setPendingSql] = useState<{ sql: string; explanation: string } | null>(null);

  const handleSqlRequest = useCallback(async (text: string) => {
    if (!settings.apiKey) { setSettingsOpen(true); return; }
    setCycleStatus("generating");
    setCycleLabel("Генерирую SQL...");
    try {
      const raw = await callAI(SQL_MIGRATION_SYSTEM_PROMPT, text, (chars) =>
        setCycleLabel(`Генерирую SQL... ${chars} симв.`), true
      );
      let parsed: { sql: string; explanation: string };
      try {
        const match = raw.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(match ? match[0] : raw);
      } catch {
        parsed = { sql: raw, explanation: "SQL-миграция сгенерирована." };
      }
      setPendingSql(parsed);
      setCycleStatus("done");
      setCycleLabel("");
      setMessages(prev => [...prev, {
        id: ++msgCounter, role: "assistant",
        text: `SQL-миграция готова\n\n${parsed.explanation}\n\n${parsed.sql}\n\nНажмите кнопку «Скопировать SQL» ниже.`,
      }]);
    } catch (err) {
      setCycleStatus("error");
      setCycleLabel("");
      setMessages(prev => [...prev, { id: ++msgCounter, role: "assistant", text: `Ошибка: ${err instanceof Error ? err.message : String(err)}` }]);
    }
  }, [settings, messages]);

  const handleSend = useCallback(async (text: string, mode: ChatMode = "site") => {
    abortRef.current = false;
    const userMsg: Message = { id: ++msgCounter, role: "user", text };
    setMessages(prev => [...prev, userMsg]);
    setDeployResult(null);
    setPendingSql(null);

    if (mode === "chat") {
      // Если запрос про БД/SQL — генерируем миграцию
      const isSqlRequest = /создай таблиц|добавь колонк|измени схему|миграци|sql|create table|alter table|добавь поле|удали колонк|индекс|foreign key|база данных.*изменить|изменить.*базу/i.test(text);
      if (isSqlRequest) {
        await handleSqlRequest(text);
      } else {
        await handleSendChat(text);
      }
      return;
    }

    if (mode === "image") {
      await handleSendImage(text);
      return;
    }

    // ── Режим "site" ───────────────────────────────────────────────────────
    if (!settings.apiKey) { setSettingsOpen(true); return; }

    try {
      // ── Шаг 1: читаем текущий код ─────────────────────────────────────────
      let currentHtml = "";
      let systemPrompt = CREATE_SYSTEM_PROMPT;

      if (fullCodeContext) {
        currentHtml = fullCodeContext.html;
        systemPrompt = LOCAL_FILE_EDIT_PROMPT(currentHtml, fullCodeContext.fileName);
      } else if (ghSettings.token && ghSettings.repo) {
        setCycleStatus("reading");
        const filePath = (ghSettings.filePath || "index.html").trim().replace(/^\//, "");
        setCycleLabel(`Читаю ${filePath} из GitHub...`);
        const fetched = await fetchFromGitHub();
        if (fetched.ok && fetched.html) {
          currentHtml = fetched.html;
          setCurrentFileSha(fetched.sha);
          setCurrentFilePath(fetched.filePath);
          systemPrompt = EDIT_SYSTEM_PROMPT_FULL(currentHtml);
        }
      }

      if (abortRef.current) return;

      // ── Шаг 1.5: генерируем картинки если нужны ──────────────────────────
      let enrichedText = text;
      const wantsImages = /картинк|фото|изображени|баннер|галере|природ|интерьер|пейзаж|вид|товар|продукт|блюд|еда|ресторан|кафе|кофейн|магазин|спортзал|фитнес|отель|image|photo|banner|gallery|nature|landscape/i.test(text);
      if (wantsImages) {
        setCycleStatus("generating");
        setCycleLabel("Генерирую картинки...");
        const imgPromptsRaw = await callAI(
          `Пользователь просит создать сайт. Определи какие картинки нужны и придумай 2-3 коротких описания на английском языке для генерации изображений через AI.
Правила: описания должны точно соответствовать теме сайта, быть визуально красивыми, фотореалистичными.
Верни ТОЛЬКО JSON массив строк, например: ["modern gym interior with equipment", "fitness trainer with client"].
Без пояснений, только JSON.`,
          text
        );
        let imgPrompts: string[] = [];
        try {
          const match = imgPromptsRaw.match(/\[[\s\S]*?\]/);
          if (match) imgPrompts = JSON.parse(match[0]);
        } catch { imgPrompts = []; }

        if (imgPrompts.length > 0) {
          const generatedUrls: string[] = [];
          for (let i = 0; i < imgPrompts.length; i++) {
            if (abortRef.current) return;
            setCycleLabel(`Генерирую картинку ${i + 1}/${imgPrompts.length}...`);
            try {
              const r = await fetch(IMAGE_GENERATE_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: imgPrompts[i] }),
              });
              const d = await r.json();
              if (d.url) generatedUrls.push(d.url);
            } catch { /* продолжаем без этой картинки */ }
          }
          if (generatedUrls.length > 0) {
            const urlList = generatedUrls.map((u, i) => `URL картинки ${i + 1}: ${u}`).join("\n");
            enrichedText = `${text}

ВАЖНО: Я уже сгенерировал специальные картинки для этого сайта. ОБЯЗАТЕЛЬНО используй их в дизайне:
${urlList}

Требования к использованию картинок:
- Первая картинка — главный баннер/герой секция на всю ширину (object-fit: cover, height: 400-500px)
- Остальные картинки — в галерее, карточках или секциях сайта
- Все <img> должны иметь style="object-fit: cover" и заданные размеры
- НЕ используй placeholder-картинки — только переданные URL`;
          }
        }
      }

      if (abortRef.current) return;

      // ── Шаг 2: генерируем HTML ────────────────────────────────────────────
      setCycleStatus("generating");
      setCycleLabel("Создаю сайт...");

      // При редактировании (есть контекст) — передаём историю чата для памяти изменений
      const passHistory = !!(fullCodeContext || (ghSettings.token && ghSettings.repo && currentHtml));
      const rawResponse = await callAI(systemPrompt, enrichedText, (chars) => {
        setCycleLabel(`Создаю сайт... ${chars} симв.`);
      }, passHistory);
      const cleanHtml = extractHtml(rawResponse);

      if (!/<[a-z][\s\S]*>/i.test(cleanHtml)) {
        throw new Error(`Модель вернула не HTML: "${cleanHtml.slice(0, 200)}". Попробуйте ещё раз.`);
      }

      if (abortRef.current) return;

      const htmlWithBase = liveUrl ? injectBaseHref(cleanHtml, liveUrl) : cleanHtml;
      savePreviewHtml(injectLightTheme(htmlWithBase));
      setMobileTab("preview");

      const assistantId = ++msgCounter;
      const hasGitHub = !!(ghSettings.token && ghSettings.repo);
      setMessages(prev => [...prev, {
        id: assistantId,
        role: "assistant",
        text: currentHtml
          ? hasGitHub ? "Готово! Правки внесены. Загружаю в GitHub..." : "Готово! Правки внесены. Настройте GitHub чтобы сохранить."
          : hasGitHub ? "Готово! Сайт создан. Загружаю в GitHub..." : "Готово! Сайт создан. Настройте GitHub для сохранения.",
        html: cleanHtml,
      }]);

      // ── Показываем баннер о необходимости rebuild/публикации ──────────────
      setShowRebuildBanner(!ghSettings.token || !ghSettings.repo);

      // ── Шаг 3: автодеплой в GitHub ───────────────────────────────────────
      if (ghSettings.token && ghSettings.repo) {
        setCycleLabel("Загружаю в GitHub...");
        const filePath = currentFilePath || (ghSettings.filePath || "index.html").trim().replace(/^\//, "");
        const pushResult = await pushToGitHub(cleanHtml, "", filePath);

        if (pushResult.ok) {
          try {
            const fresh = await fetchFromGitHub();
            if (fresh.ok) {
              setCurrentFileSha(fresh.sha);
              setCurrentFilePath(fresh.filePath);
            }
          } catch (_e) { /* не критично */ }
        }

        setCycleStatus(pushResult.ok ? "done" : "error");
        setCycleLabel("");
        setDeployResult({ id: assistantId, ...pushResult });
        setTimeout(() => setDeployResult(null), pushResult.ok ? 8000 : 30000);
      } else {
        setCycleStatus("done");
        setCycleLabel("");
      }

    } catch (err) {
      if (!abortRef.current) {
        setCycleStatus("error");
        setCycleLabel("");
        const errText = err instanceof Error ? err.message : "Неизвестная ошибка";
        setMessages(prev => [...prev, { id: ++msgCounter, role: "assistant", text: `Ошибка: ${errText}` }]);
      }
    }
  }, [settings, ghSettings, fetchFromGitHub, pushToGitHub, currentFilePath, fullCodeContext, liveUrl, handleSendChat, handleSendImage, handleSqlRequest]);

  const handleApply = useCallback(async (msgId: number, html: string) => {
    if (!ghSettings.token) { setSettingsOpen(true); return; }
    setDeployingId(msgId);
    setDeployResult(null);

    const filePath = currentFilePath || (ghSettings.filePath || "index.html").trim().replace(/^\//, "");
    setCycleStatus("generating");
    setCycleLabel(`Сохраняю ${filePath} в GitHub...`);

    const result = await pushToGitHub(html, currentFileSha, filePath);

    if (result.ok) {
      // Обновляем sha после успешного пуша
      try {
        const fresh = await fetchFromGitHub();
        if (fresh.ok) {
          setCurrentFileSha(fresh.sha);
          setCurrentFilePath(fresh.filePath);
        }
      } catch (_e) { /* не критично */ }
    }

    setCycleStatus(result.ok ? "done" : "error");
    setCycleLabel("");
    setDeployingId(null);
    setDeployResult({ id: msgId, ...result });
    setTimeout(() => setDeployResult(null), result.ok ? 6000 : 30000);
  }, [ghSettings, pushToGitHub, fetchFromGitHub, currentFileSha, currentFilePath]);

  const handleStop = () => {
    abortRef.current = true;
    setCycleStatus("idle");
    setCycleLabel("");
  };

  const handleLoadFromGitHub = useCallback(async () => {
    if (!ghSettings.token || !ghSettings.repo) { setSettingsOpen(true); return; }
    setLoadingFromGitHub(true);
    const fetched = await fetchFromGitHub();
    setLoadingFromGitHub(false);
    if (fetched.ok && fetched.html) {
      setCurrentFileSha(fetched.sha);
      setCurrentFilePath(fetched.filePath);
      savePreviewHtml(injectLightTheme(liveUrl ? injectBaseHref(fetched.html, liveUrl) : fetched.html));
      setMobileTab("preview");
      const id = ++msgCounter;
      setMessages([{
        id,
        role: "assistant",
        text: `Загружен файл «${fetched.filePath}». Вижу ваш сайт. Опишите, что нужно изменить — внесу правки бережно.`,
      }]);
    } else {
      const id = ++msgCounter;
      setMessages([{
        id,
        role: "assistant",
        text: `Не удалось загрузить файл: ${fetched.message || "неизвестная ошибка"}. Проверьте настройки GitHub.`,
      }]);
    }
  }, [ghSettings, fetchFromGitHub]);

  const handleLoadLocalFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const html = ev.target?.result as string;
      if (!html) return;
      setFullCodeContext({ html, fileName: file.name });
      savePreviewHtml(injectLightTheme(liveUrl ? injectBaseHref(html, liveUrl) : html));
      setMobileTab("preview");
      setMessages([{
        id: ++msgCounter,
        role: "assistant",
        text: `Файл «${file.name}» загружен (${Math.round(file.size / 1024)} КБ). Вижу код. Опишите, что нужно изменить — отредактирую и сохраню в GitHub если настроен.`,
      }]);
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }, []);

  const handleNewProject = () => {
    setMessages([]);
    savePreviewHtml(null);
    setHtmlHistory([]);
    setCycleStatus("idle");
    setCycleLabel("");
    setMobileTab("chat");
    setDeployResult(null);
    setFullCodeContext(null);
  };

  const handleExport = () => {
    if (!previewHtml) return;
    const blob = new Blob([previewHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fullCodeContext?.fileName || "lumen-site.html";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Экспорт полного исходного кода проекта через GitHub API ───────────────
  const [exportingSource, setExportingSource] = useState(false);
  const handleExportSource = useCallback(async () => {
    if (!ghSettings.token || !ghSettings.repo) {
      setSettingsOpen(true);
      setMessages(prev => [...prev, {
        id: ++msgCounter, role: "assistant",
        text: "Для экспорта исходного кода нужно настроить GitHub — укажите токен и репозиторий в настройках.",
      }]);
      return;
    }
    setExportingSource(true);
    setCycleStatus("reading");
    setCycleLabel("Загружаю исходники из GitHub...");
    try {
      const [owner, repo] = ghSettings.repo.split("/");
      const headers = { Authorization: `Bearer ${ghSettings.token}`, Accept: "application/vnd.github+json" };

      // Получаем ZIP-архив репозитория через GitHub API
      const zipRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/zipball`, { headers });
      if (!zipRes.ok) throw new Error(`GitHub API: ${zipRes.status} ${zipRes.statusText}`);

      const blob = await zipRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${repo}-source.zip`;
      a.click();
      URL.revokeObjectURL(url);

      setCycleStatus("done");
      setCycleLabel("");
      setMessages(prev => [...prev, {
        id: ++msgCounter, role: "assistant",
        text: `✅ Исходный код скачан: ${repo}-source.zip\nАрхив содержит весь проект: /src, /backend, конфиги.\nРазверните на Reg.ru: распакуйте, выполните npm install && npm run build, укажите папку /dist как корень сайта.`,
      }]);
    } catch (err) {
      setCycleStatus("error");
      setCycleLabel("");
      const errText = err instanceof Error ? err.message : String(err);
      setMessages(prev => [...prev, {
        id: ++msgCounter, role: "assistant",
        text: `Ошибка загрузки исходников: ${errText}. Проверьте токен GitHub и название репозитория.`,
      }]);
    } finally {
      setExportingSource(false);
    }
  }, [ghSettings]);



  const handleApplyToGitHub = useCallback(async () => {
    if (!ghSettings.token || !ghSettings.repo) {
      setSettingsOpen(true);
      throw new Error("GitHub не настроен. Откройте настройки.");
    }
    if (!previewHtml) throw new Error("Нет кода для сохранения.");
    const filePath = currentFilePath || (ghSettings.filePath || "index.html").trim().replace(/^\//, "");
    const result = await pushToGitHub(previewHtml, currentFileSha, filePath);
    if (!result.ok) throw new Error(result.message || "Ошибка сохранения");
    try {
      const fresh = await fetchFromGitHub();
      if (fresh.ok) { setCurrentFileSha(fresh.sha); setCurrentFilePath(fresh.filePath); }
    } catch (_e) { /* не критично */ }
  }, [ghSettings, previewHtml, currentFilePath, currentFileSha, pushToGitHub, fetchFromGitHub]);

  const handleSaveSettings = (s: Settings) => {
    setSettings(s);
    localStorage.setItem("lumen_settings", JSON.stringify(s));
  };

  const topStatus: "idle" | "generating" | "done" | "error" =
    cycleStatus === "reading" ? "generating" : cycleStatus;

  return (
    <AnimatePresence mode="wait">
      {!authed ? (
        <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <LumenLoginPage onLogin={login} />
        </motion.div>
      ) : (
        <motion.div
          key="app"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="h-dvh flex flex-col bg-[#07070c] overflow-hidden"
          style={{ maxWidth: "100vw" }}
        >
          <LumenTopBar
            status={topStatus}
            cycleLabel={cycleLabel}
            onNewProject={handleNewProject}
            onExport={handleExport}
            onExportSource={ghSettings.token && ghSettings.repo ? handleExportSource : undefined}
            exportingSource={exportingSource}
            onSettings={() => setSettingsOpen(true)}
            onLogout={logout}
          />

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.htm"
            className="hidden"
            onChange={handleLoadLocalFile}
          />

          {/* Hidden ZIP input */}
          <input
            ref={zipInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={handleLoadZip}
          />

          {/* Rebuild notification banner */}
          {showRebuildBanner && (
            <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 bg-amber-950/60 border-b border-amber-500/30 text-xs">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-amber-300 font-medium">Внесены правки в код — нажмите «Опубликовать» или сделайте пересборку проекта</span>
              <button
                onClick={() => setShowRebuildBanner(false)}
                className="ml-auto text-amber-400/50 hover:text-amber-400 transition-colors text-[10px] px-2 py-0.5 rounded border border-amber-500/20 hover:border-amber-500/40"
              >
                ✕
              </button>
            </div>
          )}

          {/* Local file context banner */}
          {fullCodeContext && (
            <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 bg-[#0d0d18] border-b border-cyan-500/20 text-xs">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-white/40">Локальный файл:</span>
              <span className="text-cyan-400 font-mono font-medium">{fullCodeContext.fileName}</span>
              <button
                onClick={() => setFullCodeContext(null)}
                className="ml-auto text-white/20 hover:text-white/60 transition-colors text-[10px] px-2 py-0.5 rounded border border-white/10 hover:border-white/20"
              >
                ✕ сбросить
              </button>
            </div>
          )}

          {/* GitHub file context banner */}
          {!fullCodeContext && currentFilePath && (
            <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 bg-[#0d0d18] border-b border-[#9333ea]/20 text-xs">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-white/40">Редактируется:</span>
              <span className="text-emerald-400 font-mono font-medium">{currentFilePath}</span>
              <span className="text-white/20 ml-auto font-mono">{ghSettings.repo}</span>
            </div>
          )}

          {/* Mobile tab switcher */}
          <div className="md:hidden flex shrink-0 border-b border-white/[0.06] bg-[#0a0a0f]">
            {(["chat", "preview"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setMobileTab(tab)}
                className={`flex-1 py-2.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                  mobileTab === tab
                    ? "text-[#9333ea] border-b-2 border-[#9333ea]"
                    : "text-white/40 border-b-2 border-transparent"
                }`}
              >
                {tab === "chat" ? <><span>💬</span> Чат</> : <><span>🖥️</span> Сайт</>}
              </button>
            ))}
          </div>

          {/* Main content */}
          <div className="flex-1 min-h-0 overflow-hidden relative md:flex md:gap-2 md:p-2">
            <div className={`flex flex-col h-full md:w-[420px] md:flex-none bg-[#0a0a0f] md:static ${mobileTab === "chat" ? "absolute inset-0 z-10 flex" : "hidden md:flex"}`}>
              <ChatPanel
                status={cycleStatus}
                cycleLabel={cycleLabel}
                messages={messages}
                onSend={handleSend}
                onStop={handleStop}
                onApply={handleApply}
                deployingId={deployingId}
                deployResult={deployResult}
                liveUrl={liveUrl}
                onOpenPreview={() => setMobileTab("preview")}
                onLoadFromGitHub={handleLoadFromGitHub}
                loadingFromGitHub={loadingFromGitHub}
                currentFilePath={ghSettings.filePath || "index.html"}
                onLoadLocalFile={() => fileInputRef.current?.click()}
                hasLocalFile={!!fullCodeContext}
                localFileName={fullCodeContext?.fileName}
                pendingSql={pendingSql}
              />
            </div>

            <div className={`flex flex-col h-full flex-1 min-w-0 ${mobileTab === "preview" ? "flex" : "hidden md:flex"}`}>
              <LivePreview
                status={topStatus}
                previewHtml={previewHtml}
                liveUrl={liveUrl}
                onApplyToGitHub={ghSettings.token && ghSettings.repo ? handleApplyToGitHub : undefined}
                onDownload={previewHtml ? handleExport : undefined}
                onUndo={htmlHistory.length > 0 ? handleUndo : undefined}
                canUndo={htmlHistory.length > 0}
                onLoadFile={() => fileInputRef.current?.click()}
                onLoadZip={() => zipInputRef.current?.click()}
                convertingZip={convertingZip}
              />
            </div>
          </div>

          <SettingsDrawer
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            settings={settings}
            onSave={handleSaveSettings}
            ghSettings={ghSettings}
            onSaveGh={saveGhSettings}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}