// Capibara Traductor — Kino plugin v2.0.0
// Autor: Hotaru Yume (hotaruyume)
// Camino completo: catálogo (vídeos / mangas / novelas) + descifrado ph +
// lector de manga en pantalla + episodios + resolve de vídeo (YouTube best-effort).
// Requiere Kino 0.9.74+ (apiVersion 14, screen).

const BASE = "https://capibaratraductor.com";
const MAX_CAPS = 490;

// ===================== Descifrado de páginas (ph / ls / lh) =====================
// Portado del cliente de Capibara (callApi): ls → semilla + token HTML, pe(ph), ce/se.

const B64 = "CDoIL78Qqwj9zKM6mOFdf0niV_AByGg4aNhbEetPsHr1x-TpZJYRk5lWu32vUcSX";
const X64 = "tgEib4lqMSha5TU13QX28deN-xuk6KywP0m_roGYvBWAnzFfjcJIVROp7CsDZ9HL";
const U_TBL = [
  [12, 2, 13, 7, 1, 9, 8],
  [11, 4, 5, 6, 3, 9, 12],
  [9, 8, 2, 3, 1, 6, 13],
  [8, 7, 2, 13, 1, 3, 6],
  [13, 2, 11, 6, 4, 3, 8],
  [6, 1, 3, 4, 7, 5, 11],
  [4, 8, 7, 9, 1, 10, 13],
  [8, 3, 6, 13, 12, 10, 11],
];
const W_TBL = [234, 55, 192, 73, 249, 251, 2, 58];
const B64MAP = {};
const X64MAP = {};
for (let i = 0; i < 64; i++) {
  B64MAP[B64[i]] = i;
  X64MAP[X64[i]] = i;
}

function imul(a, b) {
  const ah = (a >>> 16) & 0xffff;
  const al = a & 0xffff;
  const bh = (b >>> 16) & 0xffff;
  const bl = b & 0xffff;
  return ((al * bl + (((ah * bl + al * bh) << 16) >>> 0)) >>> 0) | 0;
}

function Ihash(e) {
  e = e >>> 0;
  e = (e ^ (e >>> 16)) >>> 0;
  e = imul(e, 2146121005) >>> 0;
  e = (e ^ (e >>> 15)) >>> 0;
  e = imul(e, 2221713035) >>> 0;
  e = (e ^ (e >>> 16)) >>> 0;
  return e >>> 0;
}

function Lhash(s) {
  let t = 2166136261;
  s = String(s || "");
  for (let n = 0; n < s.length; n++) {
    t = (t ^ s.charCodeAt(n)) >>> 0;
    t = imul(t, 16777619) >>> 0;
  }
  return t >>> 0;
}

function Rhash(arr) {
  let t = 2166136261;
  for (let n = 0; n < arr.length; n++) {
    t = (t ^ (arr[n] & 255)) >>> 0;
    t = imul(t, 16777619) >>> 0;
  }
  return t >>> 0;
}

function Fdecode(e) {
  const t = [];
  let n = 0;
  let r = 0;
  for (let i = 0; i < e.length; i++) {
    const a = B64MAP[e[i]];
    if (a === undefined) return null;
    n = (n << 6) | a;
    r += 6;
    if (r >= 8) {
      r -= 8;
      t.push((n >>> r) & 255);
      n &= (1 << r) - 1;
    }
  }
  return t;
}

function toBase36(n) {
  n = n >>> 0;
  if (n === 0) return "0";
  const digits = "0123456789abcdefghijklmnopqrstuvwxyz";
  let out = "";
  while (n > 0) {
    out = digits[n % 36] + out;
    n = Math.floor(n / 36);
  }
  return out;
}

function Jname(e) {
  return "_" + toBase36(Ihash((e ^ 1000283751) >>> 0));
}

function qseed(e) {
  const t = Fdecode(e);
  if (!t || t.length !== 14) return null;
  const row = U_TBL[t[0] & 7];
  const n = [];
  for (let i = 0; i < 7; i++) {
    n.push((t[row[i]] ^ W_TBL[(i + t[0]) & 7] ^ t[0]) & 255);
  }
  return {
    p: (n[0] << 16) | (n[1] << 8) | n[2],
    v: ((n[3] << 24) | (n[4] << 16) | (n[5] << 8) | n[6]) >>> 0,
  };
}

