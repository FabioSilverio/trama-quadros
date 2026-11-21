import { parseLink } from "./links.js";

const FONT_STACK = '"DM Sans Variable", "Segoe UI", Arial, sans-serif';

export function readData(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function wrapParagraphs(context, text, width) {
  const paragraphs = String(text || "").split(/\r?\n/);
  const out = [];
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      if (out.length && out.at(-1) !== "") out.push("");
      continue;
    }
    let line = "";
    for (const word of trimmed.split(/\s+/)) {
      if (context.measureText(line + (line ? " " : "") + word).width > width && line) {
        out.push(line);
        line = "";
      }
      if (context.measureText(word).width > width) {
        for (const char of word) {
          if (context.measureText(line + char).width > width && line) {
            out.push(line);
            line = "";
          }
          line += char;
        }
      } else {
        line = line ? line + " " + word : word;
      }
    }
    if (line.trim()) out.push(line.trim());
  }
  while (out.length && out.at(-1) === "") out.pop();
  return out;
}

function wrap(context, text, width) {
  const out = [];
  let line = "";
  for (const word of String(text || "").split(/\s+/)) {
    if (context.measureText(line + " " + word).width > width && line) {
      out.push(line);
      line = "";
    }
    for (const char of word) {
      if (context.measureText(line + char).width > width && line) {
        out.push(line);
        line = "";
      }
      line += char;
    }
    line += " ";
  }
  if (line.trim()) out.push(line.trim());
  return out;
}

async function coverImage(url) {
  if (!url || !/^https:\/\//i.test(url)) return null;
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(3800),
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!r.ok) return null;
    return await createImageBitmap(await r.blob());
  } catch {
    return null;
  }
}

function surface(w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w * 2);
  canvas.height = Math.ceil(h * 2);
  const c = canvas.getContext("2d");
  c.scale(2, 2);
  return { canvas, c };
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d
    .toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
    .replace(/ de /g, " ")
    .replace(/\.$/, "");
}

function drawTramaBrand(c, rightX, centerY) {
  c.save();
  c.font = "600 12px " + FONT_STACK;
  c.fillStyle = "#9d89ee";
  c.textAlign = "right";
  c.textBaseline = "middle";
  c.fillText("trama", rightX, centerY);
  const textW = c.measureText("trama").width;
  const dx = rightX - textW - 9;
  c.translate(dx, centerY);
  c.rotate(Math.PI / 4);
  c.fillStyle = "#7c63e6";
  c.beginPath();
  c.roundRect(-3.2, -3.2, 6.4, 6.4, 1.4);
  c.fill();
  c.restore();
}

function drawMediaBox(c, image, x, y, boxW, boxH, { hasVideo, count }) {
  c.save();
  c.beginPath();
  c.roundRect(x, y, boxW, boxH, 12);
  c.fillStyle = "#0e0c14";
  c.fill();
  c.clip();

  // Preserve the entire image/video frame without cropping faces or text.
  const fit = Math.min(boxW / image.width, boxH / image.height);
  const dw = image.width * fit;
  const dh = image.height * fit;
  const dx = x + (boxW - dw) / 2;
  const dy = y + (boxH - dh) / 2;
  c.drawImage(image, dx, dy, dw, dh);

  if (hasVideo) {
    const cx = x + boxW / 2;
    const cy = y + boxH / 2;
    c.fillStyle = "rgba(18, 15, 28, 0.72)";
    c.beginPath();
    c.arc(cx, cy, 27, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "rgba(154, 132, 240, 0.92)";
    c.lineWidth = 2;
    c.stroke();

    c.fillStyle = "#ffffff";
    c.beginPath();
    c.moveTo(cx - 7, cy - 11);
    c.lineTo(cx + 12, cy);
    c.lineTo(cx - 7, cy + 11);
    c.closePath();
    c.fill();
  }

  if (hasVideo || count > 1) {
    const label = hasVideo
      ? count > 1
        ? `Vídeo · 1/${count}`
        : "Vídeo"
      : `1/${count}`;
    c.font = "600 11.5px " + FONT_STACK;
    const tw = c.measureText(label).width;
    const pw = tw + 16;
    const ph = 22;
    const px = x + 10;
    const py = y + boxH - ph - 10;
    c.fillStyle = "rgba(16, 14, 24, 0.78)";
    c.beginPath();
    c.roundRect(px, py, pw, ph, 7);
    c.fill();
    c.strokeStyle = "rgba(255, 255, 255, 0.14)";
    c.lineWidth = 1;
    c.stroke();
    c.fillStyle = "#f2eefb";
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText(label, px + 8, py + ph / 2 + 0.5);
  }
  c.restore();

  c.save();
  c.strokeStyle = "#332d44";
  c.lineWidth = 1;
  c.beginPath();
  c.roundRect(x + 0.5, y + 0.5, boxW - 1, boxH - 1, 12);
  c.stroke();
  c.restore();
}

export async function getReference(raw, oldTitle = "") {
  const ref = parseLink(raw);
  if (!ref) throw Error("Cole um link http ou https válido.");
  if (ref.kind === "media") return ref;
  const query = new URLSearchParams({ url: ref.url });
  if (ref.kind === "x") {
    query.set("v", "3");
    const linked = oldTitle.match(/https:\/\/t\.co\/[a-z0-9]+/i)?.[0];
    if (linked) query.set("linked", linked);
  }
  try {
    const r = await fetch("/api/preview?" + query, {
      signal: AbortSignal.timeout(5300),
    });
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data.media) && ref.kind === "x") ref.media = data.media;
      for (const k of [
        "title",
        "author",
        "handle",
        "avatar",
        "publishedAt",
        "description",
        "image",
      ])
        if (typeof data[k] === "string" && data[k]) ref[k] = data[k];
    }
  } catch {}
  return ref;
}

