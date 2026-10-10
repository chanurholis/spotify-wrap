# Monthly Wrap

Buat kolase artwork album/lagu (grid N×M) dan download sebagai satu PNG.

```bash
npm install
npm run dev   # http://localhost:3000
```

- `app/page.tsx` — UI grid, pencarian, export canvas. Grid tersimpan di localStorage.
- `app/api/search` — proxy iTunes Search API, di-cache server (`"use cache"`, 1 hari).
- `app/api/art` — proxy gambar dari `*.mzstatic.com`, `Cache-Control` 1 tahun (same-origin agar canvas bisa diexport).
