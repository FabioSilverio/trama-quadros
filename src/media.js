import { parseLink } from "./links.js";
export function readData(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
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
export async function linkCard(raw) {
  const ref = parseLink(raw);
  if (!ref) throw Error("Cole um link http ou https válido.");
  try {
    const r = await fetch("/api/preview?url=" + encodeURIComponent(ref.url), {
      signal: AbortSignal.timeout(5300),
    });
    if (r.ok) {
      const data = await r.json();
      for (const k of ["title", "author", "description", "image"])
        if (typeof data[k] === "string" && data[k]) ref[k] = data[k];
    }
  } catch {}
  const image = await coverImage(ref.image),
    width = 410;
  const { c: measure } = surface(10, 10);
  measure.font = "bold 22px Arial";
  const title = wrap(measure, ref.title, 366).slice(
    0,
    ref.kind === "x" ? 9 : 3,
  );
  measure.font = "15px Arial";
  const desc = wrap(measure, ref.description, 366).slice(0, 4);
  const header = 46,
    imgHeight = image ? 170 : 0,
    height =
      header +
      imgHeight +
      22 +
      title.length * 27 +
      (desc.length ? 10 + desc.length * 19 : 0) +
      46;
  const { canvas, c } = surface(width, height);
  const accent =
    { youtube: "#c93a40", substack: "#cf6735", x: "#393943", vimeo: "#297e9f" }[
      ref.kind
    ] || "#7354b1";
  c.fillStyle = "#fff";
  c.strokeStyle = "#cfcad8";
  c.lineWidth = 2;
  c.beginPath();
  c.roundRect(1, 1, width - 2, height - 2, 13);
  c.fill();
  c.stroke();
  c.fillStyle = accent;
  c.beginPath();
  c.roundRect(17, 12, 23, 23, 6);
  c.fill();
  c.fillStyle = "#fff";
  c.textAlign = "center";
  c.font = "bold 14px Arial";
  c.fillText(
    { youtube: "▶", substack: "≡", x: "𝕏", vimeo: "v" }[ref.kind] || "↗",
    28.5,
    28,
  );
  c.textAlign = "left";
  c.fillStyle = "#514a59";
  c.font = "bold 14px Arial";
  c.fillText(ref.source, 49, 29, 340);
  if (image) {
    const ratio = Math.max((width - 4) / image.width, imgHeight / image.height);
    const sw = (width - 4) / ratio,
      sh = imgHeight / ratio;
    c.drawImage(
      image,
      (image.width - sw) / 2,
      (image.height - sh) / 2,
      sw,
      sh,
      2,
      header,
      width - 4,
      imgHeight,
    );
    image.close();
  }
  let y = header + imgHeight + 20;
  c.textBaseline = "top";
  c.fillStyle = "#292630";
  c.font = "bold 22px Arial";
  for (const l of title) {
    c.fillText(l, 21, y, 366);
    y += 27;
  }
  if (desc.length) {
    y += 8;
    c.font = "15px Arial";
    c.fillStyle = "#645f69";
    for (const l of desc) {
      c.fillText(l, 21, y, 366);
      y += 19;
    }
  }
  c.fillStyle = "#736d7c";
  c.font = "14px Arial";
  c.fillText(ref.author || ref.host, 21, height - 29, 365);
  return {
    width,
    height,
    dataURL: canvas.toDataURL("image/png"),
    customData: { reference: ref },
    link: ref.url,
  };
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
