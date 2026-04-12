import Icon from "@/components/ui/icon";

const MONTHS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

const SCHEDULE = [
  {
    month: "МАЙ 2024",
    events: [
      { day: "26", dayName: "Вс", title: "MotoGP — Гран-При Испании", location: "Херес", sport: "MotoGP", status: "live", time: "15:00" },
      { day: "27", dayName: "Пн", title: "Суперкубок России по дрифту", location: "Москва", sport: "Дрифт", status: "upcoming", time: "12:00" },
    ]
  },
  {
    month: "ИЮНЬ 2024",
    events: [
      { day: "02", dayName: "Вс", title: "Формула 1 — Гран-При Монако", location: "Монте-Карло", sport: "F1", status: "upcoming", time: "15:00" },
      { day: "07", dayName: "Пт", title: "WSBK — Квалификация Донингтон", location: "Великобритания", sport: "WSBK", status: "upcoming", time: "11:30" },
      { day: "09", dayName: "Вс", title: "WSBK — Гонка Донингтон-Парк", location: "Великобритания", sport: "WSBK", status: "upcoming", time: "14:00" },
      { day: "13", dayName: "Чт", title: "WRC — Ралли Акрополис SS1", location: "Греция", sport: "WRC", status: "upcoming", time: "10:00" },
      { day: "16", dayName: "Вс", title: "WRC — Ралли Акрополис Финал", location: "Греция", sport: "WRC", status: "upcoming", time: "16:00" },
    ]
  },
  {
    month: "ИЮЛЬ 2024",
    events: [
      { day: "07", dayName: "Вс", title: "MotoGP — Гран-При Германии", location: "Заксенринг", sport: "MotoGP", status: "upcoming", time: "14:00" },
      { day: "21", dayName: "Вс", title: "Формула 1 — Гран-При Венгрии", location: "Будапешт", sport: "F1", status: "upcoming", time: "15:00" },
    ]
  },
];

const sportColors: Record<string, string> = {
  MotoGP: "bg-fire text-white",
  F1: "bg-red-700 text-white",
  WRC: "bg-yellow-600 text-white",
  WSBK: "bg-blue-700 text-white",
  Дрифт: "bg-purple-700 text-white",
};

export default function CalendarPage() {
  return (
    <div className="pb-4">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-oswald text-2xl font-bold tracking-widest text-white">КАЛЕНДАРЬ</h1>
          <p className="text-muted-foreground text-xs font-roboto mt-0.5">Расписание гонок</p>
        </div>
        <button className="bg-secondary text-white px-3 py-1.5 rounded-lg text-sm font-oswald font-semibold flex items-center gap-1.5">
          <Icon name="Filter" size={14} />
          Фильтр
        </button>
      </div>

      {/* Month scroll */}
      <div className="px-4 py-3 flex gap-2 overflow-x-auto scrollbar-hide">
        {MONTHS.map((m, i) => (
          <button
            key={m}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-oswald font-semibold tracking-wide transition-colors ${
              i === 4
                ? "fire-gradient text-white"
                : "bg-secondary text-muted-foreground hover:text-white"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Schedule */}
      <div className="px-4 flex flex-col gap-6">
        {SCHEDULE.map((section) => (
          <div key={section.month}>
            <div className="flex items-center gap-3 mb-3">
              <span className="font-oswald text-fire font-bold tracking-widest text-sm">{section.month}</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div className="flex flex-col gap-2">
              {section.events.map((ev, i) => (
                <div
                  key={i}
                  className={`animate-fade-in opacity-0 stagger-${Math.min(i + 1, 5)} flex gap-3 items-stretch cursor-pointer group`}
                >
                  {/* Date column */}
                  <div className={`flex-shrink-0 w-12 rounded-xl flex flex-col items-center justify-center py-2 ${ev.status === 'live' ? 'fire-gradient' : 'bg-secondary'}`}>
                    <span className={`font-oswald font-bold text-xl leading-none ${ev.status === 'live' ? 'text-white' : 'text-white'}`}>{ev.day}</span>
                    <span className={`text-xs font-roboto ${ev.status === 'live' ? 'text-white/80' : 'text-muted-foreground'}`}>{ev.dayName}</span>
                  </div>

                  {/* Event info */}
                  <div className={`flex-1 rounded-xl p-3 border ${ev.status === 'live' ? 'border-fire/30 bg-fire/5' : 'border-border bg-card'} group-hover:border-fire/40 transition-colors`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-oswald font-bold px-1.5 py-0.5 rounded tracking-wider ${sportColors[ev.sport] || 'bg-secondary text-white'}`}>
                            {ev.sport}
                          </span>
                          {ev.status === 'live' && (
                            <span className="flex items-center gap-1 text-red-500 text-xs font-oswald font-bold">
                              <span className="w-1.5 h-1.5 bg-red-500 rounded-full live-pulse" />
                              LIVE
                            </span>
                          )}
                        </div>
                        <p className="text-white text-sm font-roboto font-medium leading-tight">{ev.title}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="flex items-center gap-1 text-muted-foreground text-xs font-roboto">
                            <Icon name="MapPin" size={11} />
                            {ev.location}
                          </span>
                          <span className="flex items-center gap-1 text-muted-foreground text-xs font-roboto">
                            <Icon name="Clock" size={11} />
                            {ev.time}
                          </span>
                        </div>
                      </div>
                      <button className="text-muted-foreground hover:text-fire transition-colors mt-0.5">
                        <Icon name="BellPlus" size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