function Ytoken(e, globals) {
  for (let n = e - 1; n <= e + 1; n++) {
    const key = Jname(n);
    const r = globals[key];
    if (typeof r !== "string" || !/^[0-9a-f]{24}$/.test(r)) continue;
    const i = e - n + 1;
    const part = r.slice(i * 8, i * 8 + 8);
    if (part.length !== 8) continue;
    return (parseInt(part, 16) ^ Ihash(((n * 3 + i) ^ 739982445) >>> 0)) >>> 0;
  }
  return null;
}

function peTransform(e, t) {
  if (typeof e !== "string" || e.length < 2) return e;
  let n = "";
  for (let r = 0; r < e.length; r++) {
    const i = X64MAP[e[r]];
    if (i === undefined) return e;
    n += X64[(i - r * 7 - 13 - t) & 63];
  }
  const len = n.length;
  const rot = (len * 5 + t * 3 + 1) % len;
  n = n.slice(len - rot) + n.slice(0, len - rot);
  const half = Math.ceil(n.length / 2);
  const left = n.slice(0, half);
  const right = n.slice(half).split("").reverse();
  let out = "";
  for (let idx = 0; idx < n.length; idx++) {
    out += idx % 2 ? right[(idx - 1) / 2] : left[idx / 2];
  }
  return out;
}

function seDecrypt(bytes, seed, pageIdx, fieldIdx, idHash) {
  let a = Ihash((seed ^ 1821285621) >>> 0);
  let o = Ihash((a ^ imul(pageIdx + 1, 2654435761)) >>> 0);
  let s = Ihash((o ^ (imul(fieldIdx + 1, 2246822519) ^ idHash)) >>> 0);
  let c = Ihash((s ^ 374761393) >>> 0);
  function step() {
    let e = ((a + o) | 0) + c;
    e = e | 0;
    c = (c + 1) | 0;
    a = o ^ (o >>> 9);
    o = (s + (s << 3)) | 0;
    s = (s << 21) | (s >>> 11);
    s = (s + e) | 0;
    return e >>> 0;
  }
  for (let i = 0; i < 16; i++) step();
  let u = 0;
  const e = bytes.slice();
  for (let t = 0; t < e.length; t++) {
    if (t % 4 === 0) u = step();
    e[t] = (e[t] ^ ((u >>> ((t % 4) * 8)) & 255)) & 255;
  }
  if (e[0] === 4 && (Rhash(e.slice(3)) & 65535) === ((e[1] << 8) | e[2])) {
    return e;
  }
  return null;
}

function decodePh(ph, seed, pageIdx, pageId) {
  const transformed = peTransform(ph, pageIdx);
  const raw = Fdecode(transformed);
  if (!raw || raw.length < 3 || raw.length > 4096) return null;
  const idHash = Lhash(String(pageId == null ? "" : pageId));
  const dec = seDecrypt(raw, seed, pageIdx, 0, idHash);
  if (!dec) return null;
  const payload = dec.slice(3);
  let s = "";
  for (let i = 0; i < payload.length; i++) s += String.fromCharCode(payload[i]);
  try {
    // UTF-8 via percent encoding trick available in QuickJS
    return decodeURIComponent(escape(s));
  } catch (_) {
    return s;
  }
}

let cachedToken = null;
let cachedTokenAt = 0;

async function fetchPageToken() {
  const now = Date.now();
  if (cachedToken && now - cachedTokenAt < 10 * 60 * 1000) return cachedToken;
  const r = await kino.fetch(BASE + "/", {
    headers: { Accept: "text/html", Referer: BASE + "/" },
    timeoutMs: 15000,
  });
  if (!r.ok) return cachedToken || {};
  const html = await r.text();
  const g = {};
  const re = /(_[a-z0-9]+)="([0-9a-f]{24})"/g;
  let m;
  while ((m = re.exec(html)) !== null) g[m[1]] = m[2];
  cachedToken = g;
  cachedTokenAt = now;
  return g;
}

