import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("connect two references with a bound arrow, export and reopen the file", async ({
  page,
}) => {
  await page.route("**/api/preview?**", (r) =>
    r.fulfill({ json: { title: "Uma referência" } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Novo quadro", exact: true }).click();
  await page.getByLabel("Nome do quadro").fill("Mapa portátil");
  await page.getByRole("button", { name: "Criar quadro", exact: true }).click();
  const canvas = page.locator("canvas.excalidraw__canvas.interactive");
  await expect(canvas).toBeVisible();
  for (const [x, path] of [
    [400, "a"],
    [1020, "b"],
  ]) {
    const d = await page.evaluateHandle((url) => {
      const t = new DataTransfer();
      t.setData("text/uri-list", url);
      return t;
    }, "https://example.org/" + path);
    await canvas.dispatchEvent("drop", {
      dataTransfer: d,
      clientX: x,
      clientY: 400,
    });
    await expect(
      page.getByRole("button", { name: "Abrir referência", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".save-status")).toHaveText("Salvo");
  }
  await page.getByTestId("toolbar-arrow").check({ force: true });
  await page.mouse.move(609, 400);
  await page.mouse.down();
  await page.mouse.move(811, 400, { steps: 18 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar cópia .excalidraw" }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("Mapa portátil.excalidraw");
  const bytes = await readFile(await file.path());
  const doc = JSON.parse(bytes);
  const refs = doc.elements.filter((e) => e.customData?.reference);
  const arrow = doc.elements.find((e) => e.type === "arrow");
  expect(refs.length).toBe(2);
  expect(arrow?.startBinding?.elementId).toBe(refs[0].id);
  expect(arrow?.endBinding?.elementId).toBe(refs[1].id);
  expect(Object.keys(doc.files)).toHaveLength(2);
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page
    .getByRole("button", { name: "Voltar aos quadros", exact: true })
    .click();
  await page.getByRole("button", { name: "Novo quadro", exact: true }).click();
  await page.getByRole("button", { name: "Criar quadro", exact: true }).click();
  await expect(canvas).toBeVisible();
  const dropped = await page.evaluateHandle((json) => {
    const dt = new DataTransfer();
    dt.items.add(
      new File([json], "Mapa.excalidraw", { type: "application/json" }),
    );
    return dt;
  }, bytes.toString());
  await canvas.dispatchEvent("drop", {
    dataTransfer: dropped,
    clientX: 690,
    clientY: 400,
  });
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const r = indexedDB.open("trama-workspace-v1");
        const db = await new Promise(
          (ok) => (r.onsuccess = () => ok(r.result)),
        );
        const req = db
          .transaction("scenes")
          .objectStore("scenes")
          .get(location.hash.slice(8));
        return new Promise(
          (ok) =>
            (req.onsuccess = () => {
              db.close();
              ok(
                req.result?.elements.filter((e) => e.customData?.reference)
                  .length,
              );
            }),
        );
      }),
    )
    .toBe(2);
});
