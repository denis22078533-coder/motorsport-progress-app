import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import LumenTopBar from "./LumenTopBar";
import ChatPanel from "./ChatPanel";
import SettingsDrawer from "./SettingsDrawer";
import LumenLoginPage from "./LumenLoginPage";
import WidgetZone from "./WidgetZone";
import { useLumenAuth } from "./useLumenAuth";
import { useGitHub } from "./useGitHub";

type CycleStatus = "idle" | "reading" | "generating" | "done" | "error";

export interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
  html?: string; // HTML-результат, который можно задеплоить
}

export interface Widget {
  id: string;
  kind: "button" | "image" | "text" | "icon" | "card";
  label?: string;
  icon?: string;
  imageUrl?: string;
  action?: string;
  color?: string;
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


const ACTIONS_SYSTEM_PROMPT = (state: { theme: Record<string, string>; widgets: Widget[] }) =>
  `Ты — управляющий интерфейсом Lumen. Получаешь команду пользователя и возвращаешь СТРОГО валидный JSON со списком действий, которые Lumen применит к самому себе. Без markdown, без объяснений.

Формат:
{
  "actions": [ ... ],
  "comment": "Короткая фраза по-русски о том, что сделано"
}

ДОСТУПНЫЕ ACTIONS:

1. setTheme — меняет цвета интерфейса
   { "type": "setTheme", "theme": { "bg": "#fff", "accent": "#10b981", "text": "#000", "panel": "...", "accentHover": "...", "textMuted": "...", "border": "..." } }
   Указывай только те поля, что меняешь. Контраст обязателен.

2. addWidget — добавляет элемент в зону виджетов Lumen
   { "type": "addWidget", "widget": {
       "id": "уникальный-id",
       "kind": "button" | "image" | "text" | "icon" | "card",
       "label": "Текст (для button/text/card)",
       "icon": "имя-lucide-иконки (Mic, Heart, Star...) — для button/icon/card",
       "imageUrl": "URL картинки — для image",
       "action": "alert:текст" | "open:https://..." | "voice" | "copy:текст" | "none",
       "color": "hex-цвет (опционально)"
     } }

3. removeWidget — удаляет виджет по id
   { "type": "removeWidget", "id": "..." }

4. updateWidget — меняет существующий виджет
   { "type": "updateWidget", "id": "...", "patch": { "label": "...", "icon": "...", "color": "..." } }

5. clearWidgets — удаляет все виджеты
   { "type": "clearWidgets" }

6. setPlaceholder — меняет плейсхолдер поля ввода
   { "type": "setPlaceholder", "text": "..." }

7. setLogo — меняет букву/эмодзи в логотипе Lumen
   { "type": "setLogo", "text": "L" }

8. notify — показать всплывающее сообщение
   { "type": "notify", "text": "...", "level": "info" | "success" | "error" }

ПРАВИЛА:
- Возвращай минимум нужных действий. Не ломай существующее без необходимости.
- icon: только реальные имена иконок lucide-react в PascalCase (Mic, Phone, Heart, Star, Bell, Camera, Image, Send и т.п.).
- Если просят "добавь кнопку ввода голосом" → addWidget с kind:"button", icon:"Mic", label:"Голосовой ввод", action:"voice".
- Если просят "добавь фото X" → addWidget с kind:"image", imageUrl: подходящий URL (можно использовать https://images.unsplash.com/photo-... или https://picsum.photos/seed/КЛЮЧ/600/400).
- Если просят "добавь иконку сердце" → addWidget с kind:"icon", icon:"Heart".
- Если просят "удали кнопку голос" — removeWidget с id виджета голоса (смотри текущий список).
- Если просят "перепиши текст подсказки на ..." — setPlaceholder.
- Если просят "проанализируй дизайн" — верни actions:[] и в comment напиши анализ (2-4 предложения).
- comment всегда — краткое русское описание выполненного.

ТЕКУЩЕЕ СОСТОЯНИЕ:
${JSON.stringify(state, null, 2)}`;



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

