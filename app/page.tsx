"use client";

import { useEffect, useRef, useState } from "react";
import type { Result } from "./api/search/route";

type Tile = { artist: string; title: string; art: string } | null;
type Kind = "album" | "song";

const MAX = 10;
const TILE_PX = 300; // per tile in the exported PNG
const STORE_KEY = "wrap:v1";

const thisMonth = () => new Date().toISOString().slice(0, 7);

function loadImg(src: string) {
  return new Promise<HTMLImageElement | null>((ok) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = src;
  });
}

function fit(ctx: CanvasRenderingContext2D, text: string, width: number) {
  if (ctx.measureText(text).width <= width) return text;
  while (text && ctx.measureText(text + "…").width > width) text = text.slice(0, -1);
  return text + "…";
}

export default function Home() {
  const [cols, setCols] = useState(3);
  const [rows, setRows] = useState(3);
  const [labels, setLabels] = useState(false);
  const [month, setMonth] = useState("");
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [sel, setSel] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("album");
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const n = cols * rows;
  const visible: Tile[] = Array.from({ length: n }, (_, i) => tiles[i] ?? null);
  const filled = visible.filter(Boolean).length;

  // Restore / persist the grid so a refresh doesn't lose work.
  useEffect(() => {
    let saved = "";
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
      if (s) {
        setCols(s.cols); setRows(s.rows); setLabels(s.labels); setTiles(s.tiles);
        saved = s.month;
      }
    } catch {}
    // Date is client-only: cacheComponents forbids new Date() during prerender.
    setMonth(saved || thisMonth());
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ cols, rows, labels, tiles, month }));
    } catch {}
  }, [loaded, cols, rows, labels, tiles, month]);

  // Debounced search.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); setError(""); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true); setError("");
      try {
        const res = await fetch(`/api/search?type=${kind}&q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setResults(data);
        if (!data.length) setError("Tidak ditemukan. Coba kata kunci lain.");
      } catch (e) {
        if (!ctrl.signal.aborted) setError((e as Error).message || "Pencarian gagal.");
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 400);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, kind]);

  function setTile(i: number, tile: Tile) {
    const next = [...tiles];
    next[i] = tile;
    setTiles(next);
    return next;
  }

  function pick(r: Result) {
    const target = sel >= 0 && sel < n ? sel : visible.findIndex((t) => !t);
    if (target < 0) return setError("Grid penuh. Pilih tile yang mau diganti.");
    const next = setTile(target, { artist: r.artist, title: r.title, art: r.art });
    // Jump to the next empty tile so filling the grid is just click, click, click.
    setSel(Array.from({ length: n }, (_, i) => next[i]).findIndex((t, i) => i > target && !t));
  }

  function selectTile(i: number) {
    setSel(i);
    if (window.matchMedia("(max-width: 1023px)").matches) inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    inputRef.current?.focus({ preventScroll: true });
  }

  async function download() {
    setExporting(true);
    const canvas = document.createElement("canvas");
    canvas.width = cols * TILE_PX;
    canvas.height = rows * TILE_PX;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const imgs = await Promise.all(visible.map((t) => (t ? loadImg(t.art) : null)));
    visible.forEach((t, i) => {
      const x = (i % cols) * TILE_PX, y = Math.floor(i / cols) * TILE_PX;
      const img = imgs[i];
      if (img) ctx.drawImage(img, x, y, TILE_PX, TILE_PX);
      if (labels && t) {
        const g = ctx.createLinearGradient(0, y + TILE_PX - 80, 0, y + TILE_PX);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, "rgba(0,0,0,.85)");
        ctx.fillStyle = g;
        ctx.fillRect(x, y + TILE_PX - 80, TILE_PX, 80);
        ctx.fillStyle = "#fff";
        ctx.font = "600 17px system-ui, sans-serif";
        ctx.fillText(fit(ctx, t.title, TILE_PX - 24), x + 12, y + TILE_PX - 34);
        ctx.font = "15px system-ui, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,.75)";
        ctx.fillText(fit(ctx, t.artist, TILE_PX - 24), x + 12, y + TILE_PX - 13);
      }
    });
    canvas.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob!);
      a.download = `wrap-${month || "custom"}-${cols}x${rows}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
      setExporting(false);
    }, "image/png");
  }

  function clearAll() {
    if (filled && !confirm("Kosongkan semua tile?")) return;
    setTiles([]);
    setSel(0);
  }

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <section className="flex flex-col gap-4">
        <header>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Monthly Wrap</h1>
          <p className="text-sm text-zinc-400">Pilih tile, cari album atau lagu, lalu download sebagai satu gambar.</p>
        </header>

        <div className="grid grid-cols-2 gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 sm:flex sm:flex-wrap sm:items-end">
          <Stepper label="Kolom" value={cols} onChange={setCols} />
          <Stepper label="Baris" value={rows} onChange={setRows} />
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Bulan
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-10 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100 [color-scheme:dark]"
            />
          </label>
          <label className="flex h-10 cursor-pointer items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} className="size-4 accent-emerald-500" />
            Tampilkan judul
          </label>
        </div>

        <div
          className="grid w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {visible.map((t, i) => (
            <div key={i} className="@container group relative aspect-square">
              <button
                type="button"
                onClick={() => selectTile(i)}
                aria-label={t ? `Tile ${i + 1}: ${t.title} – ${t.artist}. Ganti` : `Tile ${i + 1} kosong. Isi`}
                aria-pressed={sel === i}
                className={`absolute inset-0 flex items-center justify-center outline-none transition ${
                  t ? "" : "border border-dashed border-zinc-700 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                } ${sel === i ? "z-10 ring-4 ring-inset ring-emerald-500" : "focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-zinc-300"}`}
              >
                {t ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.art} alt="" className="size-full object-cover" />
                ) : (
                  <span className="text-2xl leading-none">+</span>
                )}
                {labels && t && (
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-[4%] pb-[4%] pt-[12%] text-left leading-tight">
                    <span className="block truncate text-[clamp(6px,5.7cqw,17px)] font-semibold">{t.title}</span>
                    <span className="block truncate text-[clamp(6px,5cqw,15px)] text-white/75">{t.artist}</span>
                  </span>
                )}
              </button>
              {t && (
                <button
                  type="button"
                  onClick={() => setTile(i, null)}
                  aria-label={`Hapus tile ${i + 1}`}
                  className="absolute right-1 top-1 z-20 flex size-7 items-center justify-center rounded-full bg-black/70 text-sm text-white opacity-100 transition hover:bg-red-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-400">
            {filled}/{n} terisi
            {sel >= 0 && sel < n && <> · mengisi tile <b className="text-zinc-200">#{sel + 1}</b></>}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={clearAll} className="h-10 rounded-lg border border-zinc-700 px-4 text-sm hover:bg-zinc-800">
              Kosongkan
            </button>
            <button
              type="button"
              onClick={download}
              disabled={!filled || exporting}
              className="h-10 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {exporting ? "Menyiapkan…" : "Download PNG"}
            </button>
          </div>
        </div>
      </section>

      <aside className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)]">
        <div className="flex rounded-lg bg-zinc-950 p-1 text-sm" role="tablist" aria-label="Jenis pencarian">
          {(["album", "song"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={`h-9 flex-1 rounded-md transition ${kind === k ? "bg-zinc-800 font-semibold text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              {k === "album" ? "Album" : "Lagu"}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="q">Cari artwork</label>
        <input
          id="q"
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={kind === "album" ? "Cari album atau artis…" : "Cari lagu atau artis…"}
          autoComplete="off"
          className="h-11 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-base outline-none focus:border-emerald-500"
        />
        <p className="min-h-5 text-xs text-zinc-400" aria-live="polite">
          {searching ? "Mencari…" : error || (results.length ? "Klik artwork untuk memasukkan ke tile." : "Ketik minimal 2 huruf.")}
        </p>
        <ul className="grid grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 lg:grid-cols-3">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => pick(r)}
                title={`${r.title} – ${r.artist}`}
                className="w-full rounded-lg p-1 text-left outline-none transition hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.thumb} alt="" loading="lazy" className="aspect-square w-full rounded-md bg-zinc-800 object-cover" />
                <span className="mt-1 block truncate text-xs font-medium">{r.title}</span>
                <span className="block truncate text-[11px] text-zinc-400">{r.artist}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const btn = "flex size-10 items-center justify-center text-lg hover:bg-zinc-800 disabled:opacity-30";
  return (
    <div className="flex flex-col gap-1 text-xs text-zinc-400">
      {label}
      <div className="flex h-10 items-center overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 text-zinc-100">
        <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label={`Kurangi ${label}`}>−</button>
        <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">{value}</span>
        <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= MAX} aria-label={`Tambah ${label}`}>+</button>
      </div>
    </div>
  );
}
