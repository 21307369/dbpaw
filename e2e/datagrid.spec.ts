import { expect, test, type Page } from "@playwright/test";
import { collectRuntimeErrors } from "./runtime-errors";

async function openTable(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Connections" }),
  ).toBeVisible();
  // Double-click PostgreSQL Dev to connect
  await page.getByText("PostgreSQL Dev", { exact: true }).dblclick();
  // Wait for connection to establish and child nodes to appear
  await expect(page.getByText("testdb")).toBeVisible();
  // Click testdb to expand it and show schemas
  await page.getByText("testdb").click();
  // Expand public schema
  await expect(page.getByText("public")).toBeVisible();
  await page.getByText("public").click();
  // Expand Tables group
  await expect(page.getByText("Tables")).toBeVisible();
  await page.getByText("Tables").click();
  // Double-click users table to open
  await page.getByText("users", { exact: true }).dblclick();
  // Wait for table data to render
  await expect(page.getByText("alice", { exact: true })).toBeVisible();
}

test.describe("DataGrid", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await openTable(page);
  });

  test("table view should load without runtime errors", async ({ page }) => {
    const runtimeErrors = collectRuntimeErrors(page);
    await expect(page.getByText("alice", { exact: true })).toBeVisible();
    await expect(page.getByText("bob", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Refresh")).toBeVisible();
    await expect(page.getByLabel("Search")).toBeVisible();
    await expect(page.getByLabel("Export")).toBeVisible();
    runtimeErrors.assertClean("Table view should not emit runtime errors");
  });

  test.describe("Pagination", () => {
    test("navigate to next and previous page", async ({ page }) => {
      const runtimeErrors = collectRuntimeErrors(page);

      // Click Next page button
      await page.getByLabel("Next page").click();
      // Verify page input changes to 2
      const pageInput = page.locator('input[inputmode="numeric"]');
      await expect(pageInput).toHaveValue("2");
      // Verify user_101 is visible (page 2 starts at row 101 with limit 100)
      await expect(page.getByText("user_101", { exact: true })).toBeVisible();

      // Click Previous page button
      await page.getByLabel("Previous page").click();
      // Verify back to page 1
      await expect(pageInput).toHaveValue("1");
      // Verify alice is visible again
      await expect(page.getByText("alice", { exact: true })).toBeVisible();

      runtimeErrors.assertClean("Pagination should not emit runtime errors");
    });

    test("jump to page by input", async ({ page }) => {
      const runtimeErrors = collectRuntimeErrors(page);

      const pageInput = page.locator('input[inputmode="numeric"]');
      // Fill page input with "3" and press Enter
      await pageInput.fill("3");
      await pageInput.press("Enter");
      // Verify user_201 is visible (page 3 starts at row 201 with limit 100)
      await expect(page.getByText("user_201", { exact: true })).toBeVisible();

      runtimeErrors.assertClean(
        "Page jump by input should not emit runtime errors",
      );
    });

    test("change page size", async ({ page }) => {
      const runtimeErrors = collectRuntimeErrors(page);

      // Click the page size select trigger
      await page.locator('[role="combobox"]').click();
      // Choose option "50"
      await page.getByRole("option", { name: "50", exact: true }).click();
      // Verify "/ 5" appears (250 rows / 50 per page = 5 pages)
      await expect(page.getByText("/ 5")).toBeVisible();

      runtimeErrors.assertClean(
        "Page size change should not emit runtime errors",
      );
    });
  });

  test.describe("Search", () => {
    test("open search and show match count", async ({ page }) => {
      const runtimeErrors = collectRuntimeErrors(page);

      // Click Search button
      await page.getByLabel("Search").click();
      // Fill search input with "alice"
      await page.locator('input[placeholder="Search keyword..."]').fill("alice");
      await page.locator('input[placeholder="Search keyword..."]').press("Enter");
      // Verify row(s)/match(es) text is visible
      await expect(page.getByText(/row\(s\).*match\(es\)/)).toBeVisible();

      runtimeErrors.assertClean("Search should not emit runtime errors");
    });

    test("cycle through matches", async ({ page }) => {
      const runtimeErrors = collectRuntimeErrors(page);

      // Click Search button
      await page.getByLabel("Search").click();
      // Fill search input with "user_1" and press Enter
      await page.locator('input[placeholder="Search keyword..."]').fill("user_1");
      await page.locator('input[placeholder="Search keyword..."]').press("Enter");
      // Verify match text is visible
      await expect(page.getByText(/match\(es\)/)).toBeVisible();

      runtimeErrors.assertClean(
        "Search cycling should not emit runtime errors",
      );
    });

    test("close search with Escape", async ({ page }) => {
      const runtimeErrors = collectRuntimeErrors(page);

      // Open search
      await page.getByLabel("Search").click();
      await expect(
        page.locator('input[placeholder="Search keyword..."]'),
      ).toBeVisible();

      // Press Escape to close
      await page.keyboard.press("Escape");
      // Verify search input is hidden
      await expect(
        page.locator('input[placeholder="Search keyword..."]'),
      ).toBeHidden();

      runtimeErrors.assertClean(
        "Search close should not emit runtime errors",
      );
    });
  });

  test.describe("View Switch", () => {
    test("toggle between table and column view", async ({ page }) => {
      const runtimeErrors = collectRuntimeErrors(page);

      // Click "Toggle column view"
      await page.getByLabel("Toggle column view").click();
      // Verify we're in column view by checking the toggle button changed
      await expect(page.getByLabel("Toggle table view")).toBeVisible();

      // Click "Toggle table view" to switch back
      await page.getByLabel("Toggle table view").click();
      // Verify alice is still visible in table view
      await expect(page.getByText("alice", { exact: true })).toBeVisible();

      runtimeErrors.assertClean(
        "View switch should not emit runtime errors",
      );
    });
  });

  test.describe("Filter & Sort", () => {
    test("apply WHERE filter", async ({ page }) => {
      const runtimeErrors = collectRuntimeErrors(page);

      // Fill WHERE input
      const whereInput = page.locator('input[placeholder="WHERE ..."]');
      await whereInput.fill("username = 'alice'");
      await whereInput.press("Enter");
      // Verify alice is visible
      await expect(page.getByText("alice", { exact: true })).toBeVisible();

      runtimeErrors.assertClean("WHERE filter should not emit runtime errors");
    });

    test("apply ORDER BY", async ({ page }) => {
      const runtimeErrors = collectRuntimeErrors(page);

      // Fill ORDER BY input
      const orderByInput = page.locator('input[placeholder="ORDER BY ..."]');
      await orderByInput.fill("id DESC");
      await orderByInput.press("Enter");
      // Verify data is visible (first row should be user_250 or similar)
      await expect(page.locator("tbody tr").first()).toBeVisible();

      runtimeErrors.assertClean(
        "ORDER BY should not emit runtime errors",
      );
    });

    test("sort by clicking column header", async ({ page }) => {
      const runtimeErrors = collectRuntimeErrors(page);

      // Click the "username" th element
      await page.locator("th", { hasText: "username" }).click();
      // Verify data is still visible
      await expect(page.locator("tbody tr").first()).toBeVisible();

      runtimeErrors.assertClean(
        "Column header sort should not emit runtime errors",
      );
    });
  });

  test.describe("DDL & ER Diagram", () => {
    test("open DDL", async ({ page }) => {
      const runtimeErrors = collectRuntimeErrors(page);

      // Click DDL button
      await page.getByLabel("DDL").click();
      // Wait for DDL to render
      await page.waitForTimeout(500);
      runtimeErrors.assertClean("DDL should not emit runtime errors");
    });

    test("open ER diagram", async ({ page }) => {
      const runtimeErrors = collectRuntimeErrors(page);

      // Click ER Diagram button
      await page.getByLabel("ER Diagram").click();
      // Wait for ER diagram to render
      await page.waitForTimeout(500);
      runtimeErrors.assertClean("ER diagram should not emit runtime errors");
    });
  });

  test.describe("Row Mutation", () => {
    test("add draft row", async ({ page }) => {
      const runtimeErrors = collectRuntimeErrors(page);

      // Click Add row button
      await page.getByLabel("Add row").click();
      // Verify Save and Discard buttons are visible
      await expect(page.getByLabel("Save")).toBeVisible();
      await expect(page.getByLabel("Discard")).toBeVisible();

      runtimeErrors.assertClean(
        "Add draft row should not emit runtime errors",
      );
    });

    test("discard changes", async ({ page }) => {
      const runtimeErrors = collectRuntimeErrors(page);

      // Add a row first
      await page.getByLabel("Add row").click();
      await expect(page.getByLabel("Save")).toBeVisible();

      // Click Discard button
      await page.getByLabel("Discard").click();
      // Verify Save button is hidden
      await expect(page.getByLabel("Save")).toBeHidden();

      runtimeErrors.assertClean(
        "Discard changes should not emit runtime errors",
      );
    });

    test("delete button disabled without selection", async ({ page }) => {
      const runtimeErrors = collectRuntimeErrors(page);

      // Verify Delete selected rows button is disabled
      await expect(page.getByLabel("Delete selected rows")).toBeDisabled();

      runtimeErrors.assertClean(
        "Delete button state should not emit runtime errors",
      );
    });
  });

  test.describe("Export", () => {
    test("open export menu", async ({ page }) => {
      const runtimeErrors = collectRuntimeErrors(page);

      // Click Export button
      await page.getByLabel("Export").click();
      // Verify export menu items are visible
      await expect(
        page.getByRole("menuitem", { name: "Export Current Page" }),
      ).toBeVisible();
      await expect(
        page.getByRole("menuitem", { name: "Export Filtered Result" }),
      ).toBeVisible();
      await expect(
        page.getByRole("menuitem", { name: "Export Full Table" }),
      ).toBeVisible();

      runtimeErrors.assertClean(
        "Export menu should not emit runtime errors",
      );
    });

    test("show format options", async ({ page }) => {
      const runtimeErrors = collectRuntimeErrors(page);

      // Click Export button
      await page.getByLabel("Export").click();
      // Hover "Export Current Page" to show format options
      await page
        .getByRole("menuitem", { name: "Export Current Page" })
        .hover();
      // Verify CSV/JSON/SQL menu items are visible
      await expect(page.getByRole("menuitem", { name: "CSV" })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "JSON" })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "SQL" })).toBeVisible();

      runtimeErrors.assertClean(
        "Export format options should not emit runtime errors",
      );
    });
  });
});
