import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import LumenTopBar from "./LumenTopBar";
import LivePreview from "./LivePreview";
import ChatPanel from "./ChatPanel";
import SettingsDrawer from "./SettingsDrawer";
import LumenLoginPage from "./LumenLoginPage";
import { useLumenAuth } from "./useLumenAuth";

type Status = "idle" | "generating" | "done" | "error";

interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
}

interface Settings {
  apiKey: string;
  provider: "openai" | "claude";
  model: string;
  baseUrl: string;
}

const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  provider: "openai",
  model: "gpt-4o-mini",
  baseUrl: "https://proxyapi.ru",
};

const SYSTEM_PROMPT = `Ты — генератор сайтов. В ответ на описание пользователя верни ТОЛЬКО полный HTML-документ (<!DOCTYPE html>...) с встроенными CSS-стилями в теге <style>. Никакого объяснения, никакого markdown — только чистый HTML. Стиль: современный, красивый, тёмная тема, адаптивный.`;

let msgCounter = 0;

export default function LumenApp() {
  const { authed, login, logout } = useLumenAuth();
  const [status, setStatus] = useState<Status>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const saved = localStorage.getItem("lumen_settings");
      return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const abortRef = { current: false };

  const handleSend = useCallback(async (text: string) => {
    if (!settings.apiKey) {
      setSettingsOpen(true);
      return;
    }

    const userMsg: Message = { id: ++msgCounter, role: "user", text };
    setMessages(prev => [...prev, userMsg]);
    setStatus("generating");
    abortRef.current = false;

    try {
      let html = "";

      const PROXY_URL = "https://functions.poehali.dev/60463e71-1a34-44dc-bde3-90a47fc07cba";

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
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: text },
            ],
            max_tokens: 4096,
          }
        : {
            __provider__: "claude",
            __base_url__: baseUrl,
            __api_key__: settings.apiKey.trim(),
            model: settings.model,
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: text }],
          };

      console.log("[Lumen] proxy →", PROXY_URL, "| base:", baseUrl, "| provider:", settings.provider);

      let res: Response;
      try {
        res = await fetch(PROXY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
      } catch (networkErr) {
        throw new Error(`Сетевая ошибка (нет связи с сервером): ${String(networkErr)}`);
      }

      const rawText = await res.text();
      console.log("[Lumen] response status:", res.status, "| body:", rawText.slice(0, 300));

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(
          `Сервер вернул не JSON (HTTP ${res.status}). Ответ: ${rawText.slice(0, 200)}`
        );
      }

      if (!res.ok || data.error) {
        const errMsg = (data.error as { message?: string } | string | undefined);
        const detail = typeof errMsg === "string" ? errMsg : errMsg?.message;
        const endpoint = data.__endpoint__ ? `\nURL: ${data.__endpoint__}` : "";
        throw new Error(`HTTP ${res.status}: ${detail || rawText.slice(0, 200)}${endpoint}`);
      }

      if (isOpenAI) {
        html = (data.choices as { message: { content: string } }[])?.[0]?.message?.content ?? "";
      } else {
        html = (data.content as { text: string }[])?.[0]?.text ?? "";
      }


      // extract HTML if wrapped in markdown
      const htmlMatch = html.match(/```html\n?([\s\S]*?)```/) || html.match(/(<!DOCTYPE[\s\S]*)/i);
      const cleanHtml = htmlMatch ? (htmlMatch[1] || htmlMatch[0]) : html;

      if (!abortRef.current) {
        setPreviewHtml(cleanHtml);
        setStatus("done");
        const assistantMsg: Message = {
          id: ++msgCounter,
          role: "assistant",
          text: "Сайт сгенерирован! Вы можете посмотреть его в превью слева. Хотите что-то изменить?",
        };
        setMessages(prev => [...prev, assistantMsg]);
      }
    } catch (err) {
      if (!abortRef.current) {
        setStatus("error");
        const errText = err instanceof Error ? err.message : "Неизвестная ошибка";
        setMessages(prev => [...prev, { id: ++msgCounter, role: "assistant", text: `Ошибка: ${errText}` }]);
      }
    }
  }, [settings]);

  const handleStop = () => {
    abortRef.current = true;
    setStatus("idle");
  };

  const handleNewProject = () => {
    setMessages([]);
    setPreviewHtml(null);
    setStatus("idle");
  };

  const handleExport = () => {
    if (!previewHtml) return;
    const blob = new Blob([previewHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lumen-site.html";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveSettings = (s: Settings) => {
    setSettings(s);
    localStorage.setItem("lumen_settings", JSON.stringify(s));
  };

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
          className="h-screen flex flex-col bg-[#07070c] overflow-hidden"
        >
          <LumenTopBar
            status={status}
            onNewProject={handleNewProject}
            onExport={handleExport}
            onSettings={() => setSettingsOpen(true)}
            onLogout={logout}
          />

          {/* Main area */}
          <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
            <LivePreview status={status} previewHtml={previewHtml} />
            <ChatPanel
              status={status}
              messages={messages}
              onSend={handleSend}
              onStop={handleStop}
            />
          </div>

          <SettingsDrawer
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            settings={settings}
            onSave={handleSaveSettings}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}