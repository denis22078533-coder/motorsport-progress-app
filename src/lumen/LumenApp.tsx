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
}

const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  provider: "openai",
  model: "gpt-4o-mini",
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

      if (settings.provider === "openai") {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${settings.apiKey}`,
          },
          body: JSON.stringify({
            model: settings.model,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: text },
            ],
            max_tokens: 4096,
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        html = data.choices?.[0]?.message?.content ?? "";
      } else {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": settings.apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({
            model: settings.model,
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: text }],
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        html = data.content?.[0]?.text ?? "";
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