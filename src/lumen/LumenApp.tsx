import { useState, useCallback, useRef } from "react";
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
  model: "gpt-4o-mini",
  baseUrl: import.meta.env.VITE_DEFAULT_OPENAI_BASE || "https://proxyapi.ru",
  proxyUrl: import.meta.env.VITE_AI_PROXY_URL || "https://functions.poehali.dev/60463e71-1a34-44dc-bde3-90a47fc07cba",
};


const CREATE_SYSTEM_PROMPT = `Ты — генератор сайтов. В ответ на описание пользователя верни ТОЛЬКО полный HTML-документ без единого слова объяснений и без markdown-блоков.

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА — нарушение недопустимо:

1. СТРУКТУРА ДОКУМЕНТА:
   - Начинай строго с <!DOCTYPE html>, заканчивай </html>
   - Все пути к ресурсам — ТОЛЬКО относительные: assets/... (без ведущего слэша)
   - Кодировка: <meta charset="UTF-8">
   - Viewport: <meta name="viewport" content="width=device-width, initial-scale=1.0">

2. TAILWIND CSS — подключай ВСЕГДА первым в <head>:
   <script src="https://cdn.tailwindcss.com"></script>
   После него конфигурируй через <script>tailwind.config = { ... }</script> если нужны кастомные цвета.

3. LUCIDE ICONS — подключай ВСЕГДА:
   <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
   Использование иконок: <i data-lucide="имя-иконки"></i>
   В конце <body> вызывай: <script>lucide.createIcons();</script>

4. ДИЗАЙН — строго тёмный glassmorphism:
   - Фон: тёмный градиент (slate-900, gray-950, black)
   - Карточки: backdrop-blur-xl, bg-white/5, border border-white/10, rounded-2xl
   - Текст: белый/серый (text-white, text-gray-300, text-gray-400)
   - Акценты: фиолетовый/индиго/циан (violet-500, indigo-400, cyan-400)
   - Кнопки: градиентные bg-gradient-to-r, с hover-эффектами и transition
   - Тени: shadow-2xl, drop-shadow с цветными glow-эффектами

5. НИКАКИХ внешних изображений (img src с http). Только SVG-иконки через Lucide или CSS-фигуры.

6. Адаптивность обязательна (mobile-first через Tailwind breakpoints).`;

const EDIT_SYSTEM_PROMPT_FULL = (currentHtml: string) =>
  `Ты — хирургический редактор HTML. Твоя задача — внести ТОЛЬКО запрошенное изменение, сохранив весь остальной код в первозданном виде.

ЖЁСТКИЕ ПРАВИЛА — нарушение недопустимо:

1. Верни ТОЛЬКО полный HTML-документ (<!DOCTYPE html>...), без объяснений, без markdown.
2. ЗАПРЕЩЕНО удалять, переименовывать или переписывать любые классы, стили, анимации, цвета, шрифты, отступы — если пользователь об этом не просил.
3. ЗАПРЕЩЕНО менять подключённые CDN (Tailwind, Lucide, шрифты, скрипты) — они должны остаться точно такими же.
4. ЗАПРЕЩЕНО изменять структуру секций, порядок блоков, атрибуты id/class — если пользователь об этом не просил.
5. Меняй строго и только то, что описано в запросе пользователя. Всё остальное — скопируй без изменения символа.
6. Все пути к ресурсам — относительные (assets/..., без ведущего слэша).
7. Если запрос неоднозначен — делай минимальное изменение, а не максимальное.

--- ТЕКУЩИЙ КОД САЙТА (сохрани его полностью, правь только нужное) ---
${currentHtml}
--- КОНЕЦ КОДА ---`;



let msgCounter = 0;

