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

const SUGGESTIONS = [
  { text: "Сайт кофейни с меню и фотографиями", icon: "Globe" },
  { text: "Нарисуй красивый закат над морем", icon: "Image" },
  { text: "Как сделать сайт заметным в Google?", icon: "MessageCircle" },
  { text: "Лендинг для фитнес-клуба с тарифами", icon: "Globe" },
];

function detectMode(text: string): ChatMode {
  const t = text.toLowerCase();
  // Сайт проверяем ПЕРВЫМ — если есть слово "сайт/лендинг" — это всегда сайт, даже если упоминаются картинки
  const siteWords = /сайт|лендинг|страниц|портфолио|интернет.магазин|визитк|html|создай сайт|сделай сайт|напиши сайт/i;
  if (siteWords.test(t)) return "site";
  // Только если нет слова "сайт" — проверяем на картинку
  const imageWords = /^нарисуй|^сгенери|^создай фото|^создай картин|^сделай фото|^генер|нарисуй|draw |painting |photo of |image of /i;
  if (imageWords.test(t)) return "image";
  // Дополнительно: если только про картинку без сайта
  const pureImageWords = /^(красив|сгенер|нарисуй|покажи|создай изображ)/i;
  if (pureImageWords.test(t)) return "image";
  return "chat";
}

const CYCLE_STEPS: { key: CycleStatus; label: string; icon: string }[] = [
  { key: "reading",    label: "Читаю текущий код...", icon: "Download" },
  { key: "generating", label: "Генерирую...",          icon: "Sparkles" },
];

const MODE_COLORS: Record<ChatMode, string> = {
  chat:  "#3b82f6",
  image: "#10b981",
  site:  "#9333ea",
};

const MODE_LABELS: Record<ChatMode, { icon: string; text: string }> = {
  chat:  { icon: "MessageCircle", text: "Отвечаю..." },
  image: { icon: "Image",         text: "Рисую картинку..." },
  site:  { icon: "Globe",         text: "Создаю сайт..." },
};

