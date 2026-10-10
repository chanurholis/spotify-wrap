import { cacheLife } from "next/cache";
import type { NextRequest } from "next/server";

export type Result = { id: number; artist: string; title: string; thumb: string; art: string };

type ItunesItem = {
  collectionId: number;
  trackId?: number;
  artistName: string;
  collectionName: string;
  trackName?: string;
  artworkUrl100?: string;
};

const proxied = (url: string, size: number) =>
  `/api/art?url=${encodeURIComponent(url.replace("100x100bb", `${size}x${size}bb`))}`;

async function searchItunes(q: string, type: "album" | "song"): Promise<Result[]> {
  "use cache";
  cacheLife("days"); // iTunes allows ~20 req/min per IP, so repeated queries must not hit it

  const res = await fetch(
    `https://itunes.apple.com/search?country=ID&limit=24&entity=${type}&term=${encodeURIComponent(q)}`,
  );
  if (!res.ok) throw new Error(`iTunes ${res.status}`);
  const { results } = (await res.json()) as { results: ItunesItem[] };
  return results
    .filter((x) => x.artworkUrl100)
    .map((x) => ({
      id: type === "song" ? x.trackId! : x.collectionId,
      artist: x.artistName,
      title: type === "song" ? x.trackName! : x.collectionName,
      thumb: proxied(x.artworkUrl100!, 200),
      art: proxied(x.artworkUrl100!, 600),
    }));
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase().slice(0, 100);
  const type = req.nextUrl.searchParams.get("type") === "song" ? "song" : "album";
  if (!q) return Response.json([]);
  try {
    return Response.json(await searchItunes(q, type));
  } catch {
    return Response.json({ error: "Pencarian gagal, coba lagi sebentar." }, { status: 502 });
  }
}