function renderTweetCard(ref, image, avatar) {
  const width = 410;
  const pad = 18;
  const innerW = width - pad * 2;
  const hasVideo = Boolean(ref.media?.some((m) => m.type === "video"));
  const mediaCount = ref.media?.length || (image ? 1 : 0);

  const cleanText = String(ref.title || "")
    .replace(
      image || mediaCount ? /(?:\s*https:\/\/t\.co\/[a-z0-9]+)+$/i : /$^/,
      "",
    )
    .trim();

  const { c: measure } = surface(10, 10);
  measure.font = "400 16px " + FONT_STACK;
  const bodyLines = cleanText
    ? wrapParagraphs(measure, cleanText, innerW).slice(0, 12)
    : [];

  const headerH = 42;
  const textGap = bodyLines.length ? 14 : 0;
  const textH = bodyLines.reduce((acc, l) => acc + (l ? 23 : 11), 0);
  const mediaGap = image ? 14 : 0;
  const rawMediaH = image
    ? Math.round(innerW * (image.height / image.width))
    : 0;
  const mediaH = image ? Math.min(Math.max(rawMediaH, 145), 500) : 0;
  const footerGap = 14;
  const footerH = 28;
  const height =
    pad +
    headerH +
    textGap +
    textH +
    mediaGap +
    mediaH +
    footerGap +
    footerH +
    12;

  const { canvas, c } = surface(width, height);

  // Dark Trama card shell
  c.fillStyle = "#181620";
  c.strokeStyle = "#342e45";
  c.lineWidth = 1.5;
  c.beginPath();
  c.roundRect(1, 1, width - 2, height - 2, 16);
  c.fill();
  c.stroke();

  // Subtle top violet accent hairline
  c.save();
  c.beginPath();
  c.roundRect(1, 1, width - 2, height - 2, 16);
  c.clip();
  const bar = c.createLinearGradient(0, 0, width, 0);
  bar.addColorStop(0, "#7c63e6");
  bar.addColorStop(0.55, "#9c84f5");
  bar.addColorStop(1, "#342e45");
  c.fillStyle = bar;
  c.fillRect(0, 0, width, 3);
  c.restore();

  // Author avatar (circle)
  const avX = pad;
  const avY = pad + 2;
  const avSize = 38;
  c.save();
  c.beginPath();
  c.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2);
  c.fillStyle = "#2b2440";
  c.fill();
  c.clip();
  if (avatar) {
    const r = Math.max(avSize / avatar.width, avSize / avatar.height);
    const sw = avSize / r;
    const sh = avSize / r;
    c.drawImage(
      avatar,
      (avatar.width - sw) / 2,
      (avatar.height - sh) / 2,
      sw,
      sh,
      avX,
      avY,
      avSize,
      avSize,
    );
  } else {
    const initial = (ref.author || ref.handle || "X").trim()[0]?.toUpperCase() || "X";
    c.fillStyle = "#d5c5ff";
    c.font = "700 16px " + FONT_STACK;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(initial, avX + avSize / 2, avY + avSize / 2 + 0.5);
  }
  c.restore();

  c.strokeStyle = "#3f3854";
  c.lineWidth = 1;
  c.beginPath();
  c.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2);
  c.stroke();

  // Author display name & @handle
  const nameX = avX + avSize + 11;
  const maxAuthorW = width - nameX - pad - 38;
  c.textAlign = "left";
  c.textBaseline = "top";
  c.fillStyle = "#f4f1fb";
  c.font = "700 15px " + FONT_STACK;
  c.fillText(ref.author || "Publicação no X", nameX, avY + 2, maxAuthorW);

  c.fillStyle = "#958da8";
  c.font = "400 13px " + FONT_STACK;
  c.fillText(
    ref.handle ? "@" + ref.handle : "x.com",
    nameX,
    avY + 21,
    maxAuthorW,
  );

  // X badge on top right
  const badgeX = width - pad - 28;
  const badgeY = avY + 4;
  c.fillStyle = "#242031";
  c.strokeStyle = "#3c3552";
  c.lineWidth = 1;
  c.beginPath();
  c.roundRect(badgeX, badgeY, 28, 28, 8);
  c.fill();
  c.stroke();
  c.fillStyle = "#f1edf9";
  c.font = "700 15px Arial, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText("𝕏", badgeX + 14, badgeY + 14.5);

  // Tweet body text
  let y = pad + headerH + textGap;
  if (bodyLines.length) {
    c.textAlign = "left";
    c.textBaseline = "top";
    c.fillStyle = "#eeebf7";
    c.font = "400 16px " + FONT_STACK;
    for (const line of bodyLines) {
      if (!line) {
        y += 11;
        continue;
      }
      c.fillText(line, pad, y, innerW);
      y += 23;
    }
  }

  // Uncropped media frame
  if (image) {
    y += mediaGap;
    drawMediaBox(c, image, pad, y, innerW, mediaH, {
      hasVideo,
      count: mediaCount,
    });
    y += mediaH;
  }

  // Footer divider + metadata + subtle Trama branding
  const divY = y + footerGap;
  c.strokeStyle = "#292437";
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(pad, divY);
  c.lineTo(width - pad, divY);
  c.stroke();

  const footY = divY + footerH / 2 + 3;
  const dateLabel = formatDate(ref.publishedAt);
  const metaText = dateLabel ? `${dateLabel} · x.com` : "x.com";
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.fillStyle = "#8d85a0";
  c.font = "400 12.5px " + FONT_STACK;
  c.fillText(metaText, pad, footY, innerW - 76);

  drawTramaBrand(c, width - pad, footY);

  return { width, height, canvas };
}

