import { useState, useRef, useEffect, useCallback } from "react";
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
  pendingSql?: { sql: string; explanation: string } | null;
  hasGitHub?: boolean;
  onOpenSettings?: () => void;
}

const SUGGESTION_CATEGORIES = [
  {
    label: "🛍 Торговля",
    items: [
      "Интернет-магазин одежды с каталогом и корзиной",
      "Сайт магазина электроники с фильтрами и ценами",
      "Лендинг для продажи мёда с доставкой по России",
      "Магазин handmade украшений с портфолио мастера",
      "Сайт оптовой торговли стройматериалами",
    ],
  },
  {
    label: "💊 Медицина",
    items: [
      "Сайт аптеки с каталогом препаратов и доставкой",
      "Лендинг частной клиники с записью на приём",
      "Сайт стоматологии с услугами и ценами",
      "Сайт ветеринарной клиники с онлайн-записью",
      "Лендинг психолога с расписанием сессий",
    ],
  },
  {
    label: "🍕 Еда и рестораны",
    items: [
      "Сайт кофейни с меню и онлайн-заказом",
      "Лендинг пиццерии с доставкой и акциями",
      "Сайт ресторана с меню и бронированием столиков",
      "Сайт кейтеринга для корпоративных мероприятий",
      "Лендинг кондитерской с тортами на заказ",
    ],
  },
  {
    label: "💇 Красота и уход",
    items: [
      "Сайт салона красоты с услугами и ценами",
      "Лендинг барбершопа с онлайн-записью к мастеру",
      "Сайт студии маникюра и педикюра",
      "Лендинг мастера перманентного макияжа",
      "Сайт SPA-центра с прайс-листом и акциями",
    ],
  },
  {
    label: "🏋️ Спорт и фитнес",
    items: [
      "Лендинг фитнес-клуба с тарифами и расписанием",
      "Сайт персонального тренера с программами",
      "Сайт йога-студии с расписанием занятий",
      "Лендинг школы танцев с видео и ценами",
      "Сайт спортивной секции для детей",
    ],
  },
  {
    label: "🏠 Недвижимость",
    items: [
      "Сайт агентства недвижимости с каталогом объектов",
      "Лендинг застройщика с планировками квартир",
      "Сайт аренды посуточного жилья",
      "Лендинг управляющей компании ЖК",
      "Сайт риэлтора-частника с портфолио сделок",
    ],
  },
  {
    label: "🔧 Услуги и ремонт",
    items: [
      "Сайт строительной компании с портфолио и сметой",
      "Лендинг сантехника с вызовом на дом",
      "Сайт клининговой компании с тарифами",
      "Лендинг автосервиса с ценами на работы",
      "Сайт компании по ремонту квартир",
    ],
  },
  {
    label: "📚 Образование",
    items: [
      "Сайт онлайн-школы с курсами и тарифами",
      "Лендинг репетитора с расписанием и ценами",
      "Сайт детского центра развития",
      "Лендинг языковой школы с уровнями и записью",
      "Сайт корпоративного обучения для компаний",
    ],
  },
  {
    label: "🚗 Авто",
    items: [
      "Сайт автосалона с каталогом машин и ценами",
      "Лендинг автошколы с программами и записью",
      "Сайт проката автомобилей с онлайн-бронированием",
      "Сайт детейлинг-центра с услугами и ценами",
      "Лендинг грузоперевозок с калькулятором стоимости",
    ],
  },
  {
    label: "⚖️ Юридические",
    items: [
      "Сайт юридической компании с услугами и консультацией",
      "Лендинг адвоката с практикой и отзывами",
      "Сайт бухгалтерской фирмы с тарифами",
      "Лендинг нотариуса с услугами и ценами",
      "Сайт агентства по банкротству физических лиц",
    ],
  },
];

