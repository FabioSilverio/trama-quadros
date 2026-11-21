import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { Parser } from "htmlparser2";

function publicAddress(address) {
  const ip = ipaddr.parse(address);
  return (
    ip.range() === "unicast" &&
    (ip.kind() === "ipv4" || ip.match(ipaddr.parse("2000::"), 3))
  );
}
function publicLookup(host, options, done) {
  // Pass the validated IP to the socket so a second DNS lookup cannot change the destination.
  lookup(host, { all: true, order: "ipv4first" })
    .then((records) => {
      if (!records.length || !records.every((r) => publicAddress(r.address)))
        throw Error("Non-public destination");
      if (options.all) done(null, records);
      else done(null, records[0].address, records[0].family);
    })
    .catch(done);
}
function getPage(url, signal) {
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    isIP(url.hostname) ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)
  )
    throw Error("Unsupported URL");
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        signal,
        lookup: publicLookup,
        agent: false,
        headers: {
          Accept: "text/html",
          "Accept-Encoding": "identity",
          "User-Agent": "Trama-LinkPreview/1.0",
        },
      },
      resolve,
    );
    req.on("error", reject);
  });
}
export async function pagePreview(raw) {
  let url = new URL(raw);
  const signal = AbortSignal.timeout(3400);
  for (let hops = 0; hops < 3; hops++) {
    const res = await getPage(url, signal);
    try {
      if (
        [301, 302, 303, 307, 308].includes(res.statusCode) &&
        res.headers.location
      ) {
        url = new URL(res.headers.location, url);
        continue;
      }
      if (
        res.statusCode !== 200 ||
        !/^text\/html\b/i.test(res.headers["content-type"] || "")
      )
        return {};
      const tags = new Map();
      let title = "",
        inTitle = false,
        end = false;
      const parser = new Parser({
        onopentag(name, attrs) {
          if (name === "title") inTitle = true;
          if (name === "body") end = true;
          if (name === "meta") {
            const key = (attrs.property || attrs.name || "").toLowerCase();
            if (attrs.content && !tags.has(key))
              tags.set(key, attrs.content.trim().slice(0, 1800));
          }
        },
        ontext(text) {
          if (inTitle) title = (title + text).slice(0, 400);
        },
        onclosetag(name) {
          if (name === "title") inTitle = false;
          if (name === "head") end = true;
        },
      });
      res.setEncoding("utf8");
      let read = 0;
      for await (const chunk of res) {
        read += chunk.length;
        parser.write(chunk);
        if (end || read >= 196608) break;
      }
      parser.end();
      const info = {
        title:
          tags.get("og:title") || tags.get("twitter:title") || title.trim(),
        description:
          tags.get("og:description") ||
          tags.get("description") ||
          tags.get("twitter:description"),
        author: tags.get("author") || tags.get("og:site_name"),
      };
      const image = tags.get("og:image") || tags.get("twitter:image");
      if (image) {
        try {
          const src = new URL(image, url);
          if (src.protocol === "https:" && !src.username && !src.password)
            info.image = src.href;
        } catch {}
      }
      return info;
    } finally {
      res.destroy();
    }
  }
  return {};
}