export default function LumenApp() {
  const { authed, login, logout } = useLumenAuth();
  const { ghSettings, saveGhSettings, fetchFromGitHub, pushToGitHub } = useGitHub();

  const liveUrl = (() => {
    const [user, repo] = (ghSettings.repo || "").split("/");
    return user && repo ? `https://${user}.github.io/${repo}/` : "";
  })();

  const [cycleStatus, setCycleStatus] = useState<CycleStatus>("idle");
  const [cycleLabel, setCycleLabel] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
  const [deployingId, setDeployingId] = useState<number | null>(null);
  const [deployResult, setDeployResult] = useState<{ id: number; ok: boolean; message: string } | null>(null);
  const [currentFileSha, setCurrentFileSha] = useState<string>("");
  const [currentFilePath, setCurrentFilePath] = useState<string>("");
  const [loadingFromGitHub, setLoadingFromGitHub] = useState(false);

  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const saved = localStorage.getItem("lumen_settings");
      return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    } catch { return DEFAULT_SETTINGS; }
  });

  const abortRef = useRef(false);

  const extractHtml = (raw: string): string => {
    const mdMatch = raw.match(/```html\s*\n([\s\S]*?)```/i) || raw.match(/```\s*\n([\s\S]*?)```/);
    if (mdMatch) raw = mdMatch[1].trim();
    const tagMatch = raw.match(/(<!DOCTYPE[\s\S]*)/i) || raw.match(/(<html[\s\S]*)/i);
    return tagMatch ? tagMatch[1].trim() : raw.trim();
  };

  const callAI = async (systemPrompt: string, userText: string): Promise<string> => {
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
          max_tokens: 8192,
        }
      : {
          __provider__: "claude",
          __base_url__: baseUrl,
          __api_key__: settings.apiKey.trim(),
          model: settings.model,
          max_tokens: 8192,
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

    const rawText = await res.text();
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
      // ── Шаг 1: читаем текущий код из GitHub ──────────────────────────────
      let currentHtml = "";
      let systemPrompt = CREATE_SYSTEM_PROMPT;

      if (ghSettings.token && ghSettings.repo) {
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
      setCycleLabel("Генерирую правки...");

      const rawResponse = await callAI(systemPrompt, text);
      const cleanHtml = extractHtml(rawResponse);

      if (!/<[a-z][\s\S]*>/i.test(cleanHtml)) {
        throw new Error(`Модель вернула не HTML: "${cleanHtml.slice(0, 200)}". Попробуйте ещё раз.`);
      }

      if (abortRef.current) return;

      setCycleStatus("done");
      setCycleLabel("");
      setPreviewHtml(cleanHtml);
      setMobileTab("preview");

      const assistantId = ++msgCounter;
      setMessages(prev => [...prev, {
        id: assistantId,
        role: "assistant",
        text: currentHtml
          ? "Готово! Правки внесены. Нажмите «Применить изменения», чтобы обновить сайт в GitHub."
          : "Готово! Сайт создан. Нажмите «Применить изменения», чтобы опубликовать в GitHub.",
        html: cleanHtml,
      }]);

    } catch (err) {
      if (!abortRef.current) {
        setCycleStatus("error");
        setCycleLabel("");
        const errText = err instanceof Error ? err.message : "Неизвестная ошибка";
        setMessages(prev => [...prev, { id: ++msgCounter, role: "assistant", text: `Ошибка: ${errText}` }]);
      }
    }
  }, [settings, ghSettings, fetchFromGitHub]);

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
      setPreviewHtml(fetched.html);
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

  const handleNewProject = () => {
    setMessages([]);
    setPreviewHtml(null);
    setCycleStatus("idle");
    setCycleLabel("");
    setMobileTab("chat");
    setDeployResult(null);
  };

  const handleExport = () => {
    if (!previewHtml) return;
    const blob = new Blob([previewHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "lumen-site.html"; a.click();
    URL.revokeObjectURL(url);
  };

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

          {/* File context banner */}
          {currentFilePath && (
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
              />
            </div>

            <div className={`flex flex-col h-full flex-1 min-w-0 ${mobileTab === "preview" ? "flex" : "hidden md:flex"}`}>
              <LivePreview status={topStatus} previewHtml={previewHtml} />
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