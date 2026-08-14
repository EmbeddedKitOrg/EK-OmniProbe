import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("app_mode", "serial"));
});

test("通用二进制协议设计器可配置、预览且无布局溢出", async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/");
  await expect(page.getByText("串口工作台", { exact: true })).toBeVisible();

  const inspectorToggle = page.getByRole("button", { name: "展开配置检查器" });
  if (await inspectorToggle.isVisible()) await inspectorToggle.click();
  await page.getByRole("button", { name: "数据", exact: true }).click();

  const parseMode = page.getByText("解析模式", { exact: true }).locator("..").getByRole("combobox");
  await parseMode.click();
  await page.getByRole("option", { name: "通用二进制协议" }).click();
  await page.getByRole("button", { name: "打开协议设计器" }).click();

  const dialog = page.getByRole("dialog", { name: "二进制协议设计器" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("协议名称")).toHaveValue("55 AA 长度帧");
  await expect(dialog.getByText("总帧长 = 长度字段值 × 1 + 6", { exact: true })).toBeVisible();
  await expect(dialog.getByText("CRC-16/MODBUS", { exact: true })).toBeVisible();

  await assertDialogFitsViewport(page, dialog);
  await page.screenshot({ path: `test-results/protocol-designer-${testInfo.project.name}-frame.png` });

  await dialog.getByRole("tab", { name: "实时预览" }).click();
  const frame = withModbusCrc([0x55, 0xaa, 0x01, 0x02, 0x34, 0x12]);
  await dialog.getByPlaceholder("55 AA 01 02 34 12 ...").fill(toHex(frame));
  await expect(dialog.getByText("匹配：默认消息", { exact: true })).toBeVisible();
  const parsedValue = dialog.getByText("4660", { exact: true });
  await expect(parsedValue).toBeVisible();
  await parsedValue.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await assertDialogFitsViewport(page, dialog);
  await page.screenshot({ path: `test-results/protocol-designer-${testInfo.project.name}-preview.png` });

  await dialog.getByRole("tab", { name: "消息字段" }).click();
  await expect(dialog.getByText("字段 1", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "添加字段" }).click();
  await expect(dialog.getByText("字段 2", { exact: true })).toBeVisible();
  await assertDialogFitsViewport(page, dialog);

  const unexpectedErrors = consoleErrors.filter(
    (message) =>
      !message.includes("Cannot read properties of undefined (reading 'invoke')") &&
      !message.includes("Cannot read properties of undefined (reading 'transformCallback')")
  );
  expect(unexpectedErrors, unexpectedErrors.join("\n")).toEqual([]);
});

async function assertDialogFitsViewport(page: Page, dialog: ReturnType<Page["getByRole"]>) {
  const viewport = page.viewportSize();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
}

function withModbusCrc(bytes: number[]): number[] {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return [...bytes, crc & 0xff, (crc >>> 8) & 0xff];
}

function toHex(bytes: number[]): string {
  return bytes.map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}
