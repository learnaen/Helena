import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import seedMusic from "./seed-music.mjs";

const STORE_NAME = "helena-diary";
const MUSIC_KEY = "music-v1";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function authorized(req) {
  const expected = process.env.HELENA_ADMIN_PASSWORD;
  if (!expected) return false;
  return safeEqual(req.headers.get("x-admin-password"), expected);
}

function cleanUrl(value) {
  const url = String(value || "").trim().slice(0, 500);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    return parsed.toString();
  } catch {
    throw new Error("Link lagu tidak valid");
  }
}

function normalizeSong(input, existingId = null) {
  const artist = String(input?.artist || "").trim().slice(0, 100);
  const title = String(input?.title || "").trim().slice(0, 120);
  const vibe = String(input?.vibe || "").trim().slice(0, 100);
  const url = cleanUrl(input?.url);
  const suppliedId = String(input?.id || existingId || "").trim().slice(0, 120);

  if (!artist) throw new Error("Artist wajib diisi");
  if (!title) throw new Error("Judul lagu wajib diisi");

  const id = suppliedId || `song-${crypto.randomUUID().slice(0, 10)}`;
  return { id, artist, title, vibe, url };
}

async function loadMusic() {
  const store = getStore({ name: STORE_NAME, consistency: "strong" });
  const saved = await store.get(MUSIC_KEY, { type: "json" });
  const songs = Array.isArray(saved) ? saved : seedMusic;
  return songs.map((song, index) => ({ ...song, order: Number.isFinite(song.order) ? song.order : index }))
    .sort((a, b) => a.order - b.order);
}

async function saveMusic(songs) {
  const normalized = songs.map((song, index) => ({ ...song, order: index }));
  const store = getStore({ name: STORE_NAME, consistency: "strong" });
  await store.setJSON(MUSIC_KEY, normalized);
  return normalized;
}

export default async (req) => {
  try {
    if (req.method === "GET") {
      return json({ music: await loadMusic() });
    }

    if (!authorized(req)) {
      return json({ error: "Password admin salah atau belum diset." }, 401);
    }

    if (req.method === "POST") {
      const body = await req.json();

      if (body?.action === "verify") {
        return json({ ok: true });
      }

      if (body?.action === "reorder") {
        const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
        const songs = await loadMusic();
        if (ids.length !== songs.length || new Set(ids).size !== ids.length) {
          return json({ error: "Urutan lagu tidak valid." }, 400);
        }
        const map = new Map(songs.map(song => [song.id, song]));
        const ordered = ids.map(id => map.get(id)).filter(Boolean);
        if (ordered.length !== songs.length) return json({ error: "Lagu tidak cocok." }, 400);
        return json({ music: await saveMusic(ordered) });
      }

      const songs = await loadMusic();
      const song = normalizeSong(body);
      if (songs.some(s => s.id === song.id)) return json({ error: "ID lagu sudah ada." }, 409);
      songs.push({ ...song, order: songs.length });
      return json({ song, music: await saveMusic(songs) }, 201);
    }

    if (req.method === "PUT") {
      const body = await req.json();
      const id = String(body?.id || "").trim();
      if (!id) return json({ error: "ID lagu wajib ada." }, 400);

      const songs = await loadMusic();
      const index = songs.findIndex(s => s.id === id);
      if (index < 0) return json({ error: "Lagu tidak ditemukan." }, 404);

      const updated = normalizeSong(body, id);
      songs[index] = { ...updated, order: songs[index].order };
      return json({ song: updated, music: await saveMusic(songs) });
    }

    if (req.method === "DELETE") {
      const body = await req.json();
      const id = String(body?.id || "").trim();
      if (!id) return json({ error: "ID lagu wajib ada." }, 400);

      const songs = await loadMusic();
      const next = songs.filter(song => song.id !== id);
      if (next.length === songs.length) return json({ error: "Lagu tidak ditemukan." }, 404);

      return json({ ok: true, music: await saveMusic(next) });
    }

    return json({ error: "Method tidak didukung." }, 405);
  } catch (error) {
    console.error("music function error:", error);
    return json({ error: error?.message || "Server error." }, 500);
  }
};

export const config = {
  path: "/api/music"
};