export default function ChatPanel({
  status, cycleLabel, messages, onSend, onStop, onApply,
  deployingId, deployResult, liveUrl, onOpenPreview,
  onLoadFromGitHub, loadingFromGitHub, currentFilePath,
  onLoadLocalFile, hasLocalFile, localFileName,
}: Props) {
  const [value, setValue] = useState("");
  const [kbOffset, setKbOffset] = useState(0);
  const [lastMode, setLastMode] = useState<ChatMode>("chat");
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
  const detectedMode = value.trim() ? detectMode(value) : lastMode;
  const activeColor = MODE_COLORS[detectedMode];

  const handleSend = () => {
    if (!value.trim() || isActive) return;
    const mode = detectMode(value.trim());
    setLastMode(mode);
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

  // Показываем подсказку какой режим определён
  const modeHint = value.trim() ? (
    detectedMode === "image" ? "🎨 Создам картинку" :
    detectedMode === "site"  ? "🌐 Создам сайт" :
    "💬 Отвечу на вопрос"
  ) : null;

  return (
    <div
      className="w-full h-full flex flex-col bg-[#0a0a0f] overflow-hidden"
      style={{ paddingBottom: kbOffset > 0 ? kbOffset : undefined }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2 shrink-0">
        <motion.div
          className="w-1.5 h-1.5 rounded-full"
          animate={{ backgroundColor: activeColor }}
          transition={{ duration: 0.4 }}
        />
        <span className="text-white/60 text-xs font-medium tracking-wide uppercase">AI Ассистент</span>
        <div className="ml-auto flex gap-1.5">
          {onLoadFromGitHub && (
            <button
              onClick={onLoadFromGitHub}
              disabled={loadingFromGitHub}
              className="flex items-center gap-1 h-6 px-2 rounded-md bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.10] text-white/40 hover:text-white/70 text-[10px] transition-colors disabled:opacity-40"
            >
              <Icon name={loadingFromGitHub ? "Loader2" : "Github"} size={10} />
              {currentFilePath || "GitHub"}
            </button>
          )}
          {onLoadLocalFile && (
            <button
              onClick={onLoadLocalFile}
              className="flex items-center gap-1 h-6 px-2 rounded-md bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.10] text-white/40 hover:text-white/70 text-[10px] transition-colors"
            >
              <Icon name="Upload" size={10} />
              {hasLocalFile ? localFileName : "Файл"}
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        <AnimatePresence initial={false}>

          {/* Empty state */}
          {messages.length === 0 && !isActive && (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-2 mt-2">
              <p className="text-white/25 text-xs font-medium mb-1">Попробуйте написать:</p>
              {SUGGESTIONS.map((s, i) => (
                <motion.button
                  key={s.text}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  onClick={() => { setValue(s.text); textareaRef.current?.focus(); }}
                  className="text-left px-3 py-2.5 rounded-lg border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/[0.15] text-white/50 hover:text-white/80 text-xs transition-all flex items-center gap-2.5"
                >
                  <Icon name={s.icon} size={12} className="opacity-40 shrink-0" />
                  {s.text}
                </motion.button>
              ))}
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
              {msg.role === "assistant" && msg.html?.startsWith("__IMAGE__:") && (
                <div className="flex flex-col gap-2 items-start max-w-[92%]">
                  <img
                    src={msg.html.replace("__IMAGE__:", "")}
                    alt={msg.text}
                    className="rounded-xl border border-white/[0.10] w-full"
                    style={{ maxHeight: 320, objectFit: "cover" }}
                  />
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
              )}

              {/* Text message */}
              {!(msg.role === "assistant" && msg.html?.startsWith("__IMAGE__:")) && (
                <div
                  className={`max-w-[90%] px-3 py-2.5 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "text-white rounded-tr-sm"
                      : "bg-white/[0.05] border border-white/[0.08] text-white/75 rounded-tl-sm"
                  }`}
                  style={msg.role === "user" ? { backgroundColor: "#9333ea99" } : {}}
                >
                  {msg.text}
                </div>
              )}

              {/* Site HTML buttons */}
              {msg.role === "assistant" && msg.html && !msg.html.startsWith("__IMAGE__:") && (
                <div className="flex items-center gap-2 ml-1 flex-wrap">
                  <button
                    onClick={() => {
                      const blob = new Blob([msg.html!], { type: "text/html" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url; a.download = "index.html"; a.click();
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
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`text-[10px] font-medium ${deployResult.ok ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {deployResult.ok ? "✓ Сохранено в GitHub" : `✕ ${deployResult.message}`}
                    </motion.span>
                  )}
                </div>
              )}
            </motion.div>
          ))}

          {/* Processing indicator */}
          {isActive && (
            <motion.div
              key="cycle"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 flex-wrap"
            >
              {lastMode === "image" ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold"
                  style={{ backgroundColor: "#10b98118", borderColor: "#10b98135", color: "#10b981" }}>
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}>
                    <Icon name="Loader2" size={10} />
                  </motion.div>
                  {cycleLabel || "Рисую картинку..."}
                </div>
              ) : lastMode === "chat" ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold"
                  style={{ backgroundColor: "#3b82f618", borderColor: "#3b82f635", color: "#3b82f6" }}>
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}>
                    <Icon name="Loader2" size={10} />
                  </motion.div>
                  {cycleLabel || "Думаю..."}
                </div>
              ) : (
                CYCLE_STEPS.map((step) => {
                  const isCurrent = status === step.key;
                  const isDone = step.key === "reading" && status === "generating";
                  return (
                    <div key={step.key} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold transition-all ${
                      isCurrent ? "bg-[#9333ea]/15 border-[#9333ea]/40 text-[#9333ea]"
                      : isDone  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-white/[0.03] border-white/[0.07] text-white/25"
                    }`}>
                      {isCurrent ? (
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}>
                          <Icon name="Loader2" size={10} />
                        </motion.div>
                      ) : isDone ? <Icon name="Check" size={10} /> : <Icon name={step.icon} size={10} />}
                      {isCurrent ? (cycleLabel || step.label) : step.label}
                    </div>
                  );
                })
              )}
              <button
                onClick={onStop}
                className="flex items-center gap-1 h-6 px-2.5 rounded-md bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 text-[10px] font-semibold transition-colors"
              >
                <Icon name="Square" size={9} />
                Стоп
              </button>
            </motion.div>
          )}

          <div ref={bottomRef} />
        </AnimatePresence>
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 shrink-0 border-t border-white/[0.06]">
        {/* Mode hint */}
        <AnimatePresence>
          {modeHint && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="mb-1.5 px-1 text-[10px] font-medium"
              style={{ color: activeColor + "aa" }}
            >
              {modeHint}
            </motion.div>
          )}
        </AnimatePresence>

        <div
          className="flex items-end gap-2 bg-white/[0.04] border rounded-xl px-3 py-2.5 transition-all duration-300"
          style={{ borderColor: value.trim() ? activeColor + "50" : "rgba(255,255,255,0.08)" }}
        >
          <motion.div className="shrink-0 mb-0.5 opacity-50" animate={{ color: activeColor }} transition={{ duration: 0.3 }}>
            <Icon name={detectedMode === "image" ? "Image" : detectedMode === "site" ? "Globe" : "MessageCircle"} size={14} />
          </motion.div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Напишите что угодно — чат, картинку или сайт..."
            disabled={isActive}
            rows={1}
            className="flex-1 bg-transparent text-white/80 placeholder-white/20 text-xs resize-none outline-none leading-relaxed disabled:opacity-50"
            style={{ maxHeight: 120 }}
          />
          <motion.button
            onClick={handleSend}
            disabled={!value.trim() || isActive}
            className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-white disabled:opacity-25 transition-all mb-0.5"
            animate={{ backgroundColor: value.trim() && !isActive ? activeColor : "rgba(255,255,255,0.08)" }}
            transition={{ duration: 0.3 }}
            whileTap={{ scale: 0.9 }}
          >
            <Icon name="ArrowUp" size={13} />
          </motion.button>
        </div>
      </div>
    </div>
  );
}