function renderGeneralDarkCard(ref, image) {
  const width = 410;
  const pad = 18;
  const innerW = width - pad * 2;
  const hasVideo =
    ref.kind === "youtube" ||
    ref.kind === "vimeo" ||
    Boolean(ref.media?.some((m) => m.type === "video"));
  const mediaCount = ref.media?.length || (image ? 1 : 0);

  const { c: measure } = surface(10, 10);
  measure.font = "700 18px " + FONT_STACK;
  const titleLines = wrap(measure, ref.title, innerW).slice(0, 4);
  measure.font = "400 14px " + FONT_STACK;
  const descLines = wrap(measure, ref.description, innerW).slice(0, 4);

  const headerH = 30;
  const mediaGap = image ? 12 : 0;
  const rawMediaH = image
    ? Math.round(innerW * (image.height / image.width))
    : 0;
  const mediaH = image ? Math.min(Math.max(rawMediaH, 145), 460) : 0;
  const titleGap = titleLines.length ? 14 : 0;
  const titleH = titleLines.length * 24;
  const descGap = descLines.length ? 8 : 0;
  const descH = descLines.length * 19;
  const footerGap = 14;
  const footerH = 28;

  const height =
    pad +
    headerH +
    mediaGap +
    mediaH +
    titleGap +
    titleH +
    descGap +
    descH +
    footerGap +
    footerH +
    10;

  const { canvas, c } = surface(width, height);

  const accent =
    {
      youtube: "#d9484f",
      substack: "#de7440",
      vimeo: "#3598bf",
      media: "#6951ca",
    }[ref.kind] || "#7c63e6";

  // Dark Trama card shell
  c.fillStyle = "#181620";
  c.strokeStyle = "#342e45";
  c.lineWidth = 1.5;
  c.beginPath();
  c.roundRect(1, 1, width - 2, height - 2, 16);
  c.fill();
  c.stroke();

  // Top subtle accent strip
  c.save();
  c.beginPath();
  c.roundRect(1, 1, width - 2, height - 2, 16);
  c.clip();
  c.fillStyle = accent;
  c.fillRect(0, 0, width, 3);
  c.restore();

  // Header
  const headY = pad + 2;
  c.fillStyle = accent;
  c.beginPath();
  c.roundRect(pad, headY, 24, 24, 7);
  c.fill();
  c.fillStyle = "#ffffff";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = "700 13px Arial, sans-serif";
  c.fillText(
    {
      youtube: "▶",
      substack: "≡",
      vimeo: "v",
      media: hasVideo ? "▶" : "▣",
    }[ref.kind] || "↗",
    pad + 12,
    headY + 12.5,
  );

  c.textAlign = "left";
  c.textBaseline = "middle";
  c.fillStyle = "#d5cfe2";
  c.font = "600 13.5px " + FONT_STACK;
  c.fillText(ref.source, pad + 33, headY + 12.5, innerW - 110);

  drawTramaBrand(c, width - pad, headY + 12.5);

  let y = pad + headerH;
  if (image) {
    y += mediaGap;
    drawMediaBox(c, image, pad, y, innerW, mediaH, {
      hasVideo,
      count: mediaCount,
    });
    y += mediaH;
  }

  if (titleLines.length) {
    y += titleGap;
    c.textAlign = "left";
    c.textBaseline = "top";
    c.fillStyle = "#f4f1fb";
    c.font = "700 18px " + FONT_STACK;
    for (const l of titleLines) {
      c.fillText(l, pad, y, innerW);
      y += 24;
    }
  }

  if (descLines.length) {
    y += descGap;
    c.fillStyle = "#b5aec5";
    c.font = "400 14px " + FONT_STACK;
    for (const l of descLines) {
      c.fillText(l, pad, y, innerW);
      y += 19;
    }
  }

  const divY = y + footerGap;
  c.strokeStyle = "#292437";
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(pad, divY);
  c.lineTo(width - pad, divY);
  c.stroke();

  const footY = divY + footerH / 2 + 2;
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.fillStyle = "#8d85a0";
  c.font = "400 12.5px " + FONT_STACK;
  c.fillText(ref.author || ref.host, pad, footY, innerW);

  return { width, height, canvas };
}

