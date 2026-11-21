import { test, expect } from "@playwright/test";
test("paste YouTube and drop a Substack article into the editor", async ({
  page,
  context,
  baseURL,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: baseURL,
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir Mapa de ideias" }).click();
  const canvas = page.locator("canvas.excalidraw__canvas.interactive");
  await canvas.click({ position: { x: 520, y: 380 } });
  await page.evaluate(() =>
    navigator.clipboard.writeText("https://youtu.be/aqz-KE-bpKQ"),
  );
  await page.keyboard.press("Control+v");
  const open = page.getByRole("button", {
    name: "Abrir referência",
    exact: true,
  });
  await expect(open).toBeVisible({ timeout: 20000 });
  await open.click();
  await expect(page.locator(".live-card iframe")).toHaveAttribute(
    "src",
    "https://www.youtube.com/embed/aqz-KE-bpKQ",
  );
  await page.getByRole("button", { name: "Voltar a desenhar" }).click();
  const data = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.setData("text/uri-list", "https://on.substack.com/p/introducing-notes");
    return d;
  });
  await canvas.dispatchEvent("drop", {
    dataTransfer: data,
    clientX: 800,
    clientY: 430,
  });
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          let r = indexedDB.open("trama-workspace-v1");
          const db = await new Promise(
            (ok) => (r.onsuccess = () => ok(r.result)),
          );
          r = db.transaction("scenes").objectStore("scenes").get("mapa");
          const s = await new Promise(
            (ok) => (r.onsuccess = () => ok(r.result)),
          );
          return s?.elements.find(
            (e) => e.customData?.reference?.kind === "substack",
          )?.customData.reference.title;
        }),
      { timeout: 20000 },
    )
    .toBe("Introducing Substack Notes");
  await open.click();
  await expect(
    page.getByRole("heading", { name: "Introducing Substack Notes" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
