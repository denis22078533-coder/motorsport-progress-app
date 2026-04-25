import { motion, AnimatePresence } from "framer-motion";
import Icon from "@/components/ui/icon";

interface Props {
  status: "idle" | "generating" | "done" | "error";
  previewHtml: string | null;
}

const GRID_SIZE = 32;

export default function LivePreview({ status, previewHtml }: Props) {
  return (
    <div className="relative flex-1 overflow-hidden bg-[#07070c] min-h-0">
      {/* Grid background */}
      <div
        className="absolute inset-0 opacity-[0.25]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)
          `,
          backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
        }}
      />

      {/* Radial vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_50%,transparent_40%,#07070c_100%)] pointer-events-none" />

      {/* Content */}
      <AnimatePresence mode="wait">
        {/* IDLE — placeholder */}
        {status === "idle" && !previewHtml && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-8 text-center"
          >
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600/30 to-indigo-700/30 border border-violet-500/20 flex items-center justify-center"
            >
              <Icon name="Sparkles" size={26} className="text-violet-400" />
            </motion.div>
            <div>
              <p className="text-white/80 text-base font-medium leading-snug max-w-xs">
                Опишите ваш проект справа —<br />
                <span className="text-violet-400">магия начнётся здесь</span>
              </p>
              <p className="text-white/25 text-xs mt-2 font-medium">
                Сайт появится в этой области в реальном времени
              </p>
            </div>

            {/* Corner decorations */}
            <div className="absolute top-4 left-4 w-6 h-6 border-l border-t border-white/10 rounded-tl-sm" />
            <div className="absolute top-4 right-4 w-6 h-6 border-r border-t border-white/10 rounded-tr-sm" />
            <div className="absolute bottom-4 left-4 w-6 h-6 border-l border-b border-white/10 rounded-bl-sm" />
            <div className="absolute bottom-4 right-4 w-6 h-6 border-r border-b border-white/10 rounded-br-sm" />
          </motion.div>
        )}

        {/* GENERATING */}
        {status === "generating" && (
          <motion.div
            key="generating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-4"
          >
            {/* Animated scanning line */}
            <motion.div
              className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-400/60 to-transparent"
              animate={{ top: ["10%", "90%", "10%"] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
            />
            <div className="relative">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                className="w-10 h-10 rounded-full border-2 border-transparent border-t-violet-400 border-r-violet-400/30"
              />
            </div>
            <div className="text-center">
              <p className="text-violet-400 text-sm font-semibold">Генерирую сайт</p>
              <GeneratingDots />
            </div>
          </motion.div>
        )}

        {/* DONE — iframe preview */}
        {status === "done" && previewHtml && (
          <motion.div
            key="preview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0"
          >
            <iframe
              srcDoc={previewHtml}
              className="w-full h-full border-0"
              title="Preview"
              sandbox="allow-scripts"
            />
          </motion.div>
        )}

        {/* ERROR */}
        {status === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3"
          >
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <Icon name="AlertTriangle" size={22} className="text-red-400" />
            </div>
            <p className="text-red-400 text-sm font-medium">Ошибка генерации</p>
            <p className="text-white/30 text-xs">Проверьте API ключ в настройках</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GeneratingDots() {
  return (
    <div className="flex items-center justify-center gap-1 mt-1">
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="w-1 h-1 rounded-full bg-violet-400/60"
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}
