import { motion } from "framer-motion";
import Icon from "@/components/ui/icon";

interface Props {
  status: "idle" | "generating" | "done" | "error";
  cycleLabel?: string;
  logoText?: string;
  onNewProject: () => void;
  onResetTheme: () => void;
  onSettings: () => void;
  onLogout: () => void;
}

const STATUS_MAP = {
  idle:       { dot: "bg-zinc-500",                  text: "text-zinc-400" },
  generating: { dot: "bg-[#9333ea] animate-pulse",   text: "text-[#9333ea]" },
  done:       { dot: "bg-emerald-400",               text: "text-emerald-400" },
  error:      { dot: "bg-red-500",                   text: "text-red-400" },
};

export default function LumenTopBar({ status, cycleLabel, logoText = "L", onNewProject, onResetTheme, onSettings, onLogout }: Props) {
  const s = STATUS_MAP[status];

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="h-11 flex items-center justify-between px-3 border-b backdrop-blur-xl z-50 shrink-0 min-w-0"
      style={{
        background: "var(--lumen-panel, rgba(7,7,12,0.9))",
        borderColor: "var(--lumen-border, rgba(147,51,234,0.2))",
      }}
    >
      {/* Left — Logo + status */}
      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
        <div className="flex items-center gap-1.5 shrink-0">
          <div
            className="w-5 h-5 rounded-md flex items-center justify-center"
            style={{
              background: "var(--lumen-accent, #9333ea)",
              boxShadow: "0 0 8px var(--lumen-accent, #9333ea)80",
              color: "var(--lumen-text, #fff)",
            }}
          >
            <span className="text-[10px] font-bold tracking-tight">{logoText}</span>
          </div>
          <span className="text-white font-semibold text-sm tracking-tight">Lumen</span>
          <span className="hidden lg:inline text-white/20 text-[10px] font-medium tracking-wider ml-1">— Система управления реальностью сайтов</span>
        </div>

        <div className="hidden sm:block w-px h-4 bg-white/10 shrink-0" />

        {/* Cycle status label */}
        <div className="hidden sm:flex items-center gap-1.5 min-w-0 overflow-hidden">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
          <span className={`text-xs font-medium truncate ${s.text}`}>
            {cycleLabel || (status === "idle" ? "Готов" : status === "generating" ? "Обработка..." : status === "done" ? "Готово" : "Ошибка")}
          </span>
        </div>
      </div>

      {/* Right — Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onResetTheme}
          title="Сбросить тему"
          className="hidden sm:flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium transition-colors"
          style={{
            borderColor: "var(--lumen-border, rgba(255,255,255,0.1))",
            background: "var(--lumen-panel, rgba(255,255,255,0.04))",
            color: "var(--lumen-textMuted, rgba(255,255,255,0.7))",
          }}
        >
          <Icon name="RotateCcw" size={12} />
          Сброс
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onNewProject}
          className="flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-semibold transition-colors"
          style={{ background: "var(--lumen-accent, #9333ea)", color: "var(--lumen-text, #fff)" }}
        >
          <Icon name="Plus" size={13} />
          <span className="hidden sm:inline">Очистить</span>
        </motion.button>

        <button
          onClick={onSettings}
          className="w-7 h-7 rounded-md flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
        >
          <Icon name="Settings" size={14} />
        </button>

        <button
          onClick={onLogout}
          title="Выйти"
          className="w-7 h-7 rounded-md flex items-center justify-center text-white/25 hover:text-red-400 hover:bg-red-500/[0.08] transition-colors"
        >
          <Icon name="LogOut" size={13} />
        </button>
      </div>
    </motion.header>
  );
}