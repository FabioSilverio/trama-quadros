import { test, expect } from "@playwright/test";
test("project, reference, caption, custom text and durable drawing", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Novo projeto", exact: true }).click();
  await page.getByLabel("Nome do projeto").fill("Pesquisa de teste");
  await page.getByRole("button", { name: "Criar projeto" }).click();
  await page.getByRole("button", { name: "Novo quadro", exact: true }).click();
  await page.getByLabel("Nome do quadro").fill("Quadro de teste");
  await page.getByLabel("Link (opcional)").fill("https://example.com/teste");
  await page.getByRole("button", { name: "Criar quadro", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Abrir referência", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page
    .getByRole("button", { name: "Abrir referência", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Ler no site original" }),
  ).toHaveAttribute("href", "https://example.com/teste");
  await page.getByRole("button", { name: "Voltar a desenhar" }).click();
  await page.getByRole("button", { name: "Legenda", exact: true }).click();
  await page.getByLabel("Legenda", { exact: true }).fill("Minha legenda");
  await page.getByRole("button", { name: "Inserir", exact: true }).click();
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  await page.getByLabel("Suavização do mouse").fill("5");
  await page
    .getByRole("button", { name: "Inserir texto com outra fonte" })
    .click();
  await page
    .getByRole("textbox", { name: "Texto", exact: true })
    .fill("Tipografia de teste");
  await page.getByRole("button", { name: "Inserir", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Editar texto", exact: true }),
  ).toBeVisible();
  const draw = page.locator("canvas.excalidraw__canvas.interactive");
  await draw.click({ position: { x: 600, y: 480 } });
  await page.keyboard.press("p");
  await page.mouse.move(570, 480);
  await page.mouse.down();
  await page.mouse.move(680, 555, { steps: 16 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Voltar aos quadros" }).click();
  await expect(
    page.getByRole("button", { name: "Abrir Quadro de teste" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Abrir Quadro de teste" }).click();
  await expect(draw).toBeVisible();
  const scene = await page.evaluate(async () => {
    const req = indexedDB.open("trama-workspace-v1");
    const d = await new Promise(
      (resolve) => (req.onsuccess = () => resolve(req.result)),
    );
    const r = d
      .transaction("scenes")
      .objectStore("scenes")
      .get(decodeURIComponent(location.hash.slice(8)));
    return new Promise((resolve) => (r.onsuccess = () => resolve(r.result)));
  });
  expect(scene.elements.map((e) => e.type)).toContain("freedraw");
  expect(scene.elements.find((e) => e.text === "Minha legenda")).toBeTruthy();
  expect(scene.elements.filter((e) => e.customData?.reference)).toHaveLength(1);
  expect(
    scene.elements.some(
      (e) => e.customData?.lettering?.text === "Tipografia de teste",
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("mobile dashboard and starter board", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir navegação" }).click();
  await page
    .getByRole("button", { name: "Pesquisa visual", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pesquisa visual" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Abrir Mapa de ideias" }).click();
  await expect(
    page.locator("canvas.excalidraw__canvas.interactive"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Voltar aos quadros" }).click();
  await expect(
    page.getByRole("button", { name: "Abrir Mapa de ideias" }),
  ).toBeVisible();
});
