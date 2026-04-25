import { motion } from "framer-motion";
import Icon from "@/components/ui/icon";

interface Props {
  status: "idle" | "generating" | "done" | "error";
  onNewProject: () => void;
  onExport: () => void;
  onSettings: () => void;
}

const STATUS_MAP = {
  idle: { label: "Готов к работе", dot: "bg-zinc-500", text: "text-zinc-400" },
  generating: { label: "Генерация...", dot: "bg-violet-400 animate-pulse", text: "text-violet-400" },
  done: { label: "Готово", dot: "bg-emerald-400", text: "text-emerald-400" },
  error: { label: "Ошибка", dot: "bg-red-500", text: "text-red-400" },
};

export default function LumenTopBar({ status, onNewProject, onExport, onSettings }: Props) {
  const s = STATUS_MAP[status];

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="h-12 flex items-center justify-between px-4 border-b border-white/[0.06] bg-[#0a0a0f]/80 backdrop-blur-xl z-50 shrink-0"
    >
      {/* Left — Logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <span className="text-white text-[11px] font-bold tracking-tight">L</span>
          </div>
          <span className="text-white font-semibold text-sm tracking-tight">Lumen</span>
        </div>

        <div className="hidden sm:block w-px h-4 bg-white/10" />

        {/* Status indicator */}
        <div className="hidden sm:flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
          <span className={`text-xs font-medium ${s.text}`}>{s.label}</span>
        </div>
      </div>

      {/* Right — Actions */}
      <div className="flex items-center gap-2">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={onExport}
          className="hidden sm:flex items-center gap-1.5 h-7 px-3 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white text-xs font-medium transition-colors"
        >
          <Icon name="Download" size={13} />
          Выгрузить код
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={onNewProject}
          className="flex items-center gap-1.5 h-7 px-3 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors"
        >
          <Icon name="Plus" size={13} />
          <span className="hidden sm:inline">Новый проект</span>
          <span className="sm:hidden">Новый</span>
        </motion.button>

        <button
          onClick={onSettings}
          className="w-7 h-7 rounded-md flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
        >
          <Icon name="Settings" size={15} />
        </button>
      </div>
    </motion.header>
  );
}
