import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Icon from "@/components/ui/icon";
import { Message } from "./LumenApp";

type CycleStatus = "idle" | "reading" | "generating" | "done" | "error";
export type ChatMode = "chat" | "image" | "site";

interface Props {
  status: CycleStatus;
  cycleLabel: string;
  messages: Message[];
  onSend: (text: string, mode: ChatMode) => void;
  onStop: () => void;
  onApply: (msgId: number, html: string) => Promise<void>;
  deployingId: number | null;
  deployResult: { id: number; ok: boolean; message: string } | null;
  liveUrl: string;
  onOpenPreview?: () => void;
  onLoadFromGitHub?: () => void;
  loadingFromGitHub?: boolean;
  currentFilePath?: string;
  onLoadLocalFile?: () => void;
  hasLocalFile?: boolean;
  localFileName?: string;
}

const CYCLE_STEPS: { key: CycleStatus; label: string; icon: string }[] = [
  { key: "reading",    label: "Читаю текущий код...",    icon: "Download"  },
  { key: "generating", label: "Генерирую правки...",      icon: "Sparkles"  },
];

const SUGGESTIONS: Record<ChatMode, string[]> = {
  chat: [
    "Что такое SEO и зачем он нужен?",
    "Как увеличить продажи через сайт?",
    "Объясни что такое лендинг",
    "Какие цвета подходят для бизнес-сайта?",
  ],
  image: [
    "Красивый офис с панорамными окнами",
    "Команда профессионалов за работой",
    "Современный ресторан с уютной атмосферой",
    "Спортивный зал с современным оборудованием",
  ],
  site: [
    "Лендинг для фитнес-клуба с тарифами",
    "Портфолио дизайнера с галереей работ",
    "Сайт кофейни с меню и адресом",
    "Интернет-магазин одежды с каталогом",
  ],
};

const MODE_CONFIG: Record<ChatMode, { label: string; icon: string; placeholder: string; color: string }> = {
  chat: {
    label: "Чат",
    icon: "MessageCircle",
    placeholder: "Задайте любой вопрос...",
    color: "#3b82f6",
  },
  image: {
    label: "Картинки",
    icon: "Image",
    placeholder: "Опишите картинку которую хотите создать...",
    color: "#10b981",
  },
  site: {
    label: "Сайт",
    icon: "Globe",
    placeholder: "Опишите сайт который хотите создать...",
    color: "#9333ea",
  },
};

