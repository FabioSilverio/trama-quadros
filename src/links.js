export function parseLink(input) {
  let u;
  try {
    u = new URL(String(input).trim());
  } catch {
    return null;
  }
  if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
    return null;
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.)/, "");
  const parts = u.pathname.split("/").filter(Boolean);
  const common = {
    url: u.href,
    host,
    kind: "web",
    source: host,
    title: decodeTitle(parts.at(-1)) || host,
  };
  if (["youtube.com", "youtu.be", "youtube-nocookie.com"].includes(host)) {
    const id =
      host === "youtu.be"
        ? parts[0]
        : u.searchParams.get("v") ||
          (["embed", "shorts", "live"].includes(parts[0]) ? parts[1] : null);
    if (/^[\w-]{11}$/.test(id || ""))
      return {
        ...common,
        kind: "youtube",
        source: "YouTube",
        id,
        title: "Vídeo do YouTube",
        image: "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg",
        frame: "https://www.youtube.com/embed/" + id,
      };
  }
  if (["x.com", "twitter.com"].includes(host)) {
    const id = u.pathname.match(/\/status(?:es)?\/(\d+)/)?.[1];
    if (id)
      return {
        ...common,
        kind: "x",
        source: "X",
        id,
        title: "Publicação no X",
        frame:
          "https://platform.twitter.com/embed/Tweet.html?lang=pt&dnt=true&id=" +
          id,
      };
  }
  if (host === "substack.com" || host.endsWith(".substack.com"))
    return { ...common, kind: "substack", source: "Substack" };
  if (host === "vimeo.com" && /^\d+$/.test(parts.at(-1)))
    return {
      ...common,
      kind: "vimeo",
      source: "Vimeo",
      id: parts.at(-1),
      frame: "https://player.vimeo.com/video/" + parts.at(-1),
    };
  return common;
}
function decodeTitle(slug) {
  try {
    return decodeURIComponent(slug || "")
      .replace(/[-_]+/g, " ")
      .trim();
  } catch {
    return "";
  }
}