async function decryptPagesPayload(json) {
  // json: full API body { status, data, ls, lh } or just data array if already plain
  let pages = Array.isArray(json) ? json : json.data || json.pages || [];
  const ls = json && json.ls;
  if (!ls || !Array.isArray(pages) || !pages.length) {
    return pages;
  }
  const tok = qseed(ls);
  if (!tok) return pages;
  const globals = await fetchPageToken();
  const yv = Ytoken(tok.p, globals);
  if (yv == null) {
    kino.log("decrypt", "sin token de página");
    return pages;
  }
  const seed = (tok.v ^ yv) >>> 0;
  const out = [];
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const copy = Object.assign({}, p);
    if (typeof p.ph === "string" && p.ph.length) {
      const url = decodePh(p.ph, seed, i, p.id);
      if (url) {
        copy.imageUrl = url;
        delete copy.ph;
      }
    }
    out.push(copy);
  }
  // lh: filtra páginas señuelo (ee) — y(lh) índices a quitar
  // opcional; si falla, devolvemos todas
  return out;
}

// ===================== Red =====================

async function api(path, timeoutMs) {
  const r = await kino.fetch(BASE + path, {
    headers: { Accept: "application/json", Referer: BASE + "/" },
    timeoutMs: timeoutMs || 20000,
  });
  if (!r.ok) {
    throw kino.error("unavailable", "HTTP " + r.status + " " + path, {
      userMessage: "Capibara no respondió (" + r.status + ").",
    });
  }
  const text = await r.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch (e) {
    throw kino.error("unavailable", "JSON inválido", {
      userMessage: "Respuesta inválida de Capibara.",
    });
  }
  if (j && j.status === false) {
    throw kino.error("unavailable", j.message || "API error", {
      userMessage: j.message || "Capibara rechazó la petición.",
    });
  }
  return j;
}

