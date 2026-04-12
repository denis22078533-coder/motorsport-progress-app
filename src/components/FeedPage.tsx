import { useState } from "react";
import Icon from "@/components/ui/icon";

const STORIES = [
  { id: 1, name: "MotoGP", icon: "🏍️", live: true },
  { id: 2, name: "WRC Rally", icon: "🚗", live: true },
  { id: 3, name: "Формула 1", icon: "🏎️", live: false },
  { id: 4, name: "Superbike", icon: "🏁", live: false },
  { id: 5, name: "Дрифт", icon: "💨", live: false },
  { id: 6, name: "Картинг", icon: "🔧", live: false },
];

const POSTS = [
  {
    id: 1,
    user: "MotoGP_Official",
    avatar: "🏍️",
    sport: "MotoGP",
    time: "LIVE · 2ч 14м",
    isLive: true,
    image: "https://cdn.poehali.dev/projects/4fe9d363-5216-44d6-8799-40a6f4aeed69/files/3571fa90-01b9-48d3-a6a4-1a75e7a9ac09.jpg",
    title: "Гран-При Испании 2024",
    desc: "Захватывающая борьба на трассе Хереса! Марк Маркес уходит в отрыв на 3-м круге",
    likes: 4821,
    comments: 312,
    views: "128K",
    tag: "🔴 ПРЯМОЙ ЭФИР",
    tagColor: "bg-red-600",
  },
  {
    id: 2,
    user: "WRC_Rally",
    avatar: "🚗",
    sport: "WRC",
    time: "3 часа назад",
    isLive: false,
    image: "https://cdn.poehali.dev/projects/4fe9d363-5216-44d6-8799-40a6f4aeed69/files/ed071a00-b7e4-4512-8c06-68a6062dd2bd.jpg",
    title: "Ралли Сафари — Кения 2024",
    desc: "Ожесточённая схватка Ожье и Танака на грунтовых дорогах Кении. Финальный этап!",
    likes: 2341,
    comments: 178,
    views: "67K",
    tag: "🎬 ВИДЕОЗАПИСЬ",
    tagColor: "bg-orange-600",
  },
  {
    id: 3,
    user: "F1_Highlights",
    avatar: "🏎️",
    sport: "Formula 1",
    time: "Вчера",
    isLive: false,
    image: "https://cdn.poehali.dev/projects/4fe9d363-5216-44d6-8799-40a6f4aeed69/files/3571fa90-01b9-48d3-a6a4-1a75e7a9ac09.jpg",
    title: "Гран-При Монако — Лучшие моменты",
    desc: "Топ-10 обгонов сезона, включая невероятный финал в туннеле Монте-Карло",
    likes: 9102,
    comments: 654,
    views: "341K",
    tag: "🏆 ЛУЧШЕЕ",
    tagColor: "bg-yellow-600",
  },
];