const SUGGESTIONS = SUGGESTION_CATEGORIES.flatMap(c => c.items.slice(0, 1)).map(text => ({ text, icon: "Globe" }));

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
  onLoadLocalFile, hasLocalFile, localFileName, pendingSql,
  hasGitHub, onOpenSettings,
}: Props) {
  const [value, setValue] = useState("");
  const [kbOffset, setKbOffset] = useState(0);
  const [lastMode, setLastMode] = useState<ChatMode>("chat");
  const [sqlCopied, setSqlCopied] = useState(false);
  const [activeCat, setActiveCat] = useState(0);
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string; type: "image" | "text" } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const toggleRecording = useCallback(() => {
    const SpeechRecognitionAPI = (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition || (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      alert("Ваш браузер не поддерживает голосовой ввод. Попробуйте Chrome или Safari.");
      return;
    }
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "ru-RU";
    recognition.continuous = true;
    recognition.interimResults = true;
    let finalTranscript = value;
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTranscript += (finalTranscript ? " " : "") + t;
        else interim = t;
      }
      const display = finalTranscript + (interim ? (finalTranscript ? " " : "") + interim : "");
      setValue(display);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
      }
    };
    recognition.onend = () => { setIsRecording(false); };
    recognition.onerror = () => { setIsRecording(false); };
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [isRecording, value]);

  const handleCopySql = () => {
    if (!pendingSql) return;
    navigator.clipboard.writeText(pendingSql.sql).then(() => {
      setSqlCopied(true);
      setTimeout(() => setSqlCopied(false), 2000);
    });
  };
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

  const handleAttachFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const isImage = file.type.startsWith("image/");
    if (isImage) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setAttachedFile({ name: file.name, content: dataUrl, type: "image" });
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        setAttachedFile({ name: file.name, content: text, type: "text" });
      };
      reader.readAsText(file, "utf-8");
    }
  }, []);

  const handleSend = () => {
    if ((!value.trim() && !attachedFile) || isActive) return;
    let sendText = value.trim();
    if (attachedFile) {
      if (attachedFile.type === "image") {
        sendText = `[Прикреплено изображение: ${attachedFile.name}]\n${sendText}`;
      } else {
        const preview = attachedFile.content.length > 3000 ? attachedFile.content.slice(0, 3000) + "\n...[обрезано]" : attachedFile.content;
        sendText = `Файл "${attachedFile.name}":\n\`\`\`\n${preview}\n\`\`\`\n${sendText}`;
      }
      setAttachedFile(null);
    }
    if (!sendText) return;
    const mode = detectMode(sendText);
    setLastMode(mode);
    onSend(sendText, mode);
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
        <div className="ml-auto flex items-center gap-1.5">
          {hasGitHub ? (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25">
              <span className="w-1 h-1 rounded-full bg-emerald-400" />
              <span className="text-emerald-400 text-[10px] font-medium">GitHub</span>
            </div>
          ) : (
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
            >
              <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-amber-400 text-[10px] font-medium">Настроить GitHub</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        <AnimatePresence initial={false}>

          {/* Empty state */}
          {messages.length === 0 && !isActive && (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-2 mt-1">
              <p className="text-white/25 text-xs font-medium mb-1">Примеры сайтов по тематикам:</p>
              {/* Category tabs */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollbarWidth: "none" }}>
                {SUGGESTION_CATEGORIES.map((cat, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveCat(i)}
                    className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all whitespace-nowrap ${
                      activeCat === i
                        ? "bg-purple-600/70 text-white border border-purple-500/50"
                        : "bg-white/[0.04] text-white/40 border border-white/[0.06] hover:bg-white/[0.08] hover:text-white/60"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              {/* Items for active category */}
              <div className="flex flex-col gap-1.5 mt-0.5">
                {SUGGESTION_CATEGORIES[activeCat].items.map((text, i) => (
                  <motion.button
                    key={text}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => { setValue(text); textareaRef.current?.focus(); }}
                    className="text-left px-3 py-2 rounded-lg border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.07] hover:border-purple-500/30 text-white/50 hover:text-white/80 text-xs transition-all flex items-center gap-2"
                  >
                    <Icon name="Globe" size={11} className="opacity-30 shrink-0 text-purple-400" />
                    {text}
                  </motion.button>
                ))}
              </div>
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
              {/* Ant thinking bubble */}
              {msg.role === "ant-thinking" && (
                <div className="flex items-start gap-2 max-w-[92%]">
                  <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
                    style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}>
                    <span style={{ fontSize: 10 }}>🐜</span>
                  </div>
                  <div className="px-3 py-2 rounded-xl rounded-tl-sm text-xs leading-relaxed"
                    style={{ background: "rgba(249,115,22,0.10)", border: "1px solid rgba(249,115,22,0.25)", color: "rgba(253,186,116,0.95)" }}>
                    <motion.span
                      animate={{ opacity: [1, 0.5, 1] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                      className="mr-1.5 inline-block text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: "#f97316" }}
                    >думаю</motion.span>
                    {msg.text}
                  </div>
                </div>
              )}

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
              {msg.role !== "ant-thinking" && !(msg.role === "assistant" && msg.html?.startsWith("__IMAGE__:")) && (
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

          {/* SQL copy button */}
          {pendingSql && !isActive && (
            <motion.div
              key="sql-action"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 mt-1"
            >
              <button
                onClick={handleCopySql}
                className="flex items-center gap-1.5 h-7 px-3 rounded-lg border text-[10px] font-semibold transition-all"
                style={{
                  backgroundColor: sqlCopied ? "#10b98118" : "#3b82f618",
                  borderColor: sqlCopied ? "#10b98140" : "#3b82f640",
                  color: sqlCopied ? "#10b981" : "#3b82f6",
                }}
              >
                <Icon name={sqlCopied ? "Check" : "Copy"} size={10} />
                {sqlCopied ? "Скопировано!" : "Скопировать SQL"}
              </button>
              <span className="text-white/20 text-[9px]">для db_migrations/ или MySQL на Reg.ru</span>
            </motion.div>
          )}

          <div ref={bottomRef} />
        </AnimatePresence>
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 shrink-0 border-t border-white/[0.06]">
        {/* Hidden file input for attachments */}
        <input
          ref={attachInputRef}
          type="file"
          accept="image/*,.txt,.md,.html,.css,.js,.ts,.tsx,.jsx,.json,.py,.sql,.csv"
          className="hidden"
          onChange={handleAttachFile}
        />

        {/* Attached file preview */}
        <AnimatePresence>
          {attachedFile && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="mb-2 flex items-center gap-2 bg-white/[0.05] border border-white/[0.10] rounded-lg px-2.5 py-1.5"
            >
              {attachedFile.type === "image" ? (
                <img src={attachedFile.content} alt={attachedFile.name} className="w-8 h-8 rounded object-cover shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded bg-white/[0.06] flex items-center justify-center shrink-0">
                  <Icon name="FileText" size={14} className="text-white/40" />
                </div>
              )}
              <span className="text-white/60 text-xs truncate flex-1">{attachedFile.name}</span>
              <button onClick={() => setAttachedFile(null)} className="text-white/30 hover:text-white/70 transition-colors">
                <Icon name="X" size={13} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recording indicator */}
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="mb-2 flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-1.5"
            >
              <motion.div
                className="w-1.5 h-1.5 rounded-full bg-red-400"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ repeat: Infinity, duration: 1 }}
              />
              <span className="text-red-300 text-xs font-medium">Слушаю... говорите по-русски</span>
              <button onClick={toggleRecording} className="ml-auto text-red-400/60 hover:text-red-400 transition-colors">
                <Icon name="X" size={12} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

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
          style={{ borderColor: (value.trim() || attachedFile) ? activeColor + "50" : "rgba(255,255,255,0.08)" }}
        >
          {/* Attach button */}
          <button
            onClick={() => attachInputRef.current?.click()}
            disabled={isActive}
            className="shrink-0 mb-0.5 w-6 h-6 rounded-md flex items-center justify-center text-white/25 hover:text-white/60 hover:bg-white/[0.08] transition-colors disabled:opacity-30"
            title="Прикрепить файл или фото"
          >
            <Icon name="Plus" size={13} />
          </button>

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
          {/* Mic button */}
          <motion.button
            onClick={toggleRecording}
            disabled={isActive}
            className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all mb-0.5 disabled:opacity-30"
            animate={{
              backgroundColor: isRecording ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.05)",
              borderColor: isRecording ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.08)",
            }}
            style={{ border: "1px solid" }}
            whileTap={{ scale: 0.9 }}
            title={isRecording ? "Остановить запись" : "Диктовать голосом"}
          >
            {isRecording ? (
              <motion.div
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
              >
                <Icon name="MicOff" size={12} className="text-red-400" />
              </motion.div>
            ) : (
              <Icon name="Mic" size={12} className="text-white/40" />
            )}
          </motion.button>

          <motion.button
            onClick={handleSend}
            disabled={(!value.trim() && !attachedFile) || isActive}
            className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-white disabled:opacity-25 transition-all mb-0.5"
            animate={{ backgroundColor: (value.trim() || attachedFile) && !isActive ? activeColor : "rgba(255,255,255,0.08)" }}
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