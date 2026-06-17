import { expect, test } from "@playwright/test";
import { collectRuntimeErrors } from "./runtime-errors";

test("connection node right-click menu opens and actions trigger dialogs", async ({
  page,
}) => {
  const runtimeErrors = collectRuntimeErrors(page);

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Connections" }),
  ).toBeVisible();
  runtimeErrors.assertClean("App boot should not emit runtime errors");

  const contextMenu = page.locator(".fixed.z-50");

  // Right-click on first connection node (PostgreSQL Dev from mock data)
  const connectionNode = page.getByText("PostgreSQL Dev").first();
  await connectionNode.click({ button: "right" });

  // Verify context menu items are visible
  const menuItems = [
    "Edit",
    "Duplicate",
    "Refresh",
    "New Query",
    "New Database",
    "Delete",
  ];
  for (const item of menuItems) {
    await expect(
      contextMenu.getByRole("button", { name: item }),
    ).toBeVisible();
  }

  // Click Edit - should open edit connection dialog
  await contextMenu.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  runtimeErrors.assertClean("Edit dialog should not emit runtime errors");

  // Right-click again for next action
  await connectionNode.click({ button: "right" });
  await expect(
    contextMenu.getByRole("button", { name: "Edit" }),
  ).toBeVisible();

  // Click Duplicate - silent action, just verify no errors
  await contextMenu.getByRole("button", { name: "Duplicate" }).click();
  runtimeErrors.assertClean("Duplicate should not emit runtime errors");

  // Right-click again
  await connectionNode.click({ button: "right" });
  await expect(
    contextMenu.getByRole("button", { name: "Edit" }),
  ).toBeVisible();

  // Click Refresh - reconnect action, just verify no errors
  await contextMenu.getByRole("button", { name: "Refresh" }).click();
  runtimeErrors.assertClean("Refresh should not emit runtime errors");

  // Right-click again
  await connectionNode.click({ button: "right" });
  await expect(
    contextMenu.getByRole("button", { name: "Edit" }),
  ).toBeVisible();

  // Click New Query - opens query tab
  await contextMenu.getByRole("button", { name: "New Query" }).click();
  runtimeErrors.assertClean("New Query should not emit runtime errors");

  // Right-click again
  await connectionNode.click({ button: "right" });
  await expect(
    contextMenu.getByRole("button", { name: "Edit" }),
  ).toBeVisible();

  // Click New Database - should open create database dialog
  await contextMenu.getByRole("button", { name: "New Database" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  runtimeErrors.assertClean(
    "New Database dialog should not emit runtime errors",
  );

  // Right-click again
  await connectionNode.click({ button: "right" });
  await expect(
    contextMenu.getByRole("button", { name: "Edit" }),
  ).toBeVisible();

  // Click Delete - should open delete confirmation dialog (AlertDialog uses role="alertdialog")
  await contextMenu.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toBeHidden();
  runtimeErrors.assertClean(
    "Delete confirmation should not emit runtime errors",
  );
});
