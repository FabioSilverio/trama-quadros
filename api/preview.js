import { parseLink } from "../src/links.js";
function plain(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
export default async function handler(req, res) {
  const ref = parseLink(req.query.url);
  if (!ref || req.method !== "GET")
    return res.status(400).json({ error: "Link inválido" });
  let endpoint;
  if (ref.kind === "youtube")
    endpoint =
      "https://www.youtube.com/oembed?format=json&url=" +
      encodeURIComponent("https://www.youtube.com/watch?v=" + ref.id);
  if (ref.kind === "vimeo")
    endpoint =
      "https://vimeo.com/api/oembed.json?url=" +
      encodeURIComponent("https://vimeo.com/" + ref.id);
  if (ref.kind === "x")
    endpoint =
      "https://publish.x.com/oembed?omit_script=1&url=" +
      encodeURIComponent("https://twitter.com/i/status/" + ref.id);
  const slug = new URL(ref.url).pathname.match(/^\/p\/([\w-]+)\/?$/)?.[1];
  if (
    ref.kind === "substack" &&
    slug &&
    /^[a-z0-9-]+\.substack\.com$/.test(ref.host)
  )
    endpoint = "https://" + ref.host + "/api/v1/posts/" + slug;
  const info = {};
  if (endpoint)
    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(4500),
        redirect: "error",
      });
      if (response.ok) {
        const data = await response.json();
        if (ref.kind === "x") {
          info.author = data.author_name;
          info.title = plain(
            data.html?.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1],
          );
        } else {
          info.title = data.title;
          info.author =
            data.author_name ||
            data.publishedBylines?.map((a) => a.name).join(", ");
          info.description = plain(data.subtitle);
          info.image = data.thumbnail_url || data.cover_image;
        }
      }
    } catch {
      /* The original link is always usable. */
    }
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=21600, stale-while-revalidate=86400",
  );
  res.status(200).json(
    Object.fromEntries(
      Object.entries(info)
        .filter(([, v]) => typeof v === "string" && v)
        .map(([k, v]) => [k, v.slice(0, 1800)]),
    ),
  );
}
