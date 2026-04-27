import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Icon from "@/components/ui/icon";
import { GitHubSettings } from "./useGitHub";

interface AISettings {
  apiKey: string;
  provider: "openai" | "claude";
  model: string;
  baseUrl: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  settings: AISettings;
  onSave: (s: AISettings) => void;
  ghSettings: GitHubSettings;
  onSaveGh: (s: GitHubSettings) => void;
}

const MODELS = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  claude: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5"],
};

type Tab = "ai" | "github";

export default function SettingsDrawer({ open, onClose, settings, onSave, ghSettings, onSaveGh }: Props) {
  const [tab, setTab] = useState<Tab>("ai");
  const [form, setForm] = useState(settings);
  const [ghForm, setGhForm] = useState(ghSettings);
  const [showKey, setShowKey] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onSave(form);
    onSaveGh(ghForm);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          <motion.div
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed top-0 right-0 h-full w-full max-w-sm bg-[#0a0a12] border-l border-white/[0.07] z-50 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#9333ea]/20 to-indigo-600/20 border border-[#9333ea]/20 flex items-center justify-center">
                  <Icon name="Settings" size={14} className="text-[#9333ea]" />
                </div>
                <span className="text-white font-semibold text-sm">Настройки Lumen</span>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
              >
                <Icon name="X" size={15} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-white/[0.06] px-5 pt-3 gap-4">
              {([["ai", "Настройки ИИ", "Cpu"], ["github", "GitHub", "Github"]] as const).map(([key, label, icon]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex items-center gap-1.5 pb-2.5 text-xs font-semibold border-b-2 transition-all ${
                    tab === key
                      ? "border-[#9333ea] text-[#9333ea]"
                      : "border-transparent text-white/30 hover:text-white/60"
                  }`}
                >
                  <Icon name={icon} size={13} />
                  {label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">

              {tab === "ai" && (
                <>
                  {/* Provider */}
                  <div>
                    <label className="text-white/40 text-xs font-medium uppercase tracking-wider block mb-2">Провайдер ИИ</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["openai", "claude"] as const).map((p) => (
                        <button
                          key={p}
                          onClick={() => setForm(f => ({ ...f, provider: p, model: MODELS[p][0], baseUrl: p === "openai" ? (import.meta.env.VITE_DEFAULT_OPENAI_BASE || "https://proxyapi.ru") : (import.meta.env.VITE_DEFAULT_CLAUDE_BASE || "https://api.anthropic.com") }))}
                          className={`h-9 rounded-lg border text-sm font-medium transition-all ${
                            form.provider === p
                              ? "border-[#9333ea]/50 bg-[#9333ea]/10 text-purple-300"
                              : "border-white/[0.08] bg-white/[0.03] text-white/40 hover:text-white/70 hover:border-white/20"
                          }`}
                        >
                          {p === "openai" ? "OpenAI" : "Claude"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Model */}
                  <div>
                    <label className="text-white/40 text-xs font-medium uppercase tracking-wider block mb-2">Модель</label>
                    <div className="flex flex-col gap-1.5">
                      {MODELS[form.provider].map((m) => (
                        <button
                          key={m}
                          onClick={() => setForm(f => ({ ...f, model: m }))}
                          className={`h-9 px-3 rounded-lg border text-sm font-mono text-left transition-all flex items-center justify-between ${
                            form.model === m
                              ? "border-[#9333ea]/40 bg-[#9333ea]/10 text-purple-300"
                              : "border-white/[0.06] bg-white/[0.02] text-white/40 hover:text-white/60 hover:border-white/15"
                          }`}
                        >
                          {m}
                          {form.model === m && <Icon name="Check" size={13} className="text-[#9333ea]" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* API Key */}
                  <div>
                    <label className="text-white/40 text-xs font-medium uppercase tracking-wider block mb-2">API Ключ</label>
                    <div className="relative">
                      <input
                        type={showKey ? "text" : "password"}
                        value={form.apiKey}
                        onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                        placeholder={form.provider === "openai" ? "sk-..." : "sk-ant-..."}
                        className="w-full h-9 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 pr-10 text-white/70 text-sm font-mono placeholder:text-white/20 outline-none focus:border-[#9333ea]/40 transition-colors"
                      />
                      <button
                        onClick={() => setShowKey(p => !p)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
                      >
                        <Icon name={showKey ? "EyeOff" : "Eye"} size={14} />
                      </button>
                    </div>
                    <p className="text-white/20 text-xs mt-1.5">Хранится только в браузере.</p>
                  </div>

                  {/* Base URL */}
                  <div>
                    <label className="text-white/40 text-xs font-medium uppercase tracking-wider block mb-2">Base URL (Адрес прокси)</label>
                    <input
                      type="text"
                      value={form.baseUrl}
                      onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value.trim() }))}
                      placeholder={form.provider === "openai" ? "proxyapi.ru" : "https://api.anthropic.com"}
                      className="w-full h-9 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 text-white/70 text-sm font-mono placeholder:text-white/20 outline-none focus:border-[#9333ea]/40 transition-colors"
                    />
                    <p className="text-white/20 text-xs mt-1.5">Для ProxyAPI: proxyapi.ru</p>
                  </div>

                  <div className="bg-[#9333ea]/5 border border-[#9333ea]/15 rounded-xl p-3.5">
                    <div className="flex items-start gap-2.5">
                      <Icon name="Info" size={14} className="text-[#9333ea] mt-0.5 shrink-0" />
                      <p className="text-white/40 text-xs leading-relaxed">
                        Lumen отправляет запросы напрямую из браузера. Убедитесь, что у ключа есть доступ к нужной модели.
                      </p>
                    </div>
                  </div>
                </>
              )}

              {tab === "github" && (
                <>
                  <div className="bg-[#9333ea]/5 border border-[#9333ea]/20 rounded-xl p-3.5">
                    <div className="flex items-start gap-2.5">
                      <Icon name="Github" size={14} className="text-[#9333ea] mt-0.5 shrink-0" />
                      <p className="text-white/50 text-xs leading-relaxed">
                        Укажи Personal Access Token и репозиторий — кнопка «Обновить мой сайт» будет отправлять сгенерированный HTML прямо в <span className="text-white/70 font-mono">index.html</span> репозитория.
                      </p>
                    </div>
                  </div>

                  {/* GitHub Token */}
                  <div>
                    <label className="text-white/40 text-xs font-medium uppercase tracking-wider block mb-2">
                      GitHub Personal Token
                    </label>
                    <div className="relative">
                      <input
                        type={showToken ? "text" : "password"}
                        value={ghForm.token}
                        onChange={e => setGhForm(f => ({ ...f, token: e.target.value.trim() }))}
                        placeholder="ghp_..."
                        className="w-full h-9 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 pr-10 text-white/70 text-sm font-mono placeholder:text-white/20 outline-none focus:border-[#9333ea]/40 transition-colors"
                      />
                      <button
                        onClick={() => setShowToken(p => !p)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
                      >
                        <Icon name={showToken ? "EyeOff" : "Eye"} size={14} />
                      </button>
                    </div>
                    <p className="text-white/20 text-xs mt-1.5 leading-relaxed">
                      Нужны права: <span className="font-mono text-white/30">repo</span> (Contents: Read & Write).
                    </p>
                  </div>

                  {/* Repo Path */}
                  <div>
                    <label className="text-white/40 text-xs font-medium uppercase tracking-wider block mb-2">
                      Repository Path
                    </label>
                    <input
                      type="text"
                      value={ghForm.repo}
                      onChange={e => setGhForm(f => ({ ...f, repo: e.target.value.trim() }))}
                      placeholder="username/repo-name"
                      className="w-full h-9 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 text-white/70 text-sm font-mono placeholder:text-white/20 outline-none focus:border-[#9333ea]/40 transition-colors"
                    />
                    <p className="text-white/20 text-xs mt-1.5">Формат: <span className="font-mono">username/repo</span></p>
                  </div>

                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5 flex flex-col gap-1.5">
                    <p className="text-white/30 text-xs font-semibold uppercase tracking-wider">Как получить Token</p>
                    <p className="text-white/30 text-xs leading-relaxed">
                      GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token → выбери <span className="font-mono text-white/50">repo</span>
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-white/[0.06]">
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSave}
                className={`w-full h-10 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                  saved
                    ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-400"
                    : "bg-[#9333ea] hover:bg-[#7e22ce] text-white"
                }`}
              >
                {saved
                  ? <><Icon name="Check" size={15} />Сохранено</>
                  : <><Icon name="Save" size={15} />Сохранить настройки</>
                }
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}