function clean(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isNovelType(t) {
  const s = String(t || "").toLowerCase();
  return s.indexOf("novel") !== -1 || s === "novela" || s === "novela_ligera";
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

function workRef(item) {
  if (item.id && String(item.id).indexOf("joint-") === 0) {
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
      if (String(item.url).indexOf("/joint/") !== -1) return "joint:" + m[3];
      const org = m[1] || m[2] || "";
      const kind = String(item.url).indexOf("novel") !== -1 ? "novel" : "manga";
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
  if (ref.indexOf("video:") === 0) return { kind: "video", youtubeId: ref.slice(6) };
  if (ref.indexOf("joint:") === 0) return { kind: "joint", slug: ref.slice(6) };
  if (ref.indexOf("work:") === 0) {
    const parts = ref.slice(5).split(":");
    return { kind: "work", type: parts[0], org: parts[1] || "", slug: parts[2] || parts[1] };
  }
  if (ref.indexOf("slug:") === 0) return { kind: "slug", slug: ref.slice(5) };
  if (ref.indexOf("ch:") === 0) {
    const rest = ref.slice(3);
    if (rest.indexOf("joint:") === 0) {
      const p = rest.slice(6).split(":");
      return { kind: "chapter", joint: true, slug: p[0], number: p.slice(1).join(":") };
    }
    const p = rest.split(":");
    return {
      kind: "chapter",
      joint: false,
      type: p[0],
      org: p[1],
      slug: p[2],
      number: p.slice(3).join(":"),
    };
  }
  if (ref.indexOf("id:") === 0) return { kind: "id", id: ref.slice(3) };
  return { kind: "raw", ref: ref };
}

function itemFromWork(w, forceKind) {
  const typeCode =
    (w.manga && w.manga.bookType && w.manga.bookType.code) || w.workType || w.type || "";
  const novel = forceKind === "novel" || isNovelType(typeCode);
  const ref = workRef(w);
  return {
    id: String(w.id || w.mangaId || ref).replace(/[^A-Za-z0-9._~-]/g, "_").slice(0, 128),
    ref: ref,
    title: titleOf(w).slice(0, 200),
    kind: "series",
    poster: posterOf(w),
    overview: clean(
      w.shortDescription ||
        w.description ||
        (w.manga && (w.manga.shortDescription || w.manga.description)) ||
        ""
    ).slice(0, 400),
    badges: novel ? ["Novela"] : typeCode && typeCode !== "manga" ? [String(typeCode).slice(0, 20)] : undefined,
    adult: !!(w.isNSFW || (w.manga && w.manga.isNSFW)),
  };
}

function itemFromVideo(v) {
  const workTitle = v.work && v.work.title ? " · " + v.work.title : "";
  return {
    id: ("yt-" + (v.youtubeId || v.id)).slice(0, 128),
    ref: videoRef(v),
    title: (clean(v.title || "Vídeo") + workTitle).slice(0, 200),
    kind: "movie",
    poster: v.thumbnailUrl || (v.work && v.work.cover) || "",
    overview: v.work
      ? clean((v.work.title || "") + (v.chapterNumber != null ? " · Cap. " + v.chapterNumber : ""))
      : "",
    badges: ["Vídeo"],
  };
}

function itemFromSearchObra(o) {
  const novel = isNovelType(o.type);
  return {
    id: String(o.id).replace(/[^A-Za-z0-9._~-]/g, "_").slice(0, 128),
    ref: workRef(o),
    title: titleOf(o).slice(0, 200),
    kind: "series",
    poster: posterOf(o),
    badges: novel ? ["Novela"] : o.type && o.type !== "manga" ? [String(o.type).slice(0, 20)] : undefined,
  };
}

function logErr(where, e) {
  try {
    kino.log(where, (e && (e.message || e.code || String(e))) || "error");
  } catch (_) {}
}

// ===================== home / browse / search =====================

export async function home() {
  const rows = [];

  try {
    const vids = (await api("/api/videos?limit=18&page=1")).data;
    const items = (vids.items || [])
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
  }

  try {
    const feat = (await api("/api/landing/featured-manga?limit=18&page=1&nsfw=false&sort=daily&mix=1"))
      .data;
    const list = Array.isArray(feat) ? feat : (feat && feat.items) || [];
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
  }

  try {
    const tr = (await api("/api/landing/trending?limit=18&nsfw=false")).data;
    const list = Array.isArray(tr) ? tr : (tr && tr.items) || [];
    const items = list.map(function (w) {
      return itemFromWork(w);
    });
    if (items.length) {
      rows.push({ id: "trending", title: "Tendencias", items: items, ref: "browse:trending", genre: "anime" });
    }
  } catch (e) {
    logErr("home.trending", e);
  }

  try {
    const mc = (await api("/api/manga-custom?order=latest&limit=24&page=1&nsfw=false")).data;
    const mangas = (mc.items || []).filter(function (w) {
      const code = (w.manga && w.manga.bookType && w.manga.bookType.code) || "";
      return !isNovelType(code);
    });
    const novels = (mc.items || []).filter(function (w) {
      const code = (w.manga && w.manga.bookType && w.manga.bookType.code) || "";
      return isNovelType(code);
    });
    if (mangas.length) {
      rows.push({
        id: "latest-manga",
        title: "Mangas recientes",
        items: mangas.map(function (w) {
          return itemFromWork(w, "manga");
        }),
        ref: "browse:manga-latest",
        genre: "anime",
      });
    }
    if (novels.length) {
      rows.push({
        id: "novels",
        title: "Novelas",
        items: novels.map(function (w) {
          return itemFromWork(w, "novel");
        }),
        ref: "browse:novels",
        genre: "series",
      });
    }
  } catch (e) {
    logErr("home.manga-custom", e);
  }

  if (!rows.length) {
    throw kino.error("unavailable", "home vacío", {
      userMessage:
        "No se pudo cargar Capibara. Aprueba el host capibaratraductor.com e inténtalo de nuevo.",
    });
  }
  return rows;
}

export async function browse(ref, cursor) {
  const page = cursor ? parseInt(cursor, 10) || 1 : 1;
  const limit = 24;

  if (ref === "browse:videos") {
    const data = (await api("/api/videos?limit=" + limit + "&page=" + page)).data;
    const items = (data.items || [])
      .filter(function (v) {
        return v.youtubeId;
      })
      .map(itemFromVideo);
    return { items: items, next: page < (data.maxPage || 1) ? String(page + 1) : undefined };
  }

  if (ref === "browse:manga-popular" || ref === "browse:manga-latest") {
    const order = ref === "browse:manga-popular" ? "popular" : "latest";
    const data = (
      await api("/api/manga-custom?order=" + order + "&limit=" + limit + "&page=" + page + "&nsfw=false")
    ).data;
    const items = (data.items || [])
      .filter(function (w) {
        const code = (w.manga && w.manga.bookType && w.manga.bookType.code) || "";
        return !isNovelType(code);
      })
      .map(function (w) {
        return itemFromWork(w, "manga");
      });
    return { items: items, next: page < (data.maxPage || 1) ? String(page + 1) : undefined };
  }

  if (ref === "browse:novels") {
    const data = (
      await api("/api/manga-custom?order=latest&limit=" + limit + "&page=" + page + "&nsfw=false")
    ).data;
    const items = (data.items || [])
      .filter(function (w) {
        const code = (w.manga && w.manga.bookType && w.manga.bookType.code) || "";
        return isNovelType(code);
      })
      .map(function (w) {
        return itemFromWork(w, "novel");
      });
    return { items: items, next: page < (data.maxPage || 1) ? String(page + 1) : undefined };
  }

  if (ref === "browse:trending") {
    const data = (await api("/api/landing/trending?limit=" + limit + "&nsfw=false")).data;
    const list = Array.isArray(data) ? data : (data && data.items) || [];
    return {
      items: list.map(function (w) {
        return itemFromWork(w);
      }),
    };
  }

  const feat = (
    await api(
      "/api/landing/featured-manga?limit=" + limit + "&page=" + page + "&nsfw=false&sort=daily&mix=1"
    )
  ).data;
  const list = Array.isArray(feat) ? feat : (feat && feat.items) || [];
  return {
    items: list.map(function (w) {
      return itemFromWork(w);
    }),
  };
}

export async function search(query) {
  const q = (query && query.q ? String(query.q) : "").trim();
  if (!q) return [];
  const data = (await api("/api/search?q=" + encodeURIComponent(q) + "&limit=40")).data;
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
      const vids = (await api("/api/videos?limit=30&page=1")).data;
      const ql = q.toLowerCase();
      const list = vids.items || [];
      for (let i = 0; i < list.length; i++) {
        const v = list[i];
        if (!v.youtubeId) continue;
        const t = ((v.title || "") + " " + ((v.work && v.work.title) || "")).toLowerCase();
        if (t.indexOf(ql) !== -1) out.push(itemFromVideo(v));
      }
    } catch (e) {
      logErr("search.videos", e);
    }
  }
  return out.slice(0, 50);
}

// ===================== episodes / resolve =====================

async function loadJoint(slug) {
  return (await api("/api/joint/" + encodeURIComponent(slug))).data;
}

export async function episodes(ref) {
  const p = parseRef(ref);
  if (!p) {
    throw kino.error("invalid_ref", "ref", { userMessage: "No se pudo abrir esta obra." });
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
      throw kino.error("unavailable", "obra", {
        userMessage: "No se pudo cargar la obra (prueba desde Inicio o búsqueda de Capibara).",
      });
    }
  } else if (p.kind === "id") {
    data = await loadJoint(String(p.id));
    joint = true;
    slug = data.slug || String(p.id);
  } else {
    throw kino.error("invalid_ref", "tipo", { userMessage: "Tipo de título no soportado." });
  }

  const chapters = (data.chapters || [])
    .filter(function (c) {
      return !c.isUnreleased && !c.hiddenAt;
    })
    .sort(function (a, b) {
      return Number(a.number) - Number(b.number);
    });

  const episodesList = chapters.slice(-MAX_CAPS).map(function (c, idx) {
    const num = Number(c.number);
    const chRef = joint
      ? "ch:joint:" + slug + ":" + c.number
      : "ch:work:manga:" + (p.org || "") + ":" + slug + ":" + c.number;
    return {
      season: 1,
      number: Number.isFinite(num) ? Math.max(1, Math.round(num)) : idx + 1,
      ref: chRef,
      title: clean(c.title || "Cap. " + c.number).slice(0, 200),
      airDate: c.releasedAt ? String(c.releasedAt).slice(0, 10) : undefined,
    };
  });

  return {
    series: {
      title: titleOf(data),
      poster: posterOf(data),
      overview: clean(data.shortDescription || data.description || "").slice(0, 600),
    },
    episodes: episodesList,
  };
}