export async function linkCard(raw, oldTitle = "") {
  const ref = await getReference(raw, oldTitle);
  const [image, avatar] = await Promise.all([
    coverImage(ref.image),
    ref.kind === "x" ? coverImage(ref.avatar) : Promise.resolve(null),
  ]);
  try {
    const rendered =
      ref.kind === "x"
        ? renderTweetCard(ref, image, avatar)
        : renderGeneralDarkCard(ref, image);
    return {
      width: rendered.width,
      height: rendered.height,
      dataURL: rendered.canvas.toDataURL("image/png"),
      customData: { reference: ref },
      link: ref.url,
    };
  } finally {
    image?.close();
    avatar?.close();
  }
}

export const textDefaults = {
  text: "",
  family: "Georgia",
  size: 36,
  color: "#352e43",
  bold: false,
  italic: false,
};

async function fontName(spec) {
  if (!spec.fontData) return spec.family || "Georgia";
  if (!/^data:[^,]*;base64,[A-Za-z0-9+/=]+$/.test(spec.fontData))
    throw Error("Arquivo de fonte inválido.");
  const name = "Trama-" + spec.fontId;
  if (
    !document.fonts.check('16px "' + name + '"') ||
    ![...document.fonts].some((f) => f.family === name)
  ) {
    const face = new FontFace(name, "url(" + spec.fontData + ")");
    await face.load();
    document.fonts.add(face);
  }
  return name;
}

export async function lettering(spec) {
  if (typeof spec.text !== "string" || !spec.text.trim())
    throw Error("Digite o texto antes de inserir.");
  if (!Number.isFinite(spec.size) || spec.size < 8 || spec.size > 240)
    throw Error("Use um tamanho entre 8 e 240.");
  const family = await fontName(spec),
    font =
      (spec.italic ? "italic " : "") +
      (spec.bold ? "bold " : "") +
      spec.size +
      'px "' +
      family.replace(/["\\]/g, "") +
      '"';
  const { c: measure } = surface(5, 5);
  measure.font = font;
  const lines = spec.text
    .split(/\r?\n/)
    .flatMap((l) => (l ? wrap(measure, l, 1400) : [""]));
  const width = Math.max(
      20,
      Math.ceil(Math.max(...lines.map((l) => measure.measureText(l).width))) +
        16,
    ),
    height = Math.ceil(lines.length * spec.size * 1.35 + 12);
  if (height > 4000)
    throw Error("Divida este texto em dois blocos para manter a qualidade.");
  const { canvas, c } = surface(width, height);
  c.font = font;
  c.fillStyle = spec.color;
  c.textBaseline = "top";
  lines.forEach((l, i) => c.fillText(l, 8, 6 + i * spec.size * 1.35));
  return {
    width,
    height,
    // Excalidraw adapts SVG ink to the canvas theme. The embedded bitmap keeps custom fonts portable.
    dataURL:
      "data:image/svg+xml;base64," +
      btoa(
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}"><image width="${width}" height="${height}" xlink:href="${canvas.toDataURL("image/png")}"/></svg>`,
      ),
    mimeType: "image/svg+xml",
    customData: { lettering: spec },
  };
}