  const [widgets, setWidgets] = useState<Widget[]>(() => {
    try { return JSON.parse(localStorage.getItem("lumen_widgets") || "[]"); }
    catch { return []; }
  });
  const [placeholder, setPlaceholder] = useState<string>(() =>
    localStorage.getItem("lumen_placeholder") || "");
  const [logoText, setLogoText] = useState<string>(() =>
    localStorage.getItem("lumen_logo") || "L");
  const [toast, setToast] = useState<{ text: string; level: "info" | "success" | "error" } | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    Object.entries(theme).forEach(([k, v]) => {
      root.style.setProperty(`--lumen-${k}`, v);
    });
    try { localStorage.setItem("lumen_theme", JSON.stringify(theme)); } catch (_e) { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    try { localStorage.setItem("lumen_widgets", JSON.stringify(widgets)); } catch (_e) { /* ignore */ }
  }, [widgets]);
  useEffect(() => { localStorage.setItem("lumen_placeholder", placeholder); }, [placeholder]);
  useEffect(() => { localStorage.setItem("lumen_logo", logoText); }, [logoText]);

  const handleWidgetAction = useCallback((action?: string) => {
    if (!action || action === "none") return;
    if (action === "voice") {
      const W = window as unknown as { webkitSpeechRecognition?: new () => unknown; SpeechRecognition?: new () => unknown };
      const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
      if (!SR) { setToast({ text: "Голосовой ввод не поддерживается браузером", level: "error" }); return; }
      try {
        const rec = new (SR as new () => { lang: string; onresult: (e: { results: { 0: { 0: { transcript: string } } }[] }) => void; onerror: () => void; start: () => void }) ();
        rec.lang = "ru-RU";
        rec.onresult = (e) => {
          const txt = e.results[0][0].transcript;
          setToast({ text: `Распознано: ${txt}`, level: "success" });
        };
        rec.onerror = () => setToast({ text: "Ошибка распознавания", level: "error" });
        rec.start();
        setToast({ text: "Слушаю...", level: "info" });
      } catch {
        setToast({ text: "Не удалось запустить микрофон", level: "error" });
      }
      return;
    }
    if (action.startsWith("alert:")) { setToast({ text: action.slice(6), level: "info" }); return; }
    if (action.startsWith("open:")) { window.open(action.slice(5), "_blank"); return; }
    if (action.startsWith("copy:")) {
      navigator.clipboard?.writeText(action.slice(5));
      setToast({ text: "Скопировано", level: "success" });
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const applyActions = useCallback((actions: Array<Record<string, unknown>>) => {
    actions.forEach((a) => {
      const type = a.type as string;
      if (type === "setTheme" && a.theme && typeof a.theme === "object") {
        const t = a.theme as Record<string, string>;
        setTheme((prev) => {
          const next = { ...prev };
          ["bg", "panel", "accent", "accentHover", "text", "textMuted", "border"].forEach((k) => {
            if (t[k] && typeof t[k] === "string") next[k] = t[k];
          });
          return next;
        });
      } else if (type === "addWidget" && a.widget) {
        const w = a.widget as Widget;
        if (!w.id) w.id = `w_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        setWidgets((prev) => [...prev.filter((x) => x.id !== w.id), w]);
      } else if (type === "removeWidget" && typeof a.id === "string") {
        setWidgets((prev) => prev.filter((x) => x.id !== a.id));
      } else if (type === "updateWidget" && typeof a.id === "string" && a.patch) {
        const patch = a.patch as Partial<Widget>;
        setWidgets((prev) => prev.map((x) => (x.id === a.id ? { ...x, ...patch } : x)));
      } else if (type === "clearWidgets") {
        setWidgets([]);
      } else if (type === "setPlaceholder" && typeof a.text === "string") {
        setPlaceholder(a.text);
      } else if (type === "setLogo" && typeof a.text === "string") {
        setLogoText(a.text.slice(0, 4));
      } else if (type === "notify" && typeof a.text === "string") {
        setToast({ text: a.text, level: (a.level as "info" | "success" | "error") || "info" });
      }
    });
  }, []);

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
      setCycleLabel("Думаю...");

      const rawResponse = await callAI(ACTIONS_SYSTEM_PROMPT({ theme, widgets }), text);

      if (abortRef.current) return;

      const parsed = extractJson(rawResponse) as unknown as { actions?: Array<Record<string, unknown>>; comment?: string };
      const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
      const comment = (parsed.comment || "").toString();

      applyActions(actions);

      setCycleStatus("done");
      setCycleLabel("");

      setMessages(prev => [...prev, {
        id: ++msgCounter,
        role: "assistant",
        text: comment || (actions.length ? `Готово! Применено действий: ${actions.length}` : "Готово!"),
      }]);

    } catch (err) {
      if (!abortRef.current) {
        setCycleStatus("error");
        setCycleLabel("");
        const errText = err instanceof Error ? err.message : "Неизвестная ошибка";
        setMessages(prev => [...prev, { id: ++msgCounter, role: "assistant", text: `Ошибка: ${errText}` }]);
      }
    }
  }, [settings, theme, widgets, applyActions]);

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
    setWidgets([]);
    setPlaceholder("");
    setLogoText("L");
    setMessages(prev => [...prev, { id: ++msgCounter, role: "assistant", text: "Lumen сброшен к стандартному виду." }]);
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
            logoText={logoText}
            onNewProject={handleNewProject}
            onResetTheme={handleResetTheme}
            onSettings={() => setSettingsOpen(true)}
            onLogout={logout}
          />

          <WidgetZone
            widgets={widgets}
            onAction={handleWidgetAction}
            onRemove={(id) => setWidgets((prev) => prev.filter((w) => w.id !== id))}
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
              placeholder={placeholder}
            />
          </div>

          {/* Toast */}
          <AnimatePresence>
            {toast && (
              <motion.div
                key="toast"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-xl text-xs font-medium shadow-2xl border max-w-[90vw]"
                style={{
                  background: toast.level === "error" ? "rgba(239,68,68,0.95)" : toast.level === "success" ? "rgba(16,185,129,0.95)" : "var(--lumen-panel, rgba(0,0,0,0.9))",
                  borderColor: "var(--lumen-border, rgba(255,255,255,0.1))",
                  color: "#fff",
                }}
              >
                {toast.text}
              </motion.div>
            )}
          </AnimatePresence>

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