async function loadChapterImages(slug, number, joint) {
  const path = joint
    ? "/api/joint/" + encodeURIComponent(slug) + "/chapter/" + encodeURIComponent(number) + "/pages"
    : "/api/manga-custom/" +
      encodeURIComponent(slug) +
      "/chapter/" +
      encodeURIComponent(number) +
      "/pages";
  const body = await api(path);
  // body has status, data, ls, lh at top level from api() which returns full j... wait
  // our api() returns j (full) when we need ls - fix: return full object
  return body;
}

// Override: api already returns full json when we need it — adjust loadChapterImages callers

export async function resolve(ref) {
  const p = parseRef(ref);
  if (!p) {
    throw kino.error("invalid_ref", "ref", { userMessage: "No se puede reproducir." });
  }

  if (p.kind === "video") {
    const id = p.youtubeId;
    if (!id) {
      throw kino.error("unavailable", "yt", { userMessage: "Vídeo sin ID de YouTube." });
    }
    // Kino no reproduce text/html; intentamos URL directa de YouTube omitiendo mime
    // (detección por URL). Si falla en el aparato, el usuario verá error de formato.
    return {
      url: "https://www.youtube.com/watch?v=" + id,
      label: "YouTube",
      alternatives: [
        { url: "https://youtu.be/" + id, label: "youtu.be" },
        { url: "https://www.youtube.com/embed/" + id, label: "Embed" },
      ],
    };
  }

  if (p.kind === "chapter") {
    // Abrir lector de pantalla en vez del player de vídeo
    throw kino.error("unavailable", "usa-pantalla", {
      userMessage:
        "Abre Capibara desde el menú de plugins y elige el manga/capítulo ahí para leer las páginas. El reproductor de vídeo no sirve para manga.",
    });
  }

  if (p.kind === "joint" || p.kind === "work" || p.kind === "slug") {
    const ep = await episodes(ref);
    if (ep.episodes && ep.episodes.length) {
      return resolve(ep.episodes[0].ref);
    }
    throw kino.error("unavailable", "sin caps", { userMessage: "Sin capítulos publicados." });
  }

  throw kino.error("invalid_ref", ref, { userMessage: "No se puede resolver este título." });
}

