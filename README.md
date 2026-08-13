# helena — Live Editor + Music Admin

Sekarang admin `?admin=1` punya 2 tab:

- **notes** — tambah/edit/hapus daily notes
- **music** — tambah/edit/hapus lagu + ubah urutan

## Password admin

Karena repo GitHub sebaiknya tidak menyimpan password mentah, set password di Netlify:

1. Netlify → Project configuration
2. Environment variables
3. Tambah:

```text
HELENA_ADMIN_PASSWORD
```

Value: isi password admin yang sudah kamu pilih langsung di Netlify UI. Jangan tulis nilainya di repo.

4. Save lalu lakukan 1 redeploy.

Clue login tetap: `ultah`.

## Admin URL

```text
https://NAMASITE.netlify.app/?admin=1
```

Klik `✎`, login, lalu pilih tab **notes** atau **music**.

### Music editor

Bisa mengubah:
- artist
- judul lagu
- vibe
- link Spotify / YouTube
- urutan card (↑ / ↓)

Perubahan tersimpan di Netlify Blobs dan langsung tampil ke visitor tanpa edit `data.js`.

## Penting saat update dari GitHub

Upload/replace file project ini di **root repo**:
- `index.html`
- `app.js`
- `styles.css`
- `package.json`
- `netlify.toml`
- `netlify/functions/...`

`@netlify/blobs` tetap dipin ke `10.7.9` agar build stabil.
