// Capibara Traductor — Kino plugin
// Fuente: https://capibaratraductor.com
// Autor: Hotaru Yume (hotaruyume)
// Separa mangas, novelas y videomangas. Los vídeos salen en Inicio de Kino.
//
// v1.0.1: fix kino.fetch body (r.text(), no r.body) — v1.0.0 devolvía home vacío en silencio.

const BASE = "https://capibaratraductor.com";

async function api(path, timeoutMs) {
  const r = await kino.fetch(BASE + path, {
    headers: {
      Accept: "application/json",
      Referer: BASE + "/",
    },
    timeoutMs: timeoutMs || 20000,
  });
  if (!r.ok) {
    throw kino.error("unavailable", "HTTP " + r.status + " " + path, {
      userMessage: "Capibara no respondió (" + r.status + "). Revisa la conexión o reintenta.",
    });
  }
  // Kino: el cuerpo se lee con r.text() / r.json(), NO r.body
  const text = await r.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch (e) {
    throw kino.error("unavailable", "JSON inválido en " + path, {
      userMessage: "Respuesta inválida de Capibara. Inténtalo de nuevo.",
    });
  }
  if (j && j.status === false) {
    throw kino.error("unavailable", j.message || j.error || "API error", {
      userMessage: j.message || "Capibara rechazó la petición.",
    });
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
  return (
    s.includes("novel") ||
    s === "novela" ||
    s === "novela_ligera" ||
    s === "light-novel" ||
    s === "light_novel"
  );
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
  if (item.id && String(item.id).startsWith("joint-")) {
    return "joint:" + (item.slug || String(item.id).replace(/^joint-/, ""));
  }
  if (item.slug && (item.organization || item.scanSlug || item.scanName)) {
    const org = (item.organization && item.organization.slug) || item.scanSlug || "";
    const kind = isNovelType(
      (item.manga && item.manga.bookType && item.manga.bookType.code) || item.type
    )
      ? "novel"
      : "manga";
    return "work:" + kind + ":" + org + ":" + item.slug;
  }
  if (item.url) {
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
    (w.manga && w.manga.bookType && w.manga.bookType.code) || w.workType || w.type || "";
  const novel = forceKind === "novel" || isNovelType(typeCode);
  const ref = workRef(w);
  return {
    id: String(w.id || w.mangaId || ref),
    ref: ref,
    title: titleOf(w),
    kind: "series",
    poster: posterOf(w),
    overview: clean(
      w.shortDescription ||
        w.description ||
        (w.manga && (w.manga.shortDescription || w.manga.description)) ||
        ""
    ).slice(0, 400),
    genres: (w.genres || [])
      .map(function (g) {
        return typeof g === "string" ? g : g.name;
      })
      .filter(Boolean)
      .slice(0, 8),
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

function logErr(where, e) {
  try {
    kino.log(where, (e && (e.message || e.code || String(e))) || "error");
  } catch (_) {}
}

// ---------- home ----------

export async function home() {
  const rows = [];
  const errors = [];

  // Videos first (appear in Kino home)
  try {
    const vids = await api("/api/videos?limit=18&page=1");
    const items = (vids.items || vids || [])
      .filter(function (v) {
        return v.youtubeId;
      })
      .map(itemFromVideo);
    if (items.length) {
      rows.push({
        id: "videos",
        title: "Últimos videomangas",
        items: items,
        ref: "browse:videos",
        genre: "anime",
      });
    }
  } catch (e) {
    logErr("home.videos", e);
    errors.push("videos: " + (e.message || e));
  }

  // Featured mangas
  try {
    const feat = await api(
      "/api/landing/featured-manga?limit=18&page=1&nsfw=false&sort=daily&mix=1"
    );
    const list = Array.isArray(feat) ? feat : feat.items || [];
    const items = list.map(function (w) {
      return itemFromWork(w, "manga");
    });
    if (items.length) {
      rows.push({
        id: "featured-manga",
        title: "Mangas destacados",
        items: items,
        ref: "browse:manga-popular",
        genre: "anime",
      });
    }
  } catch (e) {
    logErr("home.featured", e);
    errors.push("featured: " + (e.message || e));
  }

  // Trending
  try {
    const tr = await api("/api/landing/trending?limit=18&nsfw=false");
    const list = Array.isArray(tr) ? tr : tr.items || [];
    const items = list.map(function (w) {
      return itemFromWork(w);
    });
    if (items.length) {
      rows.push({
        id: "trending",
        title: "Tendencias",
        items: items,
        ref: "browse:trending",
        genre: "anime",
      });
    }
  } catch (e) {
    logErr("home.trending", e);
  }

  // Latest mangas
  try {
    const mc = await api("/api/manga-custom?order=latest&limit=18&page=1&nsfw=false");
    const list = (mc.items || []).filter(function (w) {
      const code = (w.manga && w.manga.bookType && w.manga.bookType.code) || "";
      return !isNovelType(code);
    });
    const items = list.map(function (w) {
      return itemFromWork(w, "manga");
    });
    if (items.length) {
      rows.push({
        id: "latest-manga",
        title: "Mangas recientes",
        items: items,
        ref: "browse:manga-latest",
        genre: "anime",
      });
    }
  } catch (e) {
    logErr("home.manga-custom", e);
    errors.push("manga-custom: " + (e.message || e));
  }

  // Novelas
  try {
    const mc = await api("/api/manga-custom?order=latest&limit=30&page=1&nsfw=false");
    const list = (mc.items || []).filter(function (w) {
      const code = (w.manga && w.manga.bookType && w.manga.bookType.code) || "";
      return isNovelType(code);
    });
    const items = list.map(function (w) {
      return itemFromWork(w, "novel");
    });
    if (items.length) {
      rows.push({
        id: "novels",
        title: "Novelas",
        items: items,
        ref: "browse:novels",
        genre: "series",
      });
    }
  } catch (e) {
    logErr("home.novels", e);
  }

  // Scans populares
  try {
    const scans = await api("/api/landing/scans?sort=popular&limit=6&page=1");
    const items = [];
    const raw = scans.items || scans || [];
    for (let si = 0; si < raw.length; si++) {
      const sc = raw[si];
      const covers = sc.covers || [];
      for (let ci = 0; ci < covers.length; ci++) {
        const c = covers[ci];
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
        items: items,
        genre: "anime",
      });
    }
  } catch (e) {
    logErr("home.scans", e);
  }

  if (!rows.length) {
    throw kino.error(
      "unavailable",
      errors.length ? errors.join(" | ") : "home vacío",
      {
        userMessage:
          "No se pudo cargar el catálogo de Capibara. Comprueba que aprobaste el host capibaratraductor.com e inténtalo de nuevo.",
      }
    );
  }
  return rows;
}

// ---------- browse ----------

export async function browse(ref, cursor) {
  const page = cursor ? parseInt(cursor, 10) || 1 : 1;
  const limit = 24;

  if (ref === "browse:videos") {
    const data = await api("/api/videos?limit=" + limit + "&page=" + page);
    const items = (data.items || [])
      .filter(function (v) {
        return v.youtubeId;
      })
      .map(itemFromVideo);
    const next = page < (data.maxPage || 1) ? String(page + 1) : undefined;
    return { items: items, next: next };
  }

  if (ref === "browse:manga-popular" || ref === "browse:manga-latest") {
    const order = ref === "browse:manga-popular" ? "popular" : "latest";
    const data = await api(
      "/api/manga-custom?order=" + order + "&limit=" + limit + "&page=" + page + "&nsfw=false"
    );
    const items = (data.items || [])
      .filter(function (w) {
        const code = (w.manga && w.manga.bookType && w.manga.bookType.code) || "";
        return !isNovelType(code);
      })
      .map(function (w) {
        return itemFromWork(w, "manga");
      });
    const next = page < (data.maxPage || 1) ? String(page + 1) : undefined;
    return { items: items, next: next };
  }

  if (ref === "browse:novels") {
    const data = await api(
      "/api/manga-custom?order=latest&limit=" + limit + "&page=" + page + "&nsfw=false"
    );
    const items = (data.items || [])
      .filter(function (w) {
        const code = (w.manga && w.manga.bookType && w.manga.bookType.code) || "";
        return isNovelType(code);
      })
      .map(function (w) {
        return itemFromWork(w, "novel");
      });
    const next = page < (data.maxPage || 1) ? String(page + 1) : undefined;
    return { items: items, next: next };
  }

  if (ref === "browse:trending") {
    const data = await api("/api/landing/trending?limit=" + limit + "&nsfw=false");
    const list = Array.isArray(data) ? data : data.items || [];
    return {
      items: list.map(function (w) {
        return itemFromWork(w);
      }),
    };
  }

  const feat = await api(
    "/api/landing/featured-manga?limit=" + limit + "&page=" + page + "&nsfw=false&sort=daily&mix=1"
  );
  const list = Array.isArray(feat) ? feat : feat.items || [];
  return {
    items: list.map(function (w) {
      return itemFromWork(w);
    }),
  };
}

// ---------- search ----------

export async function search(query) {
  const q = (query && query.q ? String(query.q) : "").trim();
  if (!q) return [];

  const data = await api("/api/search?q=" + encodeURIComponent(q) + "&limit=40");
  const obras = data.obras || [];
  const out = [];

  const novels = obras.filter(function (o) {
    return isNovelType(o.type);
  });
  const mangas = obras.filter(function (o) {
    return !isNovelType(o.type);
  });

  for (let i = 0; i < mangas.length; i++) out.push(itemFromSearchObra(mangas[i]));
  for (let i = 0; i < novels.length; i++) out.push(itemFromSearchObra(novels[i]));

  if (out.length < 8) {
    try {
      const vids = await api("/api/videos?limit=30&page=1");
      const ql = q.toLowerCase();
      const list = vids.items || [];
      for (let i = 0; i < list.length; i++) {
        const v = list[i];
        if (!v.youtubeId) continue;
        const t = (v.title || "") + " " + ((v.work && v.work.title) || "");
        if (t.toLowerCase().indexOf(ql) !== -1) out.push(itemFromVideo(v));
      }
    } catch (e) {
      logErr("search.videos", e);
    }
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
  if (!p) {
    throw kino.error("invalid_ref", "Ref inválido", {
      userMessage: "No se pudo abrir esta obra.",
    });
  }

  if (p.kind === "video") {
    return {
      series: { title: "Vídeo" },
      episodes: [{ season: 1, number: 1, ref: ref, title: "Reproducir" }],
    };
  }

  let data = null;
  let joint = false;
  let slug = p.slug;

  if (p.kind === "joint" || (p.kind === "work" && !p.org)) {
    joint = true;
    data = await loadJoint(slug);
  } else if (p.kind === "work" || p.kind === "slug") {
    try {
      data = await loadJoint(slug);
      joint = true;
    } catch (e) {
      data = await loadMangaBySlug(slug);
      joint = false;
    }
  } else if (p.kind === "id") {
    try {
      data = await loadJoint(String(p.id));
      joint = true;
      slug = data.slug || String(p.id);
    } catch (e) {
      throw kino.error("unavailable", "obra no encontrada", {
        userMessage: "No se pudo cargar la obra en Capibara.",
      });
    }
  } else {
    throw kino.error("invalid_ref", "tipo no soportado", {
      userMessage: "Este título no se puede listar por capítulos.",
    });
  }

  const title = titleOf(data);
  const poster = posterOf(data);
  const overview = clean(data.shortDescription || data.description || "").slice(0, 600);
  const chapters = (data.chapters || []).filter(function (c) {
    return !c.isUnreleased && !c.hiddenAt;
  });
  chapters.sort(function (a, b) {
    return Number(a.number) - Number(b.number);
  });

  const episodesList = chapters.slice(-500).map(function (c, idx) {
    const num = Number(c.number);
    const chRef = joint
      ? "ch:joint:" + slug + ":" + c.number
      : "ch:work:manga:" + (p.org || "") + ":" + slug + ":" + c.number;
    return {
      season: 1,
      number: Number.isFinite(num) ? num : idx + 1,
      ref: chRef,
      title: clean(c.title || "Cap. " + c.number),
      airDate: c.releasedAt ? String(c.releasedAt).slice(0, 10) : undefined,
    };
  });

  return {
    series: {
      title: title,
      poster: poster,
      overview: overview,
      genres: (data.genres || [])
        .map(function (g) {
          return typeof g === "string" ? g : g.name;
        })
        .filter(Boolean),
    },
    episodes: episodesList,
  };
}

// ---------- resolve ----------

export async function resolve(ref) {
  const p = parseRef(ref);
  if (!p) {
    throw kino.error("invalid_ref", "Ref inválido", {
      userMessage: "No se puede reproducir este ítem.",
    });
  }

  if (p.kind === "video") {
    const id = p.youtubeId;
    if (!id) {
      throw kino.error("unavailable", "sin youtubeId", {
        userMessage: "Este vídeo no tiene ID de YouTube.",
      });
    }
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

  if (p.kind === "chapter") {
    const slug = p.slug;
    const number = p.number;
    let pagesPath;
    if (p.joint) {
      pagesPath =
        "/api/joint/" +
        encodeURIComponent(slug) +
        "/chapter/" +
        encodeURIComponent(number) +
        "/pages";
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
      logErr("resolve.pages", e);
    }

    const urls = [];
    const seen = {};
    for (let i = 0; i < pages.length; i++) {
      const u = pages[i].imageUrl || pages[i].url;
      if (u && !seen[u]) {
        seen[u] = true;
        urls.push(u);
      }
    }

    const siteUrl = p.joint
      ? BASE +
        "/joint/manga/" +
        encodeURIComponent(slug) +
        "/chapters/" +
        encodeURIComponent(number)
      : BASE +
        "/" +
        (p.org || "manga") +
        "/manga/" +
        encodeURIComponent(slug) +
        "/chapters/" +
        encodeURIComponent(number);

    if (urls.length > 1) {
      return {
        url: urls[0],
        mime: "image/webp",
        headers: { Referer: BASE + "/" },
        label: "Página 1/" + urls.length,
        alternatives: urls.slice(1, 20).map(function (u, i) {
          return { url: u, mime: "image/webp", label: "Pág. " + (i + 2) };
        }).concat([{ url: siteUrl, mime: "text/html", label: "Abrir en Capibara" }]),
      };
    }

    if (urls.length === 1) {
      return {
        url: urls[0],
        mime: "image/webp",
        headers: { Referer: BASE + "/" },
        label: "Imagen",
        alternatives: [{ url: siteUrl, mime: "text/html", label: "Abrir en Capibara" }],
      };
    }

    return {
      url: siteUrl,
      mime: "text/html",
      label: "Capítulo en Capibara",
    };
  }

  if (p.kind === "joint" || p.kind === "work" || p.kind === "slug") {
    const ep = await episodes(ref);
    if (ep.episodes && ep.episodes.length) {
      return resolve(ep.episodes[0].ref);
    }
    throw kino.error("unavailable", "sin capítulos", {
      userMessage: "Esta obra no tiene capítulos publicados.",
    });
  }

  throw kino.error("invalid_ref", "no se puede resolver: " + ref, {
    userMessage: "No se puede reproducir este título.",
  });
}
