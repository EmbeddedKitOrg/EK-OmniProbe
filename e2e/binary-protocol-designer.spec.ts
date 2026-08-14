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

  const dialog = await openProtocolDesigner(page);
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
  await dialog.getByRole("button", { name: "添加消息" }).click();
  const currentMessage = dialog.getByText("当前消息类型", { exact: true }).locator("..").getByRole("combobox");
  await expect(currentMessage).toContainText("消息 2");
  await dialog.getByRole("tab", { name: "帧结构" }).click();
  await dialog.getByRole("tab", { name: "消息字段" }).click();
  await expect(currentMessage).toContainText("消息 2");
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

test("数据解析页可切换并在刷新后恢复多个协议", async ({ page }, testInfo) => {
  let dialog = await openProtocolDesigner(page);
  const protocolName = dialog.getByLabel("协议名称");

  await protocolName.fill("协议 A");
  await dialog.getByRole("button", { name: "保存协议", exact: true }).click();
  await expect(dialog.getByText("已保存协议：协议 A", { exact: true })).toBeVisible();

  await protocolName.fill("协议 B");
  await dialog.getByRole("button", { name: "保存协议", exact: true }).click();
  await expect(dialog.getByText("已保存协议：协议 B", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "取消" }).click();
  const savedProtocol = page.getByLabel("已保存协议");
  await savedProtocol.click();
  await page.getByRole("option", { name: "协议 A", exact: true }).click();
  await expect(savedProtocol).toContainText("协议 A");
  await page.screenshot({ path: `test-results/protocol-library-${testInfo.project.name}.png` });

  await page.getByRole("button", { name: "打开协议设计器" }).click();
  dialog = page.getByRole("dialog", { name: "二进制协议设计器" });
  await expect(dialog.getByLabel("协议名称")).toHaveValue("协议 A");

  await page.reload();
  await openDataParser(page);
  const restoredProtocol = page.getByLabel("已保存协议");
  await restoredProtocol.click();
  await page.getByRole("option", { name: "协议 B", exact: true }).click();
  await expect(restoredProtocol).toContainText("协议 B");
  await page.getByRole("button", { name: "打开协议设计器" }).click();
  dialog = page.getByRole("dialog", { name: "二进制协议设计器" });
  await expect(dialog.getByLabel("协议名称")).toHaveValue("协议 B");
  await assertDialogFitsViewport(page, dialog);
});

async function openProtocolDesigner(page: Page) {
  await openDataParser(page);
  await page.getByRole("button", { name: "打开协议设计器" }).click();

  const dialog = page.getByRole("dialog", { name: "二进制协议设计器" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openDataParser(page: Page) {
  await page.goto("/");
  await expect(page.getByText("串口工作台", { exact: true })).toBeVisible();

  const inspectorToggle = page.getByRole("button", { name: "展开配置检查器" });
  if (await inspectorToggle.isVisible()) await inspectorToggle.click();
  await page.getByRole("button", { name: "数据", exact: true }).click();

  const parseMode = page.getByText("解析模式", { exact: true }).locator("..").getByRole("combobox");
  await parseMode.click();
  await page.getByRole("option", { name: "通用二进制协议" }).click();
}

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
