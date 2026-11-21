import { test, expect } from "@playwright/test";

test("X post with video and photos plays inside the card and supports direct video links", async ({
  page,
}) => {
  await page.goto("/");
  const { tinyPng, portraitPng } = await page.evaluate(async () => {
    function makePng(w, h, color) {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      return c.toDataURL("image/png").split(",")[1];
    }
    return {
      tinyPng: makePng(48, 48, "#7c63e6"),
      portraitPng: makePng(200, 300, "#3b82f6"),
    };
  });
  const tinyPngBuf = Buffer.from(tinyPng, "base64");
  const portraitPngBuf = Buffer.from(portraitPng, "base64");
  const tinyWebm = Buffer.from(
    await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 16;
      c.height = 16;
      c.getContext("2d").fillRect(0, 0, 16, 16);
      const rec = new MediaRecorder(c.captureStream(10), {
        mimeType: "video/webm",
      });
      const chunks = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      const done = new Promise((ok) => (rec.onstop = ok));
      rec.start();
      await new Promise((r) => setTimeout(r, 120));
      rec.stop();
      await done;
      const buf = await new Blob(chunks).arrayBuffer();
      return Array.from(new Uint8Array(buf));
    }),
  );
  await page.route("https://pbs.twimg.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: route.request().url().includes("poster") ? portraitPngBuf : tinyPngBuf,
    }),
  );
  await page.route("https://video.twimg.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "video/webm", body: tinyWebm }),
  );
  await page.route("https://cdn.example.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "video/webm", body: tinyWebm }),
  );
  await page.route("**/api/preview?**", (route) => {
    const url = new URL(route.request().url());
    const target = url.searchParams.get("url") || "";
    if (target.includes("x.com/")) {
      return route.fulfill({
        json: {
          title: "Post com vídeo vertical e foto",
          author: "Autor X",
          handle: "autorx",
          avatar: "https://pbs.twimg.com/profile_images/1/avatar.png",
          publishedAt: "2026-11-21T15:00:00.000Z",
          image: "https://pbs.twimg.com/media/poster.jpg",
          media: [
            {
              type: "video",
              url: "https://video.twimg.com/ext_tw_video/1/pu/vid/demo.mp4",
              poster: "https://pbs.twimg.com/media/poster.jpg",
              alt: "",
            },
            {
              type: "photo",
              url: "https://pbs.twimg.com/media/photo2.jpg",
              poster: "https://pbs.twimg.com/media/photo2.jpg",
              alt: "Segunda foto",
            },
          ],
        },
      });
    }
    return route.fulfill({ json: { title: "Referência genérica" } });
  });

  await page.getByRole("button", { name: "Novo quadro", exact: true }).click();
  await page.getByLabel("Nome do quadro").fill("Mídia do X");
  await page
    .getByLabel("Link (opcional)")
    .fill("https://x.com/demo/status/1234567890123456789");
  await page.getByRole("button", { name: "Criar quadro", exact: true }).click();

  const openBtn = page.getByRole("button", {
    name: "Abrir referência",
    exact: true,
  });
  await expect(openBtn).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("button", { name: "Atualizar cartão", exact: true }),
  ).toBeVisible();

  // Verify the portrait poster (200x300) was NOT cropped to a 170px banner
  const cardHeight = await page.evaluate(async () => {
    const r = indexedDB.open("trama-workspace-v1");
    const db = await new Promise((ok) => (r.onsuccess = () => ok(r.result)));
    const req = db
      .transaction("scenes")
      .objectStore("scenes")
      .get(decodeURIComponent(location.hash.slice(8)));
    const scene = await new Promise((ok) => (req.onsuccess = () => ok(req.result)));
    db.close();
    const el = scene?.elements?.find((e) => e.customData?.reference?.kind === "x");
    return el?.height || 0;
  });
  expect(cardHeight).toBeGreaterThan(550);

  await openBtn.click();

  const video = page.locator(".live-card video");
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute(
    "src",
    "https://video.twimg.com/ext_tw_video/1/pu/vid/demo.mp4",
  );
  await expect(page.getByText("1 de 2")).toBeVisible();

  await page.getByRole("button", { name: "Próxima mídia" }).click();
  const img = page.locator(".live-card .media-stage img");
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute(
    "src",
    "https://pbs.twimg.com/media/photo2.jpg",
  );
  await expect(page.getByText("2 de 2")).toBeVisible();

  await page.getByRole("button", { name: "Ver post", exact: true }).click();
  await expect(page.locator(".live-card iframe")).toHaveAttribute(
    "src",
    /platform\.twitter\.com\/embed\/Tweet\.html.*id=1234567890123456789/,
  );

  await page.getByRole("button", { name: "Voltar a desenhar" }).click();

  // Also test inserting a direct .mp4 media link
  await page.getByRole("button", { name: "Inserir link" }).click();
  await page
    .getByLabel("URL da referência")
    .fill("https://cdn.example.com/clip.mp4");
  await page.getByRole("button", { name: "Inserir", exact: true }).click();
  await expect(openBtn).toBeVisible({ timeout: 15000 });
  await openBtn.click();
  await expect(page.locator(".live-card video")).toHaveAttribute(
    "src",
    "https://cdn.example.com/clip.mp4",
  );
});