// ===================== Pantalla: catálogo + lector =====================

function storageGet(key, fallback) {
  try {
    const v = kino.storage.get(key);
    return v ? JSON.parse(v) : fallback;
  } catch (_) {
    return fallback;
  }
}

function storageSet(key, val) {
  try {
    kino.storage.set(key, JSON.stringify(val));
  } catch (_) {}
}

export async function screen({ state, route, lang }) {
  const st = state || {};
  const name = (route && route.name) || "main";

  if (name === "reader") {
    const pages = st.pages || [];
    const title = st.readerTitle || "Capítulo";
    const children = [];
    children.push({
      type: "Text",
      text: title,
      style: "h3",
      color: "primary",
    });
    if (st.readerError) {
      children.push({ type: "Text", text: st.readerError, color: "error" });
    }
    if (st.readerLoading) {
      children.push({ type: "Text", text: lang === "en" ? "Loading pages…" : "Cargando páginas…" });
      children.push({ type: "Skeleton", height: 200 });
      children.push({ type: "Skeleton", height: 200 });
    }
    for (let i = 0; i < pages.length; i++) {
      const url = pages[i];
      if (!url) continue;
      children.push({
        type: "Image",
        url: url,
        fit: "contain",
        width: "expand",
      });
    }
    if (!st.readerLoading && pages.length) {
      children.push({
        type: "Row",
        gap: 8,
        children: [
          {
            type: "ElevatedButton",
            labelText: "Cap. anterior",
            labelTextEn: "Previous",
            onPressed: "readerPrev",
            enabled: !!st.prevCh,
          },
          {
            type: "ElevatedButton",
            labelText: "Cap. siguiente",
            labelTextEn: "Next",
            onPressed: "readerNext",
            enabled: !!st.nextCh,
          },
        ],
      });
    }
    return {
      type: "Scaffold",
      appBar: {
        type: "AppBar",
        mergeWithKinoBar: true,
        dense: true,
        title: title.slice(0, 40),
        leading: {
          type: "IconButton",
          icon: "arrow_back",
          labelText: "Volver",
          labelTextEn: "Back",
          onPressed: { pop: true },
        },
      },
      body: {
        type: "SingleChildScrollView",
        padding: { compact: 8, expanded: 16 },
        children: children,
      },
    };
  }

  // main: home inside screen
  const children = [];
  children.push({
    type: "Text",
    text: "Capibara Traductor",
    style: "h2",
  });
  children.push({
    type: "Text",
    text:
      lang === "en"
        ? "Mangas, novels and video-mangas. Open a title, then a chapter to read pages."
        : "Mangas, novelas y videomangas. Abre un título y luego un capítulo para leer las páginas.",
    style: "body",
  });
  children.push({
    type: "TextField",
    key: "q",
    labelText: "Buscar",
    labelTextEn: "Search",
    onSubmitted: "doSearch",
  });
  children.push({
    type: "ElevatedButton",
    labelText: "Buscar",
    labelTextEn: "Search",
    onPressed: "doSearch",
  });

  if (st.searchLoading) {
    children.push({ type: "Text", text: "Buscando…" });
  }
  if (st.searchError) {
    children.push({ type: "Text", text: st.searchError, color: "error" });
  }

  const sections = st.sections || [];
  for (let s = 0; s < sections.length; s++) {
    const sec = sections[s];
    children.push({ type: "Text", text: sec.title, style: "h3", color: "primary" });
    const row = [];
    const items = sec.items || [];
    for (let i = 0; i < items.length && i < 24; i++) {
      const it = items[i];
      row.push({
        type: "PosterCard",
        title: it.title,
        imageUrl: it.poster || undefined,
        onTap: "openWork",
        arg: it.ref,
      });
    }
    if (row.length) {
      children.push({
        type: "SingleChildScrollView",
        scrollDirection: "horizontal",
        children: [{ type: "Row", gap: 8, children: row }],
      });
    }
  }

  if (st.workTitle) {
    children.push({ type: "Divider" });
    children.push({ type: "Text", text: st.workTitle, style: "h3" });
    if (st.workOverview) {
      children.push({ type: "Text", text: st.workOverview.slice(0, 500), style: "body" });
    }
    const chs = st.chapters || [];
    const list = [];
    for (let i = 0; i < chs.length && i < 80; i++) {
      const c = chs[i];
      list.push({
        type: "ListTile",
        title: c.title,
        onTap: "openChapter",
        arg: JSON.stringify({
          ref: c.ref,
          title: c.title,
          slug: st.workSlug,
          joint: st.workJoint,
          number: c.number,
          all: chs.map(function (x) {
            return { ref: x.ref, number: x.number, title: x.title };
          }),
        }),
      });
    }
    if (list.length) {
      children.push({ type: "Column", children: list });
    } else if (st.workLoading) {
      children.push({ type: "Text", text: "Cargando capítulos…" });
    }
  }

  return {
    type: "Scaffold",
    appBar: {
      type: "AppBar",
      mergeWithKinoBar: true,
      dense: true,
      title: "Capibara",
      leading: {
        type: "IconButton",
        icon: "close",
        labelText: "Cerrar",
        labelTextEn: "Close",
        onPressed: { close: true },
      },
      actions: [
        {
          type: "IconButton",
          icon: "refresh",
          labelText: "Actualizar",
          labelTextEn: "Refresh",
          onPressed: "reloadHome",
        },
      ],
    },
    body: {
      type: "SingleChildScrollView",
      padding: { compact: 12, expanded: 24 },
      children: children,
    },
  };
}