export default function FeedPage() {
  const [liked, setLiked] = useState<number[]>([]);
  const [saved, setSaved] = useState<number[]>([]);

  const toggleLike = (id: number) => {
    setLiked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleSave = (id: number) => {
    setSaved(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center justify-between">
        <span className="font-oswald text-2xl font-bold tracking-widest text-white">
          MOTO<span className="text-fire">FEED</span>
        </span>
        <div className="flex gap-3">
          <button className="text-muted-foreground hover:text-white transition-colors">
            <Icon name="Search" size={22} />
          </button>
          <button className="text-muted-foreground hover:text-white transition-colors relative">
            <Icon name="Bell" size={22} />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-fire rounded-full" />
          </button>
        </div>
      </div>

      {/* Stories */}
      <div className="px-4 py-3 flex gap-3 overflow-x-auto scrollbar-hide">
        {STORIES.map((s) => (
          <div key={s.id} className="flex-shrink-0 flex flex-col items-center gap-1 cursor-pointer">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl border-2 transition-transform hover:scale-105 ${s.live ? 'border-fire bg-fire/10' : 'border-border bg-secondary'}`}>
              {s.icon}
              {s.live && (
                <span className="absolute mt-10 ml-10 w-3 h-3 bg-red-500 rounded-full border-2 border-background live-pulse" />
              )}
            </div>
            <span className="text-xs text-muted-foreground font-roboto whitespace-nowrap">{s.name}</span>
            {s.live && <span className="text-[9px] text-fire font-oswald font-bold tracking-wider">LIVE</span>}
          </div>
        ))}
      </div>

      <div className="h-px bg-border mx-4 mb-2" />

      {/* Posts */}
      <div className="flex flex-col gap-1">
        {POSTS.map((post, i) => (
          <article key={post.id} className={`animate-fade-in stagger-${i + 1} opacity-0`}>
            {/* Post Header */}
            <div className="px-4 py-2 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-secondary border border-border flex items-center justify-center text-lg">
                {post.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-oswald font-semibold text-white text-sm">{post.user}</span>
                  <span className="text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded-full font-roboto">{post.sport}</span>
                </div>
                <span className="text-xs text-muted-foreground font-roboto">{post.time}</span>
              </div>
              <button className="text-muted-foreground hover:text-white transition-colors">
                <Icon name="MoreHorizontal" size={18} />
              </button>
            </div>

            {/* Image */}
            <div className="relative overflow-hidden">
              <img
                src={post.image}
                alt={post.title}
                className="w-full aspect-video object-cover"
              />
              <div className="feed-gradient absolute inset-0" />

              {/* Tag */}
              <div className="absolute top-3 left-3">
                <span className={`${post.tagColor} text-white text-xs font-oswald font-bold px-2 py-1 rounded tracking-wider`}>
                  {post.tag}
                </span>
              </div>

              {/* Play button for videos */}
              {!post.isLive && (
                <button className="absolute inset-0 flex items-center justify-center group">
                  <div className="w-14 h-14 rounded-full bg-black/60 border-2 border-white/80 flex items-center justify-center group-hover:bg-fire/80 transition-colors">
                    <Icon name="Play" size={24} className="text-white ml-1" />
                  </div>
                </button>
              )}

              {/* Live indicator */}
              {post.isLive && (
                <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/60 px-2 py-1 rounded">
                  <span className="w-2 h-2 bg-red-500 rounded-full live-pulse" />
                  <span className="text-white text-xs font-oswald font-bold">СМОТРЕТЬ</span>
                </div>
              )}

              {/* Bottom info */}
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <h3 className="font-oswald text-white text-lg font-bold leading-tight">{post.title}</h3>
                <p className="text-white/80 text-xs font-roboto mt-0.5 line-clamp-1">{post.desc}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-white/60 text-xs font-roboto flex items-center gap-1">
                    <Icon name="Eye" size={12} />
                    {post.views}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="px-4 py-2 flex items-center gap-5">
              <button
                onClick={() => toggleLike(post.id)}
                className={`flex items-center gap-1.5 transition-colors ${liked.includes(post.id) ? 'text-fire' : 'text-muted-foreground hover:text-white'}`}
              >
                <Icon name={liked.includes(post.id) ? "Heart" : "Heart"} size={20} />
                <span className="text-sm font-roboto">{post.likes + (liked.includes(post.id) ? 1 : 0)}</span>
              </button>
              <button className="flex items-center gap-1.5 text-muted-foreground hover:text-white transition-colors">
                <Icon name="MessageCircle" size={20} />
                <span className="text-sm font-roboto">{post.comments}</span>
              </button>
              <button className="flex items-center gap-1.5 text-muted-foreground hover:text-white transition-colors">
                <Icon name="Share2" size={20} />
              </button>
              <div className="flex-1" />
              <button
                onClick={() => toggleSave(post.id)}
                className={`transition-colors ${saved.includes(post.id) ? 'text-fire' : 'text-muted-foreground hover:text-white'}`}
              >
                <Icon name="Bookmark" size={20} />
              </button>
            </div>
            <div className="h-px bg-border mx-4" />
          </article>
        ))}
      </div>
    </div>
  );
}
