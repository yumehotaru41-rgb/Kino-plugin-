// Capibara Traductor — Kino plugin
// Fuente: https://capibaratraductor.com
// Autor: Hotaru Yume (hotaruyume)
// Separa mangas, novelas y videomangas. Los vídeos salen en Inicio de Kino.

const BASE = "https://capibaratraductor.com";
const R2 = "https://r2.capibaratraductor.com";

async function api(path, timeoutMs) {
  const r = await kino.fetch(BASE + path, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Kino-Plugin/1.0 (CapibaraTraductor)",
      Referer: BASE + "/",
    },
    timeoutMs: timeoutMs || 20000,
  });
  if (!r.ok) {
    const err = new Error("HTTP " + r.status + " " + path);
    err.status = r.status;
    throw err;
  }
  const j = JSON.parse(r.body);
  if (j && j.status === false) {
    const err = new Error(j.message || j.error || "API error");
    err.code = j.error;
    throw err;
  }
  return j && j.data !== undefined ? j.data : j;
}

function clean(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isNovelType(t) {
  const s = String(t || "").toLowerCase();
  return s.includes("novel") || s === "novela" || s === "novela_ligera" || s === "light-novel" || s === "light_novel";
}

function isMangaLike(t) {
  const s = String(t || "").toLowerCase();
  return s === "manga" || s === "manhwa" || s === "manhua" || s === "webtoon" || !s;
}

function posterOf(item) {
  return (
    item.cover ||
    item.imageUrl ||
    item.thumbnailUrl ||
    (item.manga && (item.manga.imageUrl || item.manga.cover)) ||
    ""
  );
}

function titleOf(item) {
  return clean(item.title || (item.manga && item.manga.title) || item.name || "Sin título");
}

/** Ref de obra (manga/novela/joint) */
function workRef(item) {
  // Prefer joint- id when present
  if (item.id && String(item.id).startsWith("joint-")) {
    return "joint:" + (item.slug || String(item.id).replace(/^joint-/, ""));
  }
  if (item.slug && (item.organization || item.scanSlug || item.scanName)) {
    const org = (item.organization && item.organization.slug) || item.scanSlug || "";
    const kind = isNovelType((item.manga && item.manga.bookType && item.manga.bookType.code) || item.type)
      ? "novel"
      : "manga";
    return "work:" + kind + ":" + org + ":" + item.slug;
  }
  if (item.url) {
    // /scan/manga/slug or /writings/.../light-novel/slug or /joint/manga/slug
    const m = String(item.url).match(
      /\/(?:joint\/manga\/|([^/]+)\/manga\/|writings\/([^/]+)\/(?:light-)?novel\/)([^/?#]+)/i
    );
    if (m) {
      if (String(item.url).includes("/joint/")) return "joint:" + m[3];
      const org = m[1] || m[2] || "";
      const kind = String(item.url).includes("novel") ? "novel" : "manga";
      return "work:" + kind + ":" + org + ":" + m[3];
    }
  }
  if (item.slug) return "slug:" + item.slug;
  return "id:" + String(item.id || item.mangaId || "");
}

function videoRef(v) {
  return "video:" + (v.youtubeId || v.id);
}

function parseRef(ref) {
  if (!ref) return null;
  if (ref.startsWith("video:")) return { kind: "video", youtubeId: ref.slice(6) };
  if (ref.startsWith("joint:")) return { kind: "joint", slug: ref.slice(6) };
  if (ref.startsWith("work:")) {
    const parts = ref.slice(5).split(":");
    return { kind: "work", type: parts[0], org: parts[1] || "", slug: parts[2] || parts[1] };
  }
  if (ref.startsWith("slug:")) return { kind: "slug", slug: ref.slice(5) };
  if (ref.startsWith("ch:")) {
    // ch:joint:slug:number  or  ch:work:type:org:slug:number
    const rest = ref.slice(3);
    if (rest.startsWith("joint:")) {
      const p = rest.slice(6).split(":");
      return { kind: "chapter", joint: true, slug: p[0], number: p[1] };
    }
    const p = rest.split(":");
    return { kind: "chapter", joint: false, type: p[0], org: p[1], slug: p[2], number: p[3] };
  }
  if (ref.startsWith("id:")) return { kind: "id", id: ref.slice(3) };
  return { kind: "raw", ref };
}

function itemFromWork(w, forceKind) {
  const typeCode =
    (w.manga && w.manga.bookType && w.manga.bookType.code) ||
    w.workType ||
    w.type ||
    "";
  const novel = forceKind === "novel" || isNovelType(typeCode);
  const ref = workRef(w);
  return {
    id: String(w.id || w.mangaId || ref),
    ref,
    title: titleOf(w),
    kind: "series",
    poster: posterOf(w),
    overview: clean(
      w.shortDescription ||
        w.description ||
        (w.manga && (w.manga.shortDescription || w.manga.description)) ||
        ""
    ).slice(0, 400),
    genres: (w.genres || []).map((g) => (typeof g === "string" ? g : g.name)).filter(Boolean).slice(0, 8),
    badges: novel ? ["Novela"] : typeCode && typeCode !== "manga" ? [String(typeCode)] : undefined,
    adult: !!(w.isNSFW || (w.manga && w.manga.isNSFW)),
  };
}

function itemFromVideo(v) {
  const workTitle = v.work && v.work.title ? " · " + v.work.title : "";
  return {
    id: "yt-" + (v.youtubeId || v.id),
    ref: videoRef(v),
    title: clean(v.title || "Vídeo") + workTitle,
    kind: "movie",
    poster: v.thumbnailUrl || (v.work && v.work.cover) || "",
    overview: v.work
      ? clean((v.work.title || "") + (v.chapterNumber != null ? " · Cap. " + v.chapterNumber : ""))
      : "",
    badges: ["Vídeo"],
    runtimeMinutes: v.durationSec ? Math.round(v.durationSec / 60) : undefined,
  };
}

function itemFromSearchObra(o) {
  const novel = isNovelType(o.type);
  return {
    id: String(o.id),
    ref: workRef(o),
    title: titleOf(o),
    kind: "series",
    poster: posterOf(o),
    badges: novel ? ["Novela"] : o.type && o.type !== "manga" ? [String(o.type)] : undefined,
  };
}

// ---------- home ----------

export async function home() {
  const rows = [];

  // Videos first so they appear in Kino home
  try {
    const vids = await api("/api/videos?limit=18&page=1");
    const items = (vids.items || vids || []).filter((v) => v.youtubeId).map(itemFromVideo);
    if (items.length) {
      rows.push({
        id: "videos",
        title: "Últimos videomangas",
        items,
        ref: "browse:videos",
        genre: "anime",
      });
    }
  } catch (e) {
    kino.log && kino.log("videos home: " + (e.message || e));
  }

  // Featured / trending mangas
  try {
    const feat = await api("/api/landing/featured-manga?limit=18&page=1&nsfw=false&sort=daily&mix=1");
    const list = Array.isArray(feat) ? feat : feat.items || [];
    const items = list.map((w) => itemFromWork(w, "manga"));
    if (items.length) {
      rows.push({
        id: "featured-manga",
        title: "Mangas destacados",
        items,
        ref: "browse:manga-popular",
        genre: "anime",
      });
    }
  } catch (e) {
    kino.log && kino.log("featured: " + (e.message || e));
  }

  // Trending
  try {
    const tr = await api("/api/landing/trending?limit=18&nsfw=false");
    const list = Array.isArray(tr) ? tr : tr.items || [];
    const items = list.map((w) => itemFromWork(w));
    if (items.length) {
      rows.push({
        id: "trending",
        title: "Tendencias",
        items,
        ref: "browse:trending",
        genre: "anime",
      });
    }
  } catch (_) {}

  // Latest mangas (manga-custom)
  try {
    const mc = await api("/api/manga-custom?order=latest&limit=18&page=1&nsfw=false");
    const list = (mc.items || []).filter((w) => {
      const code = (w.manga && w.manga.bookType && w.manga.bookType.code) || "";
      return !isNovelType(code);
    });
    const items = list.map((w) => itemFromWork(w, "manga"));
    if (items.length) {
      rows.push({
        id: "latest-manga",
        title: "Mangas recientes",
        items,
        ref: "browse:manga-latest",
        genre: "anime",
      });
    }
  } catch (e) {
    kino.log && kino.log("manga-custom: " + (e.message || e));
  }

  // Novelas
  try {
    const mc = await api("/api/manga-custom?order=latest&limit=24&page=1&nsfw=false");
    const list = (mc.items || []).filter((w) => {
      const code = (w.manga && w.manga.bookType && w.manga.bookType.code) || "";
      return isNovelType(code);
    });
    const items = list.map((w) => itemFromWork(w, "novel"));
    if (items.length) {
      rows.push({
        id: "novels",
        title: "Novelas",
        items,
        ref: "browse:novels",
        genre: "series",
      });
    }
  } catch (_) {}

  // Popular scans' covers as extra row of works
  try {
    const scans = await api("/api/landing/scans?sort=popular&limit=6&page=1");
    const items = [];
    const raw = scans.items || scans || [];
    for (const sc of raw) {
      for (const c of sc.covers || []) {
        items.push({
          id: String(c.id),
          ref: workRef({ url: c.url, title: c.title, cover: c.cover, id: c.id }),
          title: clean(c.title),
          kind: "series",
          poster: c.cover || "",
        });
        if (items.length >= 18) break;
      }
      if (items.length >= 18) break;
    }
    if (items.length) {
      rows.push({
        id: "from-scans",
        title: "De scans populares",
        items,
        genre: "anime",
      });
    }
  } catch (_) {}

  return rows;
}

// ---------- browse ----------

export async function browse(ref, cursor) {
  const page = cursor ? parseInt(cursor, 10) || 1 : 1;
  const limit = 24;

  if (ref === "browse:videos") {
    const data = await api("/api/videos?limit=" + limit + "&page=" + page);
    const items = (data.items || []).filter((v) => v.youtubeId).map(itemFromVideo);
    const next = page < (data.maxPage || 1) ? String(page + 1) : undefined;
    return { items, next };
  }

  if (ref === "browse:manga-popular" || ref === "browse:manga-latest") {
    const order = ref === "browse:manga-popular" ? "popular" : "latest";
    const data = await api(
      "/api/manga-custom?order=" + order + "&limit=" + limit + "&page=" + page + "&nsfw=false"
    );
    const items = (data.items || [])
      .filter((w) => {
        const code = (w.manga && w.manga.bookType && w.manga.bookType.code) || "";
        return !isNovelType(code);
      })
      .map((w) => itemFromWork(w, "manga"));
    const next = page < (data.maxPage || 1) ? String(page + 1) : undefined;
    return { items, next };
  }

  if (ref === "browse:novels") {
    const data = await api(
      "/api/manga-custom?order=latest&limit=" + limit + "&page=" + page + "&nsfw=false"
    );
    const items = (data.items || [])
      .filter((w) => {
        const code = (w.manga && w.manga.bookType && w.manga.bookType.code) || "";
        return isNovelType(code);
      })
      .map((w) => itemFromWork(w, "novel"));
    const next = page < (data.maxPage || 1) ? String(page + 1) : undefined;
    return { items, next };
  }

  if (ref === "browse:trending") {
    const data = await api("/api/landing/trending?limit=" + limit + "&nsfw=false");
    const list = Array.isArray(data) ? data : data.items || [];
    return { items: list.map((w) => itemFromWork(w)) };
  }

  // fallback featured
  const feat = await api("/api/landing/featured-manga?limit=" + limit + "&page=" + page + "&nsfw=false&sort=daily&mix=1");
  const list = Array.isArray(feat) ? feat : feat.items || [];
  return { items: list.map((w) => itemFromWork(w)) };
}

// ---------- search ----------

export async function search(query) {
  const q = (query && query.q ? String(query.q) : "").trim();
  if (!q) return [];

  const data = await api("/api/search?q=" + encodeURIComponent(q) + "&limit=40");
  const obras = data.obras || [];
  const out = [];

  // Prefer novels / mangas separation in order
  const novels = obras.filter((o) => isNovelType(o.type));
  const mangas = obras.filter((o) => !isNovelType(o.type));

  for (const o of mangas.concat(novels)) {
    out.push(itemFromSearchObra(o));
  }

  // Also search videos by title if few results
  if (out.length < 8) {
    try {
      const vids = await api("/api/videos?limit=30&page=1");
      const ql = q.toLowerCase();
      for (const v of vids.items || []) {
        if (!v.youtubeId) continue;
        const t = (v.title || "") + " " + ((v.work && v.work.title) || "");
        if (t.toLowerCase().includes(ql)) out.push(itemFromVideo(v));
      }
    } catch (_) {}
  }

  return out.slice(0, 50);
}

// ---------- episodes ----------

async function loadJoint(slug) {
  return api("/api/joint/" + encodeURIComponent(slug));
}

async function loadMangaBySlug(slug) {
  return api("/api/manga/" + encodeURIComponent(slug));
}

export async function episodes(ref) {
  const p = parseRef(ref);
  if (!p) throw new Error("Ref inválido");

  if (p.kind === "video") {
    // single "episode" = the video itself
    return {
      series: { title: "Vídeo" },
      episodes: [
        {
          season: 1,
          number: 1,
          ref: ref,
          title: "Reproducir",
        },
      ],
    };
  }

  let data = null;
  let joint = false;
  let slug = p.slug;

  if (p.kind === "joint" || (p.kind === "work" && !p.org)) {
    joint = true;
    data = await loadJoint(slug);
  } else if (p.kind === "work" || p.kind === "slug") {
    // Try joint first (many popular titles are joint)
    try {
      data = await loadJoint(slug);
      joint = true;
    } catch (_) {
      data = await loadMangaBySlug(slug);
      joint = false;
    }
  } else if (p.kind === "id") {
    // best effort
    try {
      data = await loadJoint(String(p.id));
      joint = true;
      slug = data.slug || String(p.id);
    } catch (_) {
      throw new Error("No se pudo cargar la obra");
    }
  } else {
    throw new Error("Tipo de ref no soportado para episodios");
  }

  const title = titleOf(data);
  const poster = posterOf(data);
  const overview = clean(data.shortDescription || data.description || "").slice(0, 600);
  const chapters = (data.chapters || []).filter((c) => !c.isUnreleased && !c.hiddenAt);

  // sort ascending by number
  chapters.sort((a, b) => Number(a.number) - Number(b.number));

  const episodes = chapters.slice(-500).map((c, idx) => {
    const num = Number(c.number);
    const chRef = joint
      ? "ch:joint:" + slug + ":" + c.number
      : "ch:work:manga:" + (p.org || "") + ":" + slug + ":" + c.number;
    return {
      season: 1,
      number: Number.isFinite(num) ? num : idx + 1,
      ref: chRef,
      title: clean(c.title || ("Cap. " + c.number)),
      airDate: c.releasedAt ? String(c.releasedAt).slice(0, 10) : undefined,
    };
  });

  return {
    series: {
      title,
      poster,
      overview,
      genres: (data.genres || []).map((g) => (typeof g === "string" ? g : g.name)).filter(Boolean),
    },
    episodes,
  };
}

// ---------- resolve ----------

export async function resolve(ref) {
  const p = parseRef(ref);
  if (!p) throw new Error("Ref inválido");

  // YouTube video
  if (p.kind === "video") {
    const id = p.youtubeId;
    if (!id) throw new Error("Sin youtubeId");
    return {
      url: "https://www.youtube.com/watch?v=" + id,
      mime: "text/html",
      label: "YouTube",
      alternatives: [
        { url: "https://youtu.be/" + id, label: "youtu.be" },
        { url: "https://www.youtube.com/embed/" + id, label: "Embed" },
      ],
    };
  }

  // Chapter pages — try to get image list; if only teaser, fall back to chapter page URL
  if (p.kind === "chapter") {
    const slug = p.slug;
    const number = p.number;
    let pagesPath;
    if (p.joint) {
      pagesPath = "/api/joint/" + encodeURIComponent(slug) + "/chapter/" + encodeURIComponent(number) + "/pages";
    } else {
      pagesPath =
        "/api/manga-custom/" +
        encodeURIComponent(slug) +
        "/chapter/" +
        encodeURIComponent(number) +
        "/pages";
    }

    let pages = [];
    try {
      const data = await api(pagesPath);
      pages = Array.isArray(data) ? data : data.pages || data.items || [];
    } catch (e) {
      kino.log && kino.log("pages: " + (e.message || e));
    }

    // Collect distinct image URLs (API often repeats a cover; real pages may need ph decrypt)
    const urls = [];
    const seen = new Set();
    for (const pg of pages) {
      const u = pg.imageUrl || pg.url;
      if (u && !seen.has(u)) {
        seen.add(u);
        urls.push(u);
      }
    }

    if (urls.length > 1) {
      // Multiple pages → first as main, rest as alternatives (Kino plays single stream;
      // for full reader a screen plugin would be better)
      return {
        url: urls[0],
        mime: "image/webp",
        headers: { Referer: BASE + "/" },
        label: "Página 1/" + urls.length,
        alternatives: urls.slice(1, 20).map((u, i) => ({
          url: u,
          mime: "image/webp",
          label: "Pág. " + (i + 2),
        })),
      };
    }

    if (urls.length === 1) {
      // Single image — still return it; user can open site for full chapter
      return {
        url: urls[0],
        mime: "image/webp",
        headers: { Referer: BASE + "/" },
        label: "Portada / página",
        alternatives: [
          {
            url:
              BASE +
              (p.joint
                ? "/joint/manga/" + encodeURIComponent(slug) + "/chapters/" + encodeURIComponent(number)
                : "/" + (p.org || "") + "/manga/" + encodeURIComponent(slug) + "/chapters/" + encodeURIComponent(number)),
            mime: "text/html",
            label: "Abrir en Capibara",
          },
        ],
      };
    }

    // Fallback: open chapter on the site
    const pageUrl = p.joint
      ? BASE + "/joint/manga/" + encodeURIComponent(slug) + "/chapters/" + encodeURIComponent(number)
      : BASE +
        "/" +
        (p.org || "manga") +
        "/manga/" +
        encodeURIComponent(slug) +
        "/chapters/" +
        encodeURIComponent(number);
    return {
      url: pageUrl,
      mime: "text/html",
      label: "Capítulo en Capibara",
    };
  }

  // Opening a work directly → first chapter if possible
  if (p.kind === "joint" || p.kind === "work" || p.kind === "slug") {
    const ep = await episodes(ref);
    if (ep.episodes && ep.episodes.length) {
      return resolve(ep.episodes[0].ref);
    }
    throw new Error("Sin capítulos");
  }

  throw new Error("No se puede resolver: " + ref);
}
