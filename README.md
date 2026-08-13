# helena — Live Editor Edition

Versi ini bisa **tambah, edit, dan hapus note langsung dari website**.

## Admin

Buka:

```text
https://NAMASITE.netlify.app/?admin=1
```

Klik tombol `✎`.

**Password default:**

```text
181107
```

Clue yang tampil di login:

```text
ultah
```

Password default diverifikasi di Netlify Function, bukan di JavaScript frontend.

### Kalau nanti mau ganti password tanpa edit code

Di Netlify tambahkan Environment Variable:

```text
HELENA_ADMIN_PASSWORD
```

Isi value dengan password baru lalu redeploy sekali.

Kalau variable itu ada, password Netlify akan menggantikan default `181107`.

## Cara pakai

- `+ note baru` → tambah note
- `edit` → ubah note
- `hapus` → hapus note
- save → langsung online untuk Len

Data note tersimpan di Netlify Blobs.

## URL biasa untuk Len

```text
https://NAMASITE.netlify.app/
```

Editor tidak tampil di URL biasa.

## Deploy

Paling stabil: GitHub → Netlify continuous deployment.

Project sudah berisi:
- Netlify Functions
- Netlify Blobs dependency
- noindex
- robots.txt
- security headers ringan
