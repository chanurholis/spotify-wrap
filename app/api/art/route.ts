import type { NextRequest } from "next/server";

// Same-origin image proxy: keeps the export canvas untainted and lets browser/CDN cache artwork for a year.
export async function GET(req: NextRequest) {
  let url: URL;
  try {
    url = new URL(req.nextUrl.searchParams.get("url") ?? "");
  } catch {
    return new Response("Bad url", { status: 400 });
  }
  // Only Apple's artwork CDN, so this can't be used as an open proxy.
  if (url.protocol !== "https:" || !url.hostname.endsWith(".mzstatic.com")) {
    return new Response("Forbidden host", { status: 403 });
  }

  const res = await fetch(url);
  if (!res.ok) return new Response("Not found", { status: 404 });
  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
