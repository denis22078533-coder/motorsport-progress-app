import Icon from "@/components/ui/icon";

const CATEGORIES = ["Все", "MotoGP", "Формула 1", "WRC", "Superbike", "Дрифт"];

const EVENTS = [
  {
    id: 1,
    title: "Гран-При Испании",
    sport: "MotoGP",
    date: "26 мая",
    location: "Херес, Испания",
    status: "live",
    statusText: "LIVE",
    participants: "22 гонщика",
    image: "https://cdn.poehali.dev/projects/4fe9d363-5216-44d6-8799-40a6f4aeed69/files/3571fa90-01b9-48d3-a6a4-1a75e7a9ac09.jpg",
    viewers: "128K",
  },
  {
    id: 2,
    title: "Ралли Акрополис",
    sport: "WRC",
    date: "13–16 июня",
    location: "Афины, Греция",
    status: "upcoming",
    statusText: "СКОРО",
    participants: "60 экипажей",
    image: "https://cdn.poehali.dev/projects/4fe9d363-5216-44d6-8799-40a6f4aeed69/files/ed071a00-b7e4-4512-8c06-68a6062dd2bd.jpg",
    viewers: null,
  },
  {
    id: 3,
    title: "Гран-При Монако",
    sport: "Formula 1",
    date: "23–26 мая",
    location: "Монте-Карло, Монако",
    status: "finished",
    statusText: "ЗАВЕРШЕНО",
    participants: "20 пилотов",
    image: "https://cdn.poehali.dev/projects/4fe9d363-5216-44d6-8799-40a6f4aeed69/files/3571fa90-01b9-48d3-a6a4-1a75e7a9ac09.jpg",
    viewers: null,
  },
  {
    id: 4,
    title: "Superbike World Championship",
    sport: "WSBK",
    date: "7–9 июня",
    location: "Донингтон-Парк, Великобритания",
    status: "upcoming",
    statusText: "СКОРО",
    participants: "30 гонщиков",
    image: "https://cdn.poehali.dev/projects/4fe9d363-5216-44d6-8799-40a6f4aeed69/files/ed071a00-b7e4-4512-8c06-68a6062dd2bd.jpg",
    viewers: null,
  },
];

const statusConfig: Record<string, { bg: string; text: string; dot: string }> = {
  live: { bg: "bg-red-600", text: "text-white", dot: "bg-red-400" },
  upcoming: { bg: "bg-fire/20 border border-fire/40", text: "text-fire", dot: "" },
  finished: { bg: "bg-secondary", text: "text-muted-foreground", dot: "" },
};

export default function EventsPage() {
  return (
    <div className="pb-4">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3">
        <h1 className="font-oswald text-2xl font-bold tracking-widest text-white">
          МЕРОПРИЯТИЯ
        </h1>
        <p className="text-muted-foreground text-xs font-roboto mt-0.5">Гонки и события со всего мира</p>
      </div>

      {/* Filter tabs */}
      <div className="px-4 py-3 flex gap-2 overflow-x-auto scrollbar-hide">
        {CATEGORIES.map((cat, i) => (
          <button
            key={cat}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-oswald font-semibold tracking-wide transition-colors ${
              i === 0
                ? "fire-gradient text-white"
                : "bg-secondary text-muted-foreground hover:text-white"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Events grid */}
      <div className="px-4 flex flex-col gap-3">
        {EVENTS.map((ev, i) => {
          const cfg = statusConfig[ev.status];
          return (
            <div
              key={ev.id}
              className={`animate-fade-in stagger-${i + 1} opacity-0 rounded-xl overflow-hidden bg-card border border-border card-hover cursor-pointer`}
            >
              {/* Image */}
              <div className="relative h-40 overflow-hidden">
                <img src={ev.image} alt={ev.title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                {/* Status badge */}
                <div className="absolute top-3 left-3">
                  <span className={`${cfg.bg} ${cfg.text} text-xs font-oswald font-bold px-2 py-1 rounded tracking-wider flex items-center gap-1.5`}>
                    {ev.status === "live" && <span className="w-1.5 h-1.5 bg-white rounded-full live-pulse" />}
                    {ev.statusText}
                  </span>
                </div>

                {ev.viewers && (
                  <div className="absolute top-3 right-3 bg-black/60 px-2 py-1 rounded flex items-center gap-1">
                    <Icon name="Eye" size={12} className="text-white/70" />
                    <span className="text-white text-xs font-roboto">{ev.viewers}</span>
                  </div>
                )}

                {/* Bottom info */}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-fire text-xs font-oswald font-bold tracking-wider">{ev.sport}</span>
                  </div>
                  <h3 className="font-oswald text-white text-lg font-bold">{ev.title}</h3>
                </div>
              </div>

              {/* Details */}
              <div className="p-3 flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Icon name="MapPin" size={13} />
                    <span className="text-xs font-roboto">{ev.location}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Icon name="Calendar" size={13} />
                    <span className="text-xs font-roboto">{ev.date}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Icon name="Users" size={13} className="text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-roboto">{ev.participants}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
