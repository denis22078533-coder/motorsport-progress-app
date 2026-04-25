import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Icon from "@/components/ui/icon";

interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
}

interface Props {
  status: "idle" | "generating" | "done" | "error";
  messages: Message[];
  onSend: (text: string) => void;
  onStop: () => void;
}

const SUGGESTIONS = [
  "Лендинг для фитнес-клуба",
  "Портфолио дизайнера",
  "Сайт кофейни с меню",
  "Интернет-магазин одежды",
];

export default function ChatPanel({ status, messages, onSend, onStop }: Props) {
  const [value, setValue] = useState("");
  const [listening, setListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isGenerating = status === "generating";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!value.trim() || isGenerating) return;
    onSend(value.trim());
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const toggleVoice = () => setListening(p => !p);

  return (
    <motion.aside
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
      className="w-full md:w-[340px] md:max-w-[340px] shrink-0 flex flex-col border-t md:border-t-0 md:border-l border-white/[0.06] bg-[#0a0a0f]"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
        <span className="text-white/60 text-xs font-medium tracking-wide uppercase">Описание проекта</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3 min-h-0 scrollbar-hide">
        <AnimatePresence initial={false}>
          {messages.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-2 mt-2"
            >
              <p className="text-white/30 text-xs font-medium mb-2">Попробуйте:</p>
              {SUGGESTIONS.map((s, i) => (
                <motion.button
                  key={s}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  onClick={() => { setValue(s); textareaRef.current?.focus(); }}
                  className="text-left px-3 py-2 rounded-lg border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.07] hover:border-violet-500/30 text-white/50 hover:text-white/80 text-xs transition-all"
                >
                  {s}
                </motion.button>
              ))}
            </motion.div>
          )}

          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div className={`max-w-[90%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                msg.role === "user"
                  ? "bg-violet-600/80 text-white rounded-tr-sm"
                  : "bg-white/[0.05] border border-white/[0.08] text-white/70 rounded-tl-sm"
              }`}>
                {msg.text}
              </div>
            </motion.div>
          ))}

          {/* Typing indicator */}
          {isGenerating && (
            <motion.div
              key="typing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-2"
            >
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                <Icon name="Sparkles" size={10} className="text-white" />
              </div>
              <div className="bg-white/[0.05] border border-white/[0.08] px-3 py-2 rounded-xl rounded-tl-sm flex items-center gap-1">
                {[0, 1, 2].map(i => (
                  <motion.span
                    key={i}
                    className="w-1 h-1 rounded-full bg-violet-400"
                    animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                    transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="p-3 border-t border-white/[0.06]">
        <div className="flex flex-col gap-2">
          {/* Textarea */}
          <div className="relative flex items-end gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 focus-within:border-violet-500/40 transition-colors">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              disabled={isGenerating}
              placeholder="Опишите сайт, который хотите создать..."
              rows={1}
              className="flex-1 bg-transparent text-white/80 text-sm placeholder:text-white/20 resize-none outline-none leading-relaxed disabled:opacity-40 min-h-[20px]"
            />
            {/* Mic */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={toggleVoice}
              className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors mb-0.5 ${
                listening
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : "text-white/30 hover:text-white/60 hover:bg-white/[0.06]"
              }`}
            >
              {listening
                ? <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 0.7 }}>
                    <Icon name="MicOff" size={14} />
                  </motion.span>
                : <Icon name="Mic" size={14} />
              }
            </motion.button>
          </div>

          {/* Play / Stop */}
          <div className="flex gap-2">
            <AnimatePresence mode="wait">
              {isGenerating ? (
                <motion.button
                  key="stop"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={onStop}
                  className="flex-1 h-10 rounded-xl bg-red-500/15 border border-red-500/25 hover:bg-red-500/25 text-red-400 font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <Icon name="Square" size={15} />
                  Стоп
                </motion.button>
              ) : (
                <motion.button
                  key="play"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSend}
                  disabled={!value.trim()}
                  className="flex-1 h-10 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <Icon name="Play" size={15} />
                  Запустить
                </motion.button>
              )}
            </AnimatePresence>

            {/* Mobile export */}
            <button className="sm:hidden w-10 h-10 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-white/50 hover:text-white flex items-center justify-center transition-colors">
              <Icon name="Download" size={15} />
            </button>
          </div>
        </div>
      </div>
    </motion.aside>
  );
}