export async function screenEvent({ name, arg, state, lang }) {
  const st = state || {};

  if (name === "open" || name === "reloadHome") {
    try {
      const rows = await home();
      const sections = rows.map(function (r) {
        return {
          title: r.title,
          items: (r.items || []).map(function (it) {
            return { title: it.title, poster: it.poster, ref: it.ref, kind: it.kind };
          }),
        };
      });
      return { state: { sections: sections, searchError: null } };
    } catch (e) {
      return {
        state: {
          sections: [],
          searchError: (e && e.userMessage) || (e && e.message) || "Error al cargar",
        },
      };
    }
  }

  if (name === "doSearch") {
    const q = String((st.inputs && st.inputs.q) || "").trim();
    if (!q) return { toast: lang === "en" ? "Type something" : "Escribe algo" };
    try {
      const items = await search({ q: q });
      return {
        state: {
          sections: [
            {
              title: (lang === "en" ? "Results: " : "Resultados: ") + q,
              items: items.map(function (it) {
                return { title: it.title, poster: it.poster, ref: it.ref, kind: it.kind };
              }),
            },
          ],
          workTitle: null,
          chapters: [],
        },
      };
    } catch (e) {
      return { state: { searchError: (e && e.message) || "Error de búsqueda" } };
    }
  }

  if (name === "openWork") {
    const ref = String(arg || "");
    const p = parseRef(ref);
    if (p && p.kind === "video") {
      return {
        toast:
          lang === "en"
            ? "Videos play from Kino Home / search (YouTube)."
            : "Los vídeos se abren desde el Inicio de Kino (YouTube).",
      };
    }
    try {
      const ep = await episodes(ref);
      const chapters = (ep.episodes || []).map(function (c) {
        return {
          title: c.title || "Cap. " + c.number,
          number: c.number,
          ref: c.ref,
        };
      });
      // newest first for UI
      chapters.reverse();
      const parsed = parseRef(ref);
      return {
        state: {
          workTitle: (ep.series && ep.series.title) || ref,
          workOverview: (ep.series && ep.series.overview) || "",
          workSlug: (parsed && parsed.slug) || "",
          workJoint: !!(parsed && (parsed.kind === "joint" || parsed.kind === "work")),
          workRef: ref,
          chapters: chapters,
          workLoading: false,
        },
      };
    } catch (e) {
      return {
        toast: (e && e.userMessage) || (e && e.message) || "No se pudo abrir",
      };
    }
  }

  if (name === "openChapter") {
    let payload = {};
    try {
      payload = typeof arg === "string" ? JSON.parse(arg) : arg || {};
    } catch (_) {
      payload = { ref: String(arg) };
    }
    const p = parseRef(payload.ref || "");
    if (!p || p.kind !== "chapter") {
      return { toast: "Capítulo inválido" };
    }
    const baseState = {
      readerTitle: payload.title || "Cap. " + p.number,
      readerLoading: true,
      readerError: null,
      pages: [],
      readerSlug: p.slug,
      readerJoint: !!p.joint,
      readerNumber: p.number,
      readerAll: payload.all || [],
      prevCh: null,
      nextCh: null,
    };
    const loaded = await loadReaderPages(baseState);
    return {
      route: { push: "reader", params: {} },
      state: loaded.state || baseState,
    };
  }

  if (name === "readerPrev" || name === "readerNext") {
    const all = st.readerAll || [];
    // all is newest-first in our UI; find current index
    let idx = -1;
    for (let i = 0; i < all.length; i++) {
      if (String(all[i].number) === String(st.readerNumber)) {
        idx = i;
        break;
      }
    }
    const nextIdx = name === "readerPrev" ? idx + 1 : idx - 1;
    if (nextIdx < 0 || nextIdx >= all.length) {
      return { toast: lang === "en" ? "No more chapters" : "No hay más capítulos" };
    }
    const ch = all[nextIdx];
    const p = parseRef(ch.ref);
    const newState = Object.assign({}, st, {
      readerTitle: ch.title,
      readerLoading: true,
      pages: [],
      readerNumber: p ? p.number : ch.number,
      readerError: null,
    });
    return await loadReaderPages(newState);
  }

  return null;
}

