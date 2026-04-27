import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import LumenTopBar from "./LumenTopBar";
import LivePreview from "./LivePreview";
import ChatPanel from "./ChatPanel";
import SettingsDrawer from "./SettingsDrawer";
import LumenLoginPage from "./LumenLoginPage";
import { useLumenAuth } from "./useLumenAuth";
import { useGitHub } from "./useGitHub";
import Icon from "@/components/ui/icon";

type Status = "idle" | "generating" | "done" | "error";
type MobileTab = "chat" | "preview";

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
  const { ghSettings, saveGhSettings, pushToGitHub } = useGitHub();
  const [status, setStatus] = useState<Status>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
  const [ghPushing, setGhPushing] = useState(false);
  const [ghResult, setGhResult] = useState<{ ok: boolean; message: string } | null>(null);
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

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(`Сервер вернул не JSON (HTTP ${res.status}). Ответ: ${rawText.slice(0, 200)}`);
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

      const mdMatch = html.match(/```html\s*\n([\s\S]*?)```/i) || html.match(/```\s*\n([\s\S]*?)```/);
      if (mdMatch) html = mdMatch[1].trim();
      const tagMatch = html.match(/(<!DOCTYPE[\s\S]*)/i) || html.match(/(<html[\s\S]*)/i);
      const cleanHtml = tagMatch ? tagMatch[1].trim() : html.trim();

      const hasHtml = /<[a-z][\s\S]*>/i.test(cleanHtml);
      if (!hasHtml) {
        throw new Error(`Модель вернула не HTML. Ответ: "${cleanHtml.slice(0, 300)}". Попробуйте ещё раз или смените модель.`);
      }

      if (!abortRef.current) {
        setPreviewHtml(cleanHtml);
        setStatus("done");
        setMobileTab("preview");
        setGhResult(null);
        setMessages(prev => [...prev, {
          id: ++msgCounter,
          role: "assistant",
          text: "Готово! Сайт сгенерирован. Хотите что-то изменить?",
        }]);
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
    setMobileTab("chat");
    setGhResult(null);
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

  const handlePushToGitHub = async () => {
    if (!previewHtml) return;
    if (!ghSettings.token) {
      setSettingsOpen(true);
      return;
    }
    setGhPushing(true);
    setGhResult(null);
    const result = await pushToGitHub(previewHtml);
    setGhResult(result);
    setGhPushing(false);
    setTimeout(() => setGhResult(null), 5000);
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
          className="h-dvh flex flex-col bg-[#07070c] overflow-hidden"
          style={{ maxWidth: "100vw" }}
        >
          <LumenTopBar
            status={status}
            onNewProject={handleNewProject}
            onExport={handleExport}
            onSettings={() => setSettingsOpen(true)}
            onLogout={logout}
          />

          {/* Mobile tab switcher */}
          <div className="md:hidden flex shrink-0 border-b border-white/[0.06] bg-[#0a0a0f]">
            <button
              onClick={() => setMobileTab("chat")}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                mobileTab === "chat"
                  ? "text-[#9333ea] border-b-2 border-[#9333ea]"
                  : "text-white/40 border-b-2 border-transparent"
              }`}
            >
              <span>💬</span> Чат
            </button>
            <button
              onClick={() => setMobileTab("preview")}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                mobileTab === "preview"
                  ? "text-[#9333ea] border-b-2 border-[#9333ea]"
                  : "text-white/40 border-b-2 border-transparent"
              }`}
            >
              <span>🖥️</span> Сайт
            </button>
          </div>

          {/* Main content */}
          <div className="flex-1 min-h-0 overflow-hidden md:flex md:gap-2 md:p-2">
            <div className={`flex flex-col h-full md:w-96 md:flex-none ${mobileTab === "chat" ? "block" : "hidden md:flex"}`}>
              <ChatPanel
                status={status}
                messages={messages}
                onSend={handleSend}
                onStop={handleStop}
                onOpenPreview={() => setMobileTab("preview")}
              />
            </div>

            <div className={`flex flex-col h-full flex-1 min-w-0 ${mobileTab === "preview" ? "flex" : "hidden md:flex"}`}>
              <LivePreview html={previewHtml} />

              {/* GitHub push button — показывается когда есть сгенерированный HTML */}
              {previewHtml && (
                <div className="shrink-0 px-3 py-2 border-t border-white/[0.06] bg-[#0a0a0f] flex items-center gap-2">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handlePushToGitHub}
                    disabled={ghPushing}
                    className={`flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-semibold transition-all ${
                      ghPushing
                        ? "bg-[#9333ea]/20 text-purple-300 cursor-wait"
                        : "bg-[#9333ea] hover:bg-[#7e22ce] text-white"
                    }`}
                  >
                    <Icon name={ghPushing ? "Loader" : "Github"} size={13} className={ghPushing ? "animate-spin" : ""} />
                    {ghPushing ? "Отправка..." : "Обновить мой сайт"}
                  </motion.button>

                  <AnimatePresence>
                    {ghResult && (
                      <motion.span
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        className={`text-xs font-medium ${ghResult.ok ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {ghResult.ok ? "✓ " : "✕ "}{ghResult.message}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              )}
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
