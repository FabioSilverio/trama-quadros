import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const back = (p) =>
  p.getByRole("button", { name: "Voltar aos quadros", exact: true });
const canvas = (p) => p.locator("canvas.excalidraw__canvas.interactive");
async function scene(page) {
  return page.evaluate(async () => {
    const r = indexedDB.open("trama-workspace-v1");
    const db = await new Promise((ok) => (r.onsuccess = () => ok(r.result)));
    const s = db
      .transaction("scenes")
      .objectStore("scenes")
      .get(location.hash.slice(8));
    return new Promise(
      (ok) =>
        (s.onsuccess = () => {
          db.close();
          ok(s.result?.elements || []);
        }),
    );
  });
}
test("theme follows the system, survives reload and updates the editor and other tabs", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const picker = page.getByRole("combobox", { name: "Tema", exact: true });
  await expect(picker).toHaveValue("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await picker.selectOption("dark");
  await page.reload();
  await expect(picker).toHaveValue("dark");
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Abrir Mapa de ideias" }).click();
  await expect(page.locator(".excalidraw.theme--dark")).toBeVisible();
  await picker.selectOption("light");
  await expect(page.locator(".excalidraw.theme--dark")).toHaveCount(0);
  await expect(other.locator("html")).toHaveAttribute("data-theme", "light");
  await back(page).click();
  await expect(picker).toHaveValue("light");
});
test("unavailable preview, undo, redo, immediate reload and cross-tab protection", async ({
  page,
  context,
}) => {
  await page.route("**/api/preview?**", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Novo quadro", exact: true }).click();
  await page.getByLabel("Nome do quadro").fill("Sem rede");
  await page.getByLabel("Link (opcional)").fill("https://example.org/artigo");
  await page.getByRole("button", { name: "Criar quadro", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Abrir referência", exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await scene(page)).filter((e) => e.customData?.reference).length,
    )
    .toBe(1);
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(
    other.getByText("Este quadro está aberto em outra aba.", { exact: false }),
  ).toBeVisible();
  await page.bringToFront();
  await canvas(page).click({ position: { x: 550, y: 350 } });
  await page.keyboard.press("r");
  await page.mouse.move(780, 300);
  await page.mouse.down();
  await page.mouse.move(920, 420, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await scene(page)).filter((e) => e.type === "rectangle").length,
    )
    .toBe(1);
  await page.keyboard.press("Control+z");
  await expect
    .poll(
      async () =>
        (await scene(page)).filter((e) => e.type === "rectangle").length,
    )
    .toBe(0);
  await page.keyboard.press("Control+Shift+z");
  await page.reload();
  await expect(canvas(page)).toBeVisible();
  await expect
    .poll(
      async () =>
        (await scene(page)).filter((e) => e.type === "rectangle").length,
    )
    .toBe(1);
  await back(page).click();
  await other.reload();
  await expect(canvas(other)).toBeVisible();
  await expect
    .poll(
      async () =>
        (await scene(other)).filter((e) => e.customData?.reference).length,
    )
    .toBe(1);
});
test("recover from a storage quota failure without leaving the board", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir Mapa de ideias" }).click();
  await expect(canvas(page)).toBeVisible();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    window.restoreQuota = () => {
      IDBObjectStore.prototype.put = put;
    };
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "scenes")
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      return put.apply(this, args);
    };
  });
  await back(page).click();
  await expect(
    page.getByRole("button", { name: "Tentar salvar" }),
  ).toBeVisible();
  await expect(canvas(page)).toBeVisible();
  await page.evaluate(() => window.restoreQuota());
  await page.getByRole("button", { name: "Tentar salvar" }).click();
  await expect(page.getByRole("button", { name: "Tentar salvar" })).toHaveCount(
    0,
  );
  await back(page).click();
  await expect(
    page.getByRole("heading", { name: "Meus quadros" }),
  ).toBeVisible();
});
test("search, favorites, rename, duplicate and delete remain independent", async ({
  page,
}) => {
  await page.goto("/#quadro/%");
  await page
    .getByRole("button", { name: "Favoritar Mapa de ideias", exact: true })
    .click();
  await page.getByRole("button", { name: "Favoritos", exact: true }).click();
  await expect(page.locator(".card")).toHaveCount(1);
  await page.getByRole("button", { name: "Opções de Mapa de ideias" }).click();
  await page.getByRole("button", { name: "Duplicar", exact: true }).click();
  const copy = "Mapa de ideias (cópia)";
  await page
    .getByRole("button", { name: "Opções de " + copy, exact: true })
    .click();
  await page.getByRole("button", { name: "Editar detalhes" }).click();
  await page.getByLabel("Nome do quadro").fill("Pesquisa de composição");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Buscar quadros").fill("composição");
  await expect(page.locator(".card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Opções de Pesquisa de composição" })
    .click();
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await page
    .getByRole("button", { name: "Excluir quadro", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Nenhum quadro encontrado" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Limpar busca" }).click();
  await expect(
    page.getByRole("button", { name: "Abrir Mapa de ideias" }),
  ).toBeVisible();
});
test("large collection and long names fit small screens", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Meus quadros" }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const r = indexedDB.open("trama-workspace-v1");
    const d = await new Promise((ok) => (r.onsuccess = () => ok(r.result)));
    const tx = d.transaction(["boards", "projects"], "readwrite");
    const project = "arquivo";
    tx.objectStore("projects").put({
      id: project,
      name: "ArquivoEditorialDeReferênciasVisuaisInternacionais",
      color: "#7950ab",
    });
    for (let i = 0; i < 1000; i++)
      tx.objectStore("boards").put({
        id: "test-" + i,
        project,
        name:
          i === 0
            ? "HistóriaDaRepresentaçãoCartográficaNaAméricaLatina"
            : "Referência " + i,
        updated: Date.now() - i * 2000,
        favorite: false,
      });
    await new Promise((ok) => (tx.oncomplete = ok));
    d.close();
  });
  await page.reload();
  await expect(page.locator(".card")).toHaveCount(24);
  await page.getByRole("button", { name: "Carregar mais quadros" }).click();
  await expect(page.locator(".card")).toHaveCount(48);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
  await page.getByLabel("Buscar quadros").fill("HistóriaDaRepresentação");
  await expect(page.locator(".card")).toHaveCount(1);
});
for (const mode of ["light", "dark"])
  test("workspace accessibility in " + mode, async ({ page }) => {
    await page.emulateMedia({ colorScheme: mode });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Meus quadros" }),
    ).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({ html: n.html, reason: n.failureSummary })),
      })),
    ).toEqual([]);
  });