export default function ChatPanel({
  status, cycleLabel, messages, onSend, onStop, onApply,
  deployingId, deployResult, liveUrl, onOpenPreview,
  onLoadFromGitHub, loadingFromGitHub, currentFilePath,
  onLoadLocalFile, hasLocalFile, localFileName,
}: Props) {
  const [value, setValue] = useState("");
  const [kbOffset, setKbOffset] = useState(0);
  const [mode, setMode] = useState<ChatMode>("chat");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => setKbOffset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => { vv.removeEventListener("resize", onResize); vv.removeEventListener("scroll", onResize); };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const isActive = status === "reading" || status === "generating";
  const modeConfig = MODE_CONFIG[mode];

  const handleSend = () => {
    if (!value.trim() || isActive) return;
    onSend(value.trim(), mode);
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  return (
    <div
      className="w-full h-full flex flex-col bg-[#0a0a0f] overflow-hidden"
      style={{ paddingBottom: kbOffset > 0 ? kbOffset : undefined }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2 shrink-0">
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: modeConfig.color }} />
        <span className="text-white/60 text-xs font-medium tracking-wide uppercase">AI Ассистент</span>
      </div>

      {/* Mode Switcher */}
      <div className="px-3 py-2.5 border-b border-white/[0.06] shrink-0">
        <div className="flex gap-1 p-1 bg-white/[0.04] rounded-xl">
          {(Object.keys(MODE_CONFIG) as ChatMode[]).map((m) => {
            const cfg = MODE_CONFIG[m];
            const isSelected = mode === m;
            return (
              <motion.button
                key={m}
                onClick={() => setMode(m)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-[11px] font-semibold transition-all relative"
                style={{
                  color: isSelected ? cfg.color : "rgba(255,255,255,0.35)",
                }}
                whileTap={{ scale: 0.97 }}
              >
                {isSelected && (
                  <motion.div
                    layoutId="mode-bg"
                    className="absolute inset-0 rounded-lg"
                    style={{ backgroundColor: cfg.color + "20", border: `1px solid ${cfg.color}40` }}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.35 }}
                  />
                )}
                <Icon name={cfg.icon} size={13} />
                <span className="relative z-10">{cfg.label}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        <AnimatePresence initial={false}>

          {/* Suggestions — empty state */}
          {messages.length === 0 && !isActive && (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-2 mt-2">
              <p className="text-white/30 text-xs font-medium mb-1">
                {mode === "chat" && "Спросите что-нибудь:"}
                {mode === "image" && "Или выберите пример:"}
                {mode === "site" && "Или создать:"}
              </p>
              {SUGGESTIONS[mode].map((s, i) => (
                <motion.button
                  key={s}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  onClick={() => { setValue(s); textareaRef.current?.focus(); }}
                  className="text-left px-3 py-2 rounded-lg border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.07] text-white/50 hover:text-white/80 text-xs transition-all"
                  style={{ ["--hover-border" as string]: modeConfig.color + "30" }}
                >
                  {s}
                </motion.button>
              ))}

              {/* Доп. кнопки для режима сайта */}
              {mode === "site" && (onLoadFromGitHub || onLoadLocalFile) && (
                <div className="flex gap-2 mt-1 flex-wrap">
                  {onLoadFromGitHub && (
                    <button
                      onClick={onLoadFromGitHub}
                      disabled={loadingFromGitHub}
                      className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-white/[0.05] border border-white/[0.10] hover:bg-white/[0.10] text-white/50 hover:text-white/70 text-[10px] font-semibold transition-colors disabled:opacity-50"
                    >
                      <Icon name={loadingFromGitHub ? "Loader2" : "Github"} size={11} />
                      {currentFilePath ? `Редактирую: ${currentFilePath}` : "Загрузить из GitHub"}
                    </button>
                  )}
                  {onLoadLocalFile && (
                    <button
                      onClick={onLoadLocalFile}
                      className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-white/[0.05] border border-white/[0.10] hover:bg-white/[0.10] text-white/50 hover:text-white/70 text-[10px] font-semibold transition-colors"
                    >
                      <Icon name="Upload" size={11} />
                      {hasLocalFile ? localFileName : "Загрузить файл"}
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* Messages */}
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={`flex flex-col gap-1.5 ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              {/* Image message */}
              {msg.role === "assistant" && msg.html && msg.html.startsWith("__IMAGE__:") && (
                <div className="flex flex-col gap-2 items-start max-w-[90%]">
                  <img
                    src={msg.html.replace("__IMAGE__:", "")}
                    alt={msg.text}
                    className="rounded-xl border border-white/[0.10] max-w-full"
                    style={{ maxHeight: 280, objectFit: "cover" }}
                  />
                  <div className="flex gap-2">
                    <a
                      href={msg.html.replace("__IMAGE__:", "")}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 h-6 px-2.5 rounded-md bg-white/[0.06] border border-white/[0.10] hover:bg-white/[0.12] text-white/50 hover:text-white/80 text-[10px] font-semibold transition-colors"
                    >
                      <Icon name="Download" size={10} />
                      Скачать
                    </a>
                  </div>
                </div>
              )}

              {/* Regular text message */}
              {!(msg.role === "assistant" && msg.html && msg.html.startsWith("__IMAGE__:")) && (
                <div className={`max-w-[90%] px-3 py-2.5 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "text-white rounded-tr-sm"
                    : "bg-white/[0.05] border border-white/[0.08] text-white/70 rounded-tl-sm"
                }`}
                style={msg.role === "user" ? { backgroundColor: modeConfig.color + "cc" } : {}}
                >
                  {msg.text}
                </div>
              )}

              {/* Кнопки под ответом с HTML-сайтом */}
              {msg.role === "assistant" && msg.html && !msg.html.startsWith("__IMAGE__:") && (
                <div className="flex items-center gap-2 ml-1 flex-wrap">
                  <button
                    onClick={() => {
                      const blob = new Blob([msg.html!], { type: "text/html" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "index.html";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="flex items-center gap-1 h-6 px-2.5 rounded-md bg-white/[0.06] border border-white/[0.10] hover:bg-white/[0.12] text-white/50 hover:text-white/80 text-[10px] font-semibold transition-colors"
                  >
                    <Icon name="Download" size={10} />
                    Скачать .html
                  </button>

                  {onOpenPreview && (
                    <button
                      onClick={onOpenPreview}
                      className="flex items-center gap-1 h-6 px-2.5 rounded-md bg-white/[0.06] border border-white/[0.10] hover:bg-white/[0.12] text-white/50 hover:text-white/80 text-[10px] font-semibold transition-colors"
                    >
                      <Icon name="Eye" size={10} />
                      Превью
                    </button>
                  )}

                  {deployResult?.id === msg.id && (
                    <motion.div
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 flex-wrap"
                    >
                      <span className={`text-xs font-medium ${deployResult.ok ? "text-emerald-400" : "text-red-400"}`}>
                        {deployResult.ok ? "✓ Обновлено в GitHub" : `✕ ${deployResult.message}`}
                      </span>
                      {deployResult.ok && liveUrl && (
                        <a
                          href={liveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 h-6 px-2.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 text-emerald-400 text-[10px] font-semibold transition-colors"
                        >
                          <Icon name="ExternalLink" size={10} />
                          Посмотреть сайт
                        </a>
                      )}
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>
          ))}

          {/* Cycle status indicator */}
          {isActive && (
            <motion.div
              key="cycle"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-2"
            >
              <div className="flex gap-2 items-center flex-wrap">
                {mode === "image" ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold"
                    style={{ backgroundColor: "#10b98120", borderColor: "#10b98140", color: "#10b981" }}>
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}>
                      <Icon name="Loader2" size={10} />
                    </motion.div>
                    {cycleLabel || "Генерирую картинку..."}
                  </div>
                ) : mode === "chat" ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold"
                    style={{ backgroundColor: "#3b82f620", borderColor: "#3b82f640", color: "#3b82f6" }}>
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}>
                      <Icon name="Loader2" size={10} />
                    </motion.div>
                    {cycleLabel || "Думаю..."}
                  </div>
                ) : (
                  CYCLE_STEPS.map((step) => {
                    const isCurrentStep = status === step.key;
                    const isDone = step.key === "reading" && status === "generating";
                    return (
                      <div key={step.key} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold transition-all ${
                        isCurrentStep
                          ? "bg-[#9333ea]/15 border-[#9333ea]/40 text-[#9333ea]"
                          : isDone
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                            : "bg-white/[0.03] border-white/[0.07] text-white/25"
                      }`}>
                        {isCurrentStep ? (
                          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}>
                            <Icon name="Loader2" size={10} />
                          </motion.div>
                        ) : isDone ? (
                          <Icon name="Check" size={10} />
                        ) : (
                          <Icon name={step.icon} size={10} />
                        )}
                        {isCurrentStep ? (cycleLabel || step.label) : step.label}
                      </div>
                    );
                  })
                )}

                <button
                  onClick={onStop}
                  className="flex items-center gap-1 h-6 px-2.5 rounded-md bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 text-[10px] font-semibold transition-colors ml-auto"
                >
                  <Icon name="Square" size={9} />
                  Стоп
                </button>
              </div>
            </motion.div>
          )}

          <div ref={bottomRef} />
        </AnimatePresence>
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 shrink-0 border-t border-white/[0.06]">
        <div className="flex items-end gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 focus-within:border-opacity-60 transition-all"
          style={{ ["--focus-color" as string]: modeConfig.color }}
        >
          <div className="shrink-0 mb-0.5 opacity-50">
            <Icon name={modeConfig.icon} size={14} style={{ color: modeConfig.color }} />
          </div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={modeConfig.placeholder}
            disabled={isActive}
            rows={1}
            className="flex-1 bg-transparent text-white/80 placeholder-white/25 text-xs resize-none outline-none leading-relaxed disabled:opacity-50"
            style={{ maxHeight: 120 }}
          />
          <motion.button
            onClick={handleSend}
            disabled={!value.trim() || isActive}
            className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-white disabled:opacity-30 transition-all mb-0.5"
            style={{ backgroundColor: value.trim() && !isActive ? modeConfig.color : "rgba(255,255,255,0.08)" }}
            whileTap={{ scale: 0.9 }}
          >
            <Icon name="ArrowUp" size={13} />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
