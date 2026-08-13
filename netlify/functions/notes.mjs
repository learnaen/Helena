import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import seedNotes from "./seed-notes.mjs";

const STORE_NAME = "helena-diary";
const NOTES_KEY = "notes-v1";
const ALLOWED_CATEGORIES = new Set(["cute", "soft", "music", "random", "favorite"]);

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
  const expected = process.env.HELENA_ADMIN_PASSWORD || "181107";
  return safeEqual(req.headers.get("x-admin-password"), expected);
}

function normalizeNote(input, existingId = null) {
  const date = String(input?.date || "").slice(0, 10);
  const category = String(input?.category || "");
  const icon = String(input?.icon || "♡").slice(0, 8);
  const title = String(input?.title || "").trim().slice(0, 80);
  const text = String(input?.text || "").trim().slice(0, 1200);
  const suppliedId = String(input?.id || existingId || "").trim().slice(0, 120);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Tanggal tidak valid");
  if (!ALLOWED_CATEGORIES.has(category)) throw new Error("Kategori tidak valid");
  if (!title) throw new Error("Judul wajib diisi");
  if (!text) throw new Error("Isi note wajib diisi");

  const id = suppliedId || `${date}-${category}-${crypto.randomUUID().slice(0, 8)}`;
  return { id, date, category, icon, title, text };
}

async function loadNotes() {
  const store = getStore({ name: STORE_NAME, consistency: "strong" });
  const saved = await store.get(NOTES_KEY, { type: "json" });
  return Array.isArray(saved) ? saved : seedNotes;
}

async function saveNotes(notes) {
  const store = getStore({ name: STORE_NAME, consistency: "strong" });
  await store.setJSON(NOTES_KEY, notes);
}

export default async (req) => {
  try {
    if (req.method === "GET") {
      const notes = await loadNotes();
      return json({ notes });
    }

    if (!authorized(req)) {
      return json({ error: "Password admin salah atau belum diset." }, 401);
    }

    if (req.method === "POST") {
      const body = await req.json();

      if (body?.action === "verify") {
        return json({ ok: true });
      }

      const notes = await loadNotes();
      const note = normalizeNote(body);
      if (notes.some(n => n.id === note.id)) {
        return json({ error: "ID note sudah ada." }, 409);
      }
      notes.unshift(note);
      notes.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      await saveNotes(notes);
      return json({ note, notes }, 201);
    }

    if (req.method === "PUT") {
      const body = await req.json();
      const id = String(body?.id || "").trim();
      if (!id) return json({ error: "ID note wajib ada." }, 400);

      const notes = await loadNotes();
      const index = notes.findIndex(n => n.id === id);
      if (index < 0) return json({ error: "Note tidak ditemukan." }, 404);

      const updated = normalizeNote(body, id);
      updated.id = id;
      notes[index] = updated;
      notes.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      await saveNotes(notes);
      return json({ note: updated, notes });
    }

    if (req.method === "DELETE") {
      const body = await req.json();
      const id = String(body?.id || "").trim();
      if (!id) return json({ error: "ID note wajib ada." }, 400);

      const notes = await loadNotes();
      const next = notes.filter(n => n.id !== id);
      if (next.length === notes.length) return json({ error: "Note tidak ditemukan." }, 404);

      await saveNotes(next);
      return json({ ok: true, notes: next });
    }

    return json({ error: "Method tidak didukung." }, 405);
  } catch (error) {
    console.error("notes function error:", error);
    return json({ error: "Server error. Coba lagi sebentar." }, 500);
  }
};

export const config = {
  path: "/api/notes"
};