function routeNameIsReader(state) {
  return !!(state && state.readerSlug);
}

async function loadReaderPages(st) {
  try {
    const path = st.readerJoint
      ? "/api/joint/" +
        encodeURIComponent(st.readerSlug) +
        "/chapter/" +
        encodeURIComponent(st.readerNumber) +
        "/pages"
      : "/api/manga-custom/" +
        encodeURIComponent(st.readerSlug) +
        "/chapter/" +
        encodeURIComponent(st.readerNumber) +
        "/pages";
    const body = await api(path);
    // api returns full JSON including data, ls, lh
    const pagesRaw = await decryptPagesPayload(body);
    const urls = [];
    for (let i = 0; i < pagesRaw.length; i++) {
      const u = pagesRaw[i].imageUrl;
      if (u && urls.indexOf(u) === -1) urls.push(u);
    }
    // prev/next from all list (newest first)
    const all = st.readerAll || [];
    let idx = -1;
    for (let i = 0; i < all.length; i++) {
      if (String(all[i].number) === String(st.readerNumber)) {
        idx = i;
        break;
      }
    }
    return {
      state: {
        readerLoading: false,
        pages: urls,
        readerError: urls.length ? null : "No se pudieron descifrar las páginas.",
        prevCh: idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null,
        nextCh: idx > 0 ? all[idx - 1] : null,
        readerTitle: st.readerTitle,
        readerSlug: st.readerSlug,
        readerJoint: st.readerJoint,
        readerNumber: st.readerNumber,
        readerAll: all,
      },
    };
  } catch (e) {
    return {
      state: {
        readerLoading: false,
        pages: [],
        readerError: (e && e.userMessage) || (e && e.message) || "Error al cargar páginas",
        readerTitle: st.readerTitle,
        readerSlug: st.readerSlug,
        readerJoint: st.readerJoint,
        readerNumber: st.readerNumber,
        readerAll: st.readerAll || [],
      },
    };
  }
}
