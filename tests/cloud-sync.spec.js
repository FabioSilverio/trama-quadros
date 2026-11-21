import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const canvas = (p) => p.locator("canvas.excalidraw__canvas.interactive");

test("auth screen is accessible in light and dark mode and protects API", async ({
  page,
  request,
}) => {
  const unauth = await request.get("/api/workspace");
  expect(unauth.status()).toBe(401);

  for (const mode of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: mode });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Acesse seus quadros" }),
    ).toBeVisible();
    const res = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      res.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.html),
      })),
    ).toEqual([]);
  }
});

test("register, migrate local boards, sync across two devices, detect conflicts and logout", async ({
  browser,
}) => {
  const email = `fabio.${Date.now()}@example.com`;
  const password = "senha-super-segura-123";

  // Device A (Desktop) starts with a pre-existing local IndexedDB board from before auth existed.
  const desktopCtx = await browser.newContext({
    viewport: { width: 1366, height: 850 },
  });
  const desktop = await desktopCtx.newPage();
  await desktop.route("**/api/preview?**", (r) =>
    r.fulfill({ json: { title: "Artigo sincronizado", author: "Teste" } }),
  );
  await desktop.goto("/");
  await expect(
    desktop.getByRole("heading", { name: "Acesse seus quadros" }),
  ).toBeVisible();

  // Seed pre-existing local board into IndexedDB to verify migration on signup.
  await desktop.evaluate(async () => {
    const req = indexedDB.open("trama-workspace-v1", 1);
    const db = await new Promise((ok) => (req.onsuccess = () => ok(req.result)));
    const tx = db.transaction(["projects", "boards", "scenes"], "readwrite");
    tx.objectStore("projects").put({
      id: "local-proj",
      name: "Projeto Local Antigo",
      color: "#439b83",
    });
    tx.objectStore("boards").put({
      id: "local-board",
      name: "Quadro Local Antigo",
      project: "local-proj",
      cover: null,
      updated: Date.now(),
      favorite: true,
      revision: 1,
    });
    tx.objectStore("scenes").put(
      {
        revision: 1,
        elements: [
          {
            id: "old-text-1",
            type: "text",
            x: 100,
            y: 100,
            width: 120,
            height: 25,
            angle: 0,
            strokeColor: "#1e1e1e",
            backgroundColor: "transparent",
            fillStyle: "solid",
            strokeWidth: 2,
            strokeStyle: "solid",
            roughness: 1,
            opacity: 100,
            groupIds: [],
            frameId: null,
            roundness: null,
            seed: 1,
            version: 1,
            versionNonce: 1,
            isDeleted: false,
            boundElements: null,
            updated: Date.now(),
            link: null,
            locked: false,
            text: "Nota antiga migrada",
            fontSize: 20,
            fontFamily: 1,
            textAlign: "left",
            verticalAlign: "top",
            containerId: null,
            originalText: "Nota antiga migrada",
            autoResize: true,
            lineHeight: 1.25,
          },
        ],
        appState: { viewBackgroundColor: "#ffffff" },
        files: {},
      },
      "local-board",
    );
    await new Promise((ok) => (tx.oncomplete = ok));
    db.close();
  });

  await desktop.reload();
  await expect(desktop.getByText(/Encontramos 1 quadro salvo/)).toBeVisible();

  await desktop.getByRole("tab", { name: "Criar conta" }).click();
  await desktop.getByLabel("Nome").fill("Fabio");
  await desktop.getByLabel("E-mail").fill(email);
  await desktop.getByLabel("Senha", { exact: true }).fill(password);
  await desktop.getByRole("button", { name: "Criar conta e entrar" }).click();

  await expect(
    desktop.getByRole("heading", { name: "Meus quadros" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    desktop.getByRole("button", { name: "Abrir Quadro Local Antigo" }),
  ).toBeVisible();

  // Create a new project & board with a link + drawing on Desktop
  await desktop
    .getByRole("button", { name: "Novo projeto", exact: true })
    .click();
  await desktop.getByLabel("Nome do projeto").fill("Sync Cross-Device");
  await desktop.getByRole("button", { name: "Criar projeto" }).click();

  await desktop
    .getByRole("button", { name: "Novo quadro", exact: true })
    .click();
  await desktop.getByLabel("Nome do quadro").fill("Quadro Compartilhado");
  await desktop
    .getByLabel("Link (opcional)")
    .fill("https://example.com/sync-post");
  await desktop
    .getByRole("button", { name: "Criar quadro", exact: true })
    .click();

  await expect(
    desktop.getByRole("button", { name: "Abrir referência", exact: true }),
  ).toBeVisible({ timeout: 20000 });

  await canvas(desktop).click({ position: { x: 600, y: 480 } });
  await desktop.keyboard.press("p");
  await desktop.mouse.move(560, 460);
  await desktop.mouse.down();
  await desktop.mouse.move(680, 520, { steps: 10 });
  await desktop.mouse.up();

  await desktop.getByRole("button", { name: "Voltar aos quadros" }).click();
  await expect(
    desktop.getByRole("button", { name: "Abrir Quadro Compartilhado" }),
  ).toBeVisible();

  // Device B (Phone) opens in a completely separate browser context (no shared cookies or IndexedDB!)
  const phoneCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const phone = await phoneCtx.newPage();
  await phone.goto("/");
  await expect(
    phone.getByRole("heading", { name: "Acesse seus quadros" }),
  ).toBeVisible();

  // Verify wrong password fails cleanly
  await phone.getByLabel("E-mail").fill(email);
  await phone.getByLabel("Senha", { exact: true }).fill("senha-errada");
  await phone.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(phone.getByRole("alert")).toContainText(
    "E-mail ou senha incorretos.",
  );

  // Sign in with correct credentials on Phone
  await phone.getByLabel("Senha", { exact: true }).fill(password);
  await phone.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    phone.getByRole("heading", { name: "Meus quadros" }),
  ).toBeVisible({ timeout: 15000 });

  // Phone must see BOTH the migrated local board AND the newly created Desktop board!
  await expect(
    phone.getByRole("button", { name: "Abrir Quadro Local Antigo" }),
  ).toBeVisible();
  await expect(
    phone.getByRole("button", { name: "Abrir Quadro Compartilhado" }),
  ).toBeVisible();

  // Open the shared board on Phone and verify elements synced from Desktop
  await phone
    .getByRole("button", { name: "Abrir Quadro Compartilhado" })
    .click();
  await expect(canvas(phone)).toBeVisible();

  const phoneScene = await phone.evaluate(async () => {
    const id = decodeURIComponent(location.hash.slice(8));
    const res = await fetch("/api/workspace?resource=scene&id=" + id);
    return res.json();
  });
  expect(phoneScene.scene.elements.map((e) => e.type)).toContain("freedraw");
  expect(
    phoneScene.scene.elements.filter((e) => e.customData?.reference),
  ).toHaveLength(1);
  expect(Object.keys(phoneScene.scene.files)).toHaveLength(1);

  // Also open the same board concurrently on Desktop (same revision), then edit on Phone, then edit on Desktop -> conflict detected!
  await desktop
    .getByRole("button", { name: "Abrir Quadro Compartilhado" })
    .click();
  await expect(canvas(desktop)).toBeVisible();

  // Edit on Phone and exit (increments server revision)
  await canvas(phone).click({ position: { x: 200, y: 350 } });
  await phone.keyboard.press("r");
  await phone.mouse.move(140, 320);
  await phone.mouse.down();
  await phone.mouse.move(260, 410, { steps: 8 });
  await phone.mouse.up();
  await phone.getByRole("button", { name: "Voltar aos quadros" }).click();
  await expect(
    phone.getByRole("heading", { name: "Meus quadros" }),
  ).toBeVisible();

  // Now edit on Desktop (stale revision) -> conflict banner / Recarregar versão appears
  await canvas(desktop).click({ position: { x: 750, y: 400 } });
  await desktop.keyboard.press("o");
  await desktop.mouse.move(740, 390);
  await desktop.mouse.down();
  await desktop.mouse.move(820, 460, { steps: 8 });
  await desktop.mouse.up();

  const reloadBtn = desktop.getByRole("button", { name: "Recarregar versão" });
  await expect(reloadBtn).toBeVisible({ timeout: 10000 });
  await reloadBtn.click();
  await expect(canvas(desktop)).toBeVisible();
  await expect(reloadBtn).toHaveCount(0);

  // Logout on Phone clears session and returns to Auth screen
  await phone.getByRole("button", { name: "Abrir navegação" }).click();
  await phone.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(
    phone.getByRole("heading", { name: "Acesse seus quadros" }),
  ).toBeVisible();

  await desktopCtx.close();
  await phoneCtx.close();
});
