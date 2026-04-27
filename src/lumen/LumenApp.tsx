import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import LumenTopBar from "./LumenTopBar";
import ChatPanel from "./ChatPanel";
import SettingsDrawer from "./SettingsDrawer";
import LumenLoginPage from "./LumenLoginPage";
import { useLumenAuth } from "./useLumenAuth";
import { useGitHub } from "./useGitHub";

type CycleStatus = "idle" | "reading" | "generating" | "done" | "error";

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


const THEME_SYSTEM_PROMPT = (currentTheme: Record<string, string>) =>
  `Ты — стилист интерфейса Lumen. Пользователь описывает желаемое изменение внешнего вида самого приложения Lumen (фон, цвет акцента, цвет текста, кнопок и т.д.).

Твоя задача — вернуть СТРОГО валидный JSON без единого слова объяснений и без markdown-блоков.

Формат ответа:
{
  "bg": "#0a0a0f",
  "panel": "#111118",
  "accent": "#9333ea",
  "accentHover": "#7e22ce",
  "text": "#ffffff",
  "textMuted": "rgba(255,255,255,0.6)",
  "border": "rgba(255,255,255,0.08)",
  "comment": "Короткое описание того, что изменилось (1 фраза по-русски)"
}

ПРАВИЛА:
1. Все цвета — валидные CSS: HEX (#rrggbb), rgb(), rgba(), либо CSS-имена.
2. Меняй ТОЛЬКО то, что просит пользователь. Остальные поля — оставь как в текущей теме.
3. Контраст обязателен: текст должен быть читаемым на фоне.
4. Если просят "светлую тему" — bg светлый, text тёмный. Если "тёмную" — наоборот.
5. accent и accentHover должны отличаться (hover темнее или насыщеннее).
6. comment — короткая фраза, что именно изменилось.

ТЕКУЩАЯ ТЕМА:
${JSON.stringify(currentTheme, null, 2)}`;



let msgCounter = 0;

export default function LumenApp() {
  const { authed, login, logout } = useLumenAuth();
  const { ghSettings, saveGhSettings } = useGitHub();

  const [cycleStatus, setCycleStatus] = useState<CycleStatus>("idle");
  const [cycleLabel, setCycleLabel] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deployResult, setDeployResult] = useState<{ id: number; ok: boolean; message: string } | null>(null);

  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const saved = localStorage.getItem("lumen_settings");
      return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    } catch { return DEFAULT_SETTINGS; }
  });

  const DEFAULT_THEME: Record<string, string> = {
    bg: "#0a0a0f",
    panel: "#111118",
    accent: "#9333ea",
    accentHover: "#7e22ce",
    text: "#ffffff",
    textMuted: "rgba(255,255,255,0.6)",
    border: "rgba(255,255,255,0.08)",
  };

  const [theme, setTheme] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem("lumen_theme");
      return saved ? { ...DEFAULT_THEME, ...JSON.parse(saved) } : DEFAULT_THEME;
    } catch { return DEFAULT_THEME; }
  });

  useEffect(() => {
    const root = document.documentElement;
    Object.entries(theme).forEach(([k, v]) => {
      root.style.setProperty(`--lumen-${k}`, v);
    });
    try { localStorage.setItem("lumen_theme", JSON.stringify(theme)); } catch (_e) { /* ignore */ }
  }, [theme]);

  const abortRef = useRef(false);

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

  const extractJson = (raw: string): Record<string, string> => {
    const md = raw.match(/```json\s*\n([\s\S]*?)```/i) || raw.match(/```\s*\n([\s\S]*?)```/);
    const txt = md ? md[1].trim() : raw.trim();
    const start = txt.indexOf("{");
    const end = txt.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("Модель не вернула JSON");
    return JSON.parse(txt.slice(start, end + 1));
  };

  const handleSend = useCallback(async (text: string) => {
    if (!settings.apiKey) { setSettingsOpen(true); return; }
    abortRef.current = false;

    const userMsg: Message = { id: ++msgCounter, role: "user", text };
    setMessages(prev => [...prev, userMsg]);
    setDeployResult(null);

    try {
      setCycleStatus("generating");
      setCycleLabel("Подбираю стиль для Lumen...");

      const rawResponse = await callAI(THEME_SYSTEM_PROMPT(theme), text);

      if (abortRef.current) return;

      const parsed = extractJson(rawResponse);
      const comment = (parsed.comment || "").toString();
      const newTheme = { ...theme };
      ["bg", "panel", "accent", "accentHover", "text", "textMuted", "border"].forEach((k) => {
        if (parsed[k] && typeof parsed[k] === "string") newTheme[k] = parsed[k];
      });

      setTheme(newTheme);
      setCycleStatus("done");
      setCycleLabel("");

      setMessages(prev => [...prev, {
        id: ++msgCounter,
        role: "assistant",
        text: comment ? `Готово! ${comment}` : "Готово! Стиль Lumen обновлён.",
      }]);

    } catch (err) {
      if (!abortRef.current) {
        setCycleStatus("error");
        setCycleLabel("");
        const errText = err instanceof Error ? err.message : "Неизвестная ошибка";
        setMessages(prev => [...prev, { id: ++msgCounter, role: "assistant", text: `Ошибка: ${errText}` }]);
      }
    }
  }, [settings, theme]);

  const handleStop = () => {
    abortRef.current = true;
    setCycleStatus("idle");
    setCycleLabel("");
  };

  const handleNewProject = () => {
    setMessages([]);
    setCycleStatus("idle");
    setCycleLabel("");
    setDeployResult(null);
  };

  const handleResetTheme = () => {
    setTheme(DEFAULT_THEME);
    setMessages(prev => [...prev, { id: ++msgCounter, role: "assistant", text: "Тема сброшена к стандартной." }]);
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
          className="h-dvh flex flex-col overflow-hidden"
          style={{ maxWidth: "100vw", background: "var(--lumen-bg, #07070c)" }}
        >
          <LumenTopBar
            status={topStatus}
            cycleLabel={cycleLabel}
            onNewProject={handleNewProject}
            onResetTheme={handleResetTheme}
            onSettings={() => setSettingsOpen(true)}
            onLogout={logout}
          />

          {/* Main content — only chat */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ChatPanel
              status={cycleStatus}
              cycleLabel={cycleLabel}
              messages={messages}
              onSend={handleSend}
              onStop={handleStop}
              deployResult={deployResult}
            />
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