import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Icon from "@/components/ui/icon";
import { Message } from "./LumenApp";

type CycleStatus = "idle" | "reading" | "generating" | "done" | "error";

interface Props {
  status: CycleStatus;
  cycleLabel: string;
  messages: Message[];
  onSend: (text: string) => void;
  onStop: () => void;
  onApply: (msgId: number, html: string) => Promise<void>;
  deployingId: number | null;
  deployResult: { id: number; ok: boolean; message: string } | null;
  liveUrl: string;
  onOpenPreview?: () => void;
  onLoadFromGitHub?: () => void;
  loadingFromGitHub?: boolean;
  currentFilePath?: string;
}

const CYCLE_STEPS: { key: CycleStatus; label: string; icon: string }[] = [
  { key: "reading",    label: "Читаю текущий код...",    icon: "Download"  },
  { key: "generating", label: "Генерирую правки...",      icon: "Sparkles"  },
];

const SUGGESTIONS = [
  "Лендинг для фитнес-клуба с тарифами",
  "Портфолио дизайнера с галереей работ",
  "Сайт кофейни с меню и адресом",
  "Интернет-магазин одежды с каталогом",
];

export default function ChatPanel({
  status, cycleLabel, messages, onSend, onStop, onApply,
  deployingId, deployResult, liveUrl, onOpenPreview,
  onLoadFromGitHub, loadingFromGitHub, currentFilePath,
}: Props) {
  const [value, setValue] = useState("");
  const [kbOffset, setKbOffset] = useState(0);
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

  const handleSend = () => {
    if (!value.trim() || isActive) return;
    onSend(value.trim());
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
        <div className="w-1.5 h-1.5 rounded-full bg-[#9333ea]" />
        <span className="text-white/60 text-xs font-medium tracking-wide uppercase">Командный центр</span>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        <AnimatePresence initial={false}>

          {/* Suggestions — empty state */}
          {messages.length === 0 && !isActive && (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-2 mt-2">

              {/* Load from GitHub */}
              {onLoadFromGitHub && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-3"
                >
                  <p className="text-white/30 text-xs font-medium mb-2">Редактировать существующий сайт:</p>
                  <button
                    onClick={onLoadFromGitHub}
                    disabled={loadingFromGitHub}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border transition-all text-sm font-semibold ${
                      loadingFromGitHub
                        ? "bg-[#9333ea]/10 border-[#9333ea]/20 text-purple-400/50 cursor-wait"
                        : "bg-[#9333ea]/10 border-[#9333ea]/30 hover:bg-[#9333ea]/20 hover:border-[#9333ea]/50 text-purple-300 hover:text-white"
                    }`}
                  >
                    <Icon
                      name={loadingFromGitHub ? "Loader" : "FolderOpen"}
                      size={15}
                      className={loadingFromGitHub ? "animate-spin text-purple-400" : "text-[#9333ea]"}
                    />
                    <div className="text-left">
                      <div className="text-xs font-semibold leading-tight">
                        {loadingFromGitHub ? "Загружаю с GitHub..." : "Загрузить мой сайт"}
                      </div>
                      {currentFilePath && !loadingFromGitHub && (
                        <div className="text-[10px] text-white/30 font-mono font-normal mt-0.5">{currentFilePath}</div>
                      )}
                    </div>
                  </button>
                </motion.div>
              )}

              <p className="text-white/30 text-xs font-medium mb-1">Или создать новый:</p>
              {SUGGESTIONS.map((s, i) => (
                <motion.button
                  key={s}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  onClick={() => { setValue(s); textareaRef.current?.focus(); }}
                  className="text-left px-3 py-2 rounded-lg border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.07] hover:border-[#9333ea]/30 text-white/50 hover:text-white/80 text-xs transition-all"
                >
                  {s}
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
              <div className={`max-w-[90%] px-3 py-2.5 rounded-xl text-xs leading-relaxed ${
                msg.role === "user"
                  ? "bg-[#9333ea]/80 text-white rounded-tr-sm"
                  : "bg-white/[0.05] border border-white/[0.08] text-white/70 rounded-tl-sm"
              }`}>
                {msg.text}
              </div>

              {/* Кнопка «Применить изменения» — только для ответов с HTML */}
              {msg.role === "assistant" && msg.html && (
                <div className="flex items-center gap-2 ml-1">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onApply(msg.id, msg.html!)}
                    disabled={deployingId === msg.id}
                    className={`flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-semibold transition-all border ${
                      deployingId === msg.id
                        ? "bg-[#9333ea]/20 border-[#9333ea]/30 text-purple-300 cursor-wait"
                        : "bg-[#9333ea] hover:bg-[#7e22ce] border-transparent text-white shadow-[0_0_12px_#9333ea40]"
                    }`}
                  >
                    <Icon
                      name={deployingId === msg.id ? "Loader" : "Github"}
                      size={12}
                      className={deployingId === msg.id ? "animate-spin" : ""}
                    />
                    {deployingId === msg.id ? "Обновляю GitHub..." : "Применить изменения"}
                  </motion.button>

                  <AnimatePresence>
                    {deployResult?.id === msg.id && (
                      <motion.div
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2"
                      >
                        <span className={`text-xs font-medium ${deployResult.ok ? "text-emerald-400" : "text-red-400"}`}>
                          {deployResult.ok ? "✓ Обновлено!" : `✕ ${deployResult.message}`}
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
                  </AnimatePresence>
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
              {/* Step indicators */}
              <div className="flex gap-2 items-center">
                {CYCLE_STEPS.map((step) => {
                  const isCurrentStep = status === step.key;
                  const isDone =
                    (step.key === "reading" && status === "generating");
                  return (
                    <div key={step.key} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold transition-all ${
                      isCurrentStep
                        ? "bg-[#9333ea]/15 border-[#9333ea]/40 text-[#9333ea]"
                        : isDone
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                          : "bg-white/[0.03] border-white/[0.06] text-white/20"
                    }`}>
                      <Icon
                        name={isDone ? "CheckCircle" : step.icon}
                        size={10}
                        className={isCurrentStep ? "animate-pulse" : ""}
                      />
                      {step.label}
                    </div>
                  );
                })}
              </div>

              {/* Typing dots */}
              <div className="flex items-center gap-2 ml-1">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#9333ea] to-[#7e22ce] flex items-center justify-center shrink-0 shadow-[0_0_8px_#9333ea60]">
                  <Icon name="Sparkles" size={10} className="text-white" />
                </div>
                <div className="bg-white/[0.05] border border-white/[0.08] px-3 py-2 rounded-xl rounded-tl-sm flex items-center gap-1">
                  {[0, 1, 2].map(i => (
                    <motion.span
                      key={i}
                      className="w-1 h-1 rounded-full bg-[#9333ea]"
                      animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                      transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                    />
                  ))}
                  <span className="text-white/30 text-[10px] ml-1.5">{cycleLabel}</span>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* View preview — mobile */}
      {onOpenPreview && messages.length > 0 && (
        <div className="px-3 pb-1 shrink-0 md:hidden">
          <button
            onClick={onOpenPreview}
            className="w-full h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <Icon name="ExternalLink" size={13} />
            Посмотреть результат
          </button>
        </div>
      )}

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-white/[0.06] shrink-0">
        <div className="flex flex-col gap-2">
          <div className="flex items-end gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 focus-within:border-[#9333ea]/40 transition-colors">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              disabled={isActive}
              placeholder={isActive ? "Обрабатываю..." : "Напишите команду, например: «Сделай фон белым»..."}
              rows={1}
              className="flex-1 bg-transparent text-white/80 placeholder:text-white/20 resize-none outline-none leading-relaxed disabled:opacity-40 min-h-[20px] max-h-[120px]"
              style={{ fontSize: "16px" }}
            />
          </div>

          <AnimatePresence mode="wait">
            {isActive ? (
              <motion.button
                key="stop"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                whileTap={{ scale: 0.97 }}
                onClick={onStop}
                className="w-full h-9 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Icon name="StopCircle" size={14} />
                Остановить
              </motion.button>
            ) : (
              <motion.button
                key="send"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleSend}
                disabled={!value.trim()}
                className="w-full h-9 rounded-xl bg-[#9333ea] hover:bg-[#7e22ce] disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-[0_0_16px_#9333ea30]"
              >
                <Icon name="Send" size={14} />
                Отправить команду
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}