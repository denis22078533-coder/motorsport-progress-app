import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import LumenTopBar from "./LumenTopBar";
import LivePreview from "./LivePreview";
import ChatPanel from "./ChatPanel";
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
  model: "gpt-4o",
  baseUrl: import.meta.env.VITE_DEFAULT_OPENAI_BASE || "https://proxyapi.ru",
  proxyUrl: import.meta.env.VITE_AI_PROXY_URL || "https://functions.poehali.dev/60463e71-1a34-44dc-bde3-90a47fc07cba",
};


const CREATE_SYSTEM_PROMPT = `Выполняй запрос пользователя точно и буквально.
Если просят сайт — верни ТОЛЬКО полный HTML-документ (<!DOCTYPE html>...</html>) без объяснений и markdown.
Используй Tailwind CSS (<script src="https://cdn.tailwindcss.com"></script>), Lucide иконки и Google Fonts через CDN если нужно.`;

const EDIT_SYSTEM_PROMPT_FULL = (currentHtml: string) =>
  `Выполняй запрос пользователя точно и буквально. Верни ТОЛЬКО полный HTML-документ без объяснений и markdown.

--- ТЕКУЩИЙ КОД САЙТА ---
${currentHtml}
--- КОНЕЦ КОДА ---`;

const ZIP_CONVERT_SYSTEM_PROMPT = `Ты — эксперт по конвертации React/Vite проектов в HTML. Твоя ЕДИНСТВЕННАЯ задача — точно воссоздать существующий сайт из предоставленных файлов проекта в виде одного HTML файла.

СТРОГИЕ ПРАВИЛА:
1. Верни ТОЛЬКО полный HTML-документ (<!DOCTYPE html>...) — без объяснений, без markdown.
2. ЗАПРЕЩЕНО придумывать новый дизайн, цвета, тексты — воссоздавай ТОЧНО то что есть в файлах.
3. Сохраняй все тексты, заголовки, описания, названия из оригинальных файлов проекта.
4. Сохраняй цветовую схему, шрифты, стили из оригинала.
5. Подключай через CDN: Tailwind CSS, Lucide иконки, Google Fonts (если используются).
6. Весь JS — инлайн в <script> тегах.
7. Адаптивность обязательна.`;

const LOCAL_FILE_EDIT_PROMPT = (currentHtml: string, fileName: string) =>
  `Выполняй запрос пользователя точно и буквально. Верни ТОЛЬКО полный HTML-документ без объяснений и markdown.

--- ТЕКУЩИЙ КОД ФАЙЛА «${fileName}» ---
${currentHtml}
--- КОНЕЦ КОДА ---`;



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
  const [previewHtml, setPreviewHtml] = useState<string | null>(() => {
    try { return localStorage.getItem("lumen_last_html") || null; } catch { return null; }
  });
  const [htmlHistory, setHtmlHistory] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
  const [deployingId, setDeployingId] = useState<number | null>(null);
  const [deployResult, setDeployResult] = useState<{ id: number; ok: boolean; message: string } | null>(null);
  const [currentFileSha, setCurrentFileSha] = useState<string>("");
  const [currentFilePath, setCurrentFilePath] = useState<string>("");
  const [loadingFromGitHub, setLoadingFromGitHub] = useState(false);
  const [fullCodeContext, setFullCodeContext] = useState<{ html: string; fileName: string } | null>(null);
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

      // Ищем готовый index.html — сначала в dist/, потом в корне
      const candidates = ["dist/index.html", "build/index.html", "index.html"];
      let foundHtml = "";
      let foundPath = "";

      for (const candidate of candidates) {
        const entry = zip.file(candidate);
        if (entry) {
          foundHtml = await entry.async("string");
          foundPath = candidate;
          break;
        }
      }

      // Если не нашли по точным путям — ищем любой index.html в архиве
      if (!foundHtml) {
        zip.forEach((relativePath: string, zipEntry: { dir: boolean; async: (t: string) => Promise<string> }) => {
          if (!foundHtml && !zipEntry.dir && relativePath.endsWith("index.html")) {
            foundPath = relativePath;
          }
        });
        if (foundPath) {
          foundHtml = await zip.file(foundPath)!.async("string");
        }
      }

      if (foundHtml) {
        // Нашли готовый HTML — показываем сразу без ИИ
        const htmlWithBase = liveUrl ? injectBaseHref(foundHtml, liveUrl) : foundHtml;
        savePreviewHtml(htmlWithBase);
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
        savePreviewHtml(htmlWithBase);
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

  const callAI = async (systemPrompt: string, userText: string, onProgress?: (chars: number) => void): Promise<string> => {
    const rawBase = (settings.baseUrl || "").trim().replace(/\/+$/, "");
    const baseUrl = rawBase || "https://proxyapi.ru";
    const isOpenAI = settings.provider === "openai";

    const requestBody = isOpenAI
      ? {
          __provider__: "openai",
          __base_url__: baseUrl,
          __api_key__: settings.apiKey.trim(),
          model: settings.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userText },
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
          messages: [{ role: "user", content: userText }],
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

  const handleSend = useCallback(async (text: string) => {
    if (!settings.apiKey) { setSettingsOpen(true); return; }
    abortRef.current = false;

    const userMsg: Message = { id: ++msgCounter, role: "user", text };
    setMessages(prev => [...prev, userMsg]);
    setDeployResult(null);

    try {
      // ── Шаг 1: читаем текущий код ─────────────────────────────────────────
      let currentHtml = "";
      let systemPrompt = CREATE_SYSTEM_PROMPT;

      // Приоритет: локально загруженный файл → GitHub
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

      // ── Шаг 2: генерируем правки ──────────────────────────────────────────
      setCycleStatus("generating");
      setCycleLabel("Генерирую...");

      const rawResponse = await callAI(systemPrompt, text, (chars) => {
        setCycleLabel(`Генерирую... ${chars} симв.`);
      });
      const cleanHtml = extractHtml(rawResponse);

      if (!/<[a-z][\s\S]*>/i.test(cleanHtml)) {
        throw new Error(`Модель вернула не HTML: "${cleanHtml.slice(0, 200)}". Попробуйте ещё раз.`);
      }

      if (abortRef.current) return;

      const htmlWithBase = liveUrl ? injectBaseHref(cleanHtml, liveUrl) : cleanHtml;
      savePreviewHtml(htmlWithBase);
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
  }, [settings, ghSettings, fetchFromGitHub, pushToGitHub, currentFilePath]);

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
      savePreviewHtml(liveUrl ? injectBaseHref(fetched.html, liveUrl) : fetched.html);
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
      savePreviewHtml(liveUrl ? injectBaseHref(html, liveUrl) : html);
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
          <div className="flex-1 min-h-0 overflow-hidden md:flex md:gap-2 md:p-2">
            <div className={`flex flex-col h-full md:w-[420px] md:flex-none ${mobileTab === "chat" ? "flex" : "hidden md:flex"}`}>
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