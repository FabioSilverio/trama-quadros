import { test, expect } from "@playwright/test";

test("X post with video and photos plays inside the card and supports direct video links", async ({
  page,
}) => {
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await page.goto("/");
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
    route.fulfill({ status: 200, contentType: "image/png", body: tinyPng }),
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
          title: "Post com vídeo e foto",
          author: "Autor X",
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
