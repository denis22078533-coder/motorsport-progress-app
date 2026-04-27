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
  onApply?: (msgId: number, html: string) => Promise<void>;
  deployingId?: number | null;
  deployResult?: { id: number; ok: boolean; message: string } | null;
  liveUrl?: string;
}

const CYCLE_STEPS: { key: CycleStatus; label: string; icon: string }[] = [
  { key: "reading",    label: "Читаю текущий код...",    icon: "Download"  },
  { key: "generating", label: "Генерирую правки...",      icon: "Sparkles"  },
];

const SUGGESTIONS = [
  "Сделай фон белым",
  "Поменяй акцент на изумрудный",
  "Тёмно-синяя тема с золотым акцентом",
  "Минималистичный светлый стиль",
];

export default function ChatPanel({
  status, cycleLabel, messages, onSend, onStop, deployResult, liveUrl,
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
      className="w-full h-full flex flex-col overflow-hidden"
      style={{
        background: "var(--lumen-bg, #0a0a0f)",
        color: "var(--lumen-text, #fff)",
        paddingBottom: kbOffset > 0 ? kbOffset : undefined,
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 border-b flex items-center gap-2 shrink-0"
        style={{ borderColor: "var(--lumen-border, rgba(255,255,255,0.06))" }}
      >
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--lumen-accent, #9333ea)" }} />
        <span className="text-xs font-medium tracking-wide uppercase" style={{ color: "var(--lumen-textMuted, rgba(255,255,255,0.6))" }}>Командный центр</span>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        <AnimatePresence initial={false}>

          {/* Suggestions — empty state */}
          {messages.length === 0 && !isActive && (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-2 mt-2">

              <p className="text-xs font-medium mb-1" style={{ color: "var(--lumen-textMuted, rgba(255,255,255,0.3))" }}>Измени стиль Lumen:</p>
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
              <div
                className={`max-w-[90%] px-3 py-2.5 rounded-xl text-xs leading-relaxed ${
                  msg.role === "user" ? "rounded-tr-sm" : "border rounded-tl-sm"
                }`}
                style={
                  msg.role === "user"
                    ? { background: "var(--lumen-accent, #9333ea)", color: "var(--lumen-text, #fff)" }
                    : {
                        background: "var(--lumen-panel, rgba(255,255,255,0.05))",
                        borderColor: "var(--lumen-border, rgba(255,255,255,0.08))",
                        color: "var(--lumen-text, rgba(255,255,255,0.85))",
                      }
                }
              >
                {msg.text}
              </div>

              {/* Статус автодеплоя — только для ответов с HTML */}
              {msg.role === "assistant" && msg.html && deployResult?.id === msg.id && (
                <div className="flex items-center gap-2 ml-1">
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

      {/* Input */}
      <div
        className="px-3 pb-3 pt-2 border-t shrink-0"
        style={{ borderColor: "var(--lumen-border, rgba(255,255,255,0.06))" }}
      >
        <div className="flex flex-col gap-2">
          <div
            className="flex items-end gap-2 border rounded-xl px-3 py-2.5 transition-colors"
            style={{
              background: "var(--lumen-panel, rgba(255,255,255,0.04))",
              borderColor: "var(--lumen-border, rgba(255,255,255,0.08))",
            }}
          >
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              disabled={isActive}
              placeholder={isActive ? "Обрабатываю..." : "Например: «сделай фон белым», «акцент зелёный»…"}
              rows={1}
              className="flex-1 bg-transparent resize-none outline-none leading-relaxed disabled:opacity-40 min-h-[20px] max-h-[120px]"
              style={{ fontSize: "16px", color: "var(--lumen-text, rgba(255,255,255,0.85))" }}
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
                className="w-full h-9 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                style={{
                  background: "var(--lumen-accent, #9333ea)",
                  color: "var(--lumen-text, #fff)",
                  boxShadow: "0 0 16px var(--lumen-accent, #9333ea)30",
                }}
              >
                <Icon name="Send" size={14} />
                Изменить стиль Lumen
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}