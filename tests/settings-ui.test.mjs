import assert from "node:assert/strict";

export async function runUiChecks(page) {
  const state = () => page.evaluate(() => window.fixture.settings());
  const roles = page.locator(".mcp-settings > section").first();
  const tokenSections = () => page.locator(".mcp-token");
  const role = roles.getByLabel("Role", { exact: true });
  assert.equal(await roles.locator("details").count(), 9);
  assert.equal((await state()).roles.length, 6);
  await role.selectOption("read-only");
  const tags = roles
    .locator(".mcp-tool-category")
    .filter({ has: page.getByText("Select all Tags tools", { exact: true }) });
  assert.equal(
    await tags
      .locator("input[type=checkbox]")
      .first()
      .evaluate((input) => input.indeterminate),
    true,
  );
  assert.equal(
    await tags
      .locator('input[type="checkbox"]')
      .first()
      .getAttribute("data-indeterminate"),
    "true",
  );
  await tags.getByText("Tags — 2/3 enabled", { exact: true }).click();
  const detailsOpen = await tags
    .locator("details")
    .evaluate((details) => details.open);
  await tags.getByLabel("Select all Tags tools", { exact: true }).check();
  assert.equal(
    await tags.locator("details").evaluate((details) => details.open),
    detailsOpen,
  );
  await tags.getByLabel("Select all Tags tools", { exact: true }).uncheck();
  await tags.getByLabel("list_tags", { exact: true }).check();
  await tags.getByLabel("search_by_tag", { exact: true }).check();
  await tags.getByLabel("rename_tag", { exact: true }).check();
  assert.equal(
    await tags
      .locator("input[type=checkbox]")
      .first()
      .evaluate((input) => input.indeterminate),
    false,
  );
  assert.equal(
    (await state()).roles
      .find((item) => item.id === "read-only")
      .tools.includes("rename_tag"),
    false,
  );
  await roles
    .getByRole("button", { name: "Review and Save Role", exact: true })
    .click();
  assert.match(
    await roles.textContent(),
    /Affected tokens: Agent one, Agent two/,
  );
  assert.match(await roles.textContent(), /sessions close.*reinitialize/);
  await roles.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(
    (await state()).roles
      .find((item) => item.id === "read-only")
      .tools.includes("rename_tag"),
    false,
  );
  await role.selectOption("append-only");
  assert.match(await roles.textContent(), /unsaved changes/);
  await roles
    .getByRole("button", { name: "Discard Changes", exact: true })
    .click();
  assert.equal(await role.inputValue(), "append-only");
  const append = roles.getByLabel("append_to_note", { exact: true });
  await append.locator("..").locator("..").locator("summary").click();
  await append.focus();
  await page.keyboard.press("Space");
  assert.equal(await append.isChecked(), false);
  await roles
    .getByRole("button", { name: "Cancel Changes", exact: true })
    .click();
  await role.selectOption("read-only");
  await roles
    .getByRole("button", { name: "Delete Role…", exact: true })
    .click();
  assert.match(
    await roles.textContent(),
    /Reassign or revoke these tokens.*Agent one, Agent two/,
  );
  await roles
    .getByRole("button", { name: "Duplicate Role…", exact: true })
    .click();
  await roles.getByLabel("Role name", { exact: true }).fill("Research agent");
  await roles
    .getByRole("button", { name: "Review and Save Role", exact: true })
    .click();
  await roles.getByRole("button", { name: "Save Role", exact: true }).click();
  await page.waitForFunction(
    () => window.fixture.settings().roles.length === 7,
  );
  assert.deepEqual(
    (await state()).roles.find((item) => item.name === "Research agent").tools,
    (await state()).roles.find((item) => item.id === "read-only").tools,
  );
  const first = tokenSections().first();
  const secret = first.getByLabel("Bearer token", { exact: true });
  const actualSecret = (await state()).tokens[0].token;
  assert.notEqual(await secret.inputValue(), actualSecret);
  await first
    .getByRole("button", { name: "Reveal Token…", exact: true })
    .click();
  assert.match(await first.textContent(), /Anyone with this token/);
  await first.getByRole("button", { name: "Continue", exact: true }).click();
  assert.equal(await secret.inputValue(), actualSecret);
  await first.getByRole("button", { name: "Hide Token", exact: true }).click();
  assert.notEqual(await secret.inputValue(), actualSecret);
  await first
    .getByRole("button", { name: "Copy Connection JSON…", exact: true })
    .click();
  await page.waitForFunction(() => window.fixture.copied.length > 0);
  const copied = await page.evaluate(() => JSON.parse(window.fixture.copied));
  assert.equal(
    copied.mcpServers.obsidian.headers.Authorization,
    `Bearer ${actualSecret}`,
  );
  await first
    .getByRole("button", { name: "Regenerate Token…", exact: true })
    .click();
  await first.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal((await state()).tokens[0].token, actualSecret);
  await first
    .getByRole("button", { name: "Regenerate Token…", exact: true })
    .click();
  await first
    .getByRole("button", { name: "Regenerate Token", exact: true })
    .click();
  await page.waitForFunction(
    (token) => window.fixture.settings().tokens[0].token !== token,
    actualSecret,
  );
  const assigned = (await state()).roles.find(
    (item) => item.name === "Research agent",
  ).id;
  await tokenSections()
    .first()
    .getByLabel("Role", { exact: true })
    .selectOption(assigned);
  await tokenSections()
    .first()
    .getByRole("button", { name: "Save Token", exact: true })
    .click();
  await page.waitForFunction(
    (id) => window.fixture.settings().tokens[0].roleId === id,
    assigned,
  );
  await page.evaluate(() => window.fixture.failNext());
  await roles
    .getByLabel("Role name", { exact: true })
    .fill("Unsaved retry draft");
  await roles
    .getByRole("button", { name: "Review and Save Role", exact: true })
    .click();
  await roles.getByRole("button", { name: "Save Role", exact: true }).click();
  await page.waitForFunction(() =>
    document.body.textContent.includes("Could not apply this change"),
  );
  assert.equal(
    (await state()).roles.some((item) => item.name === "Unsaved retry draft"),
    false,
  );
  assert.equal(
    await roles.getByLabel("Role name", { exact: true }).inputValue(),
    "Unsaved retry draft",
  );
  assert.equal(
    (await page.locator("body").textContent()).includes("Synthetic failure"),
    false,
  );
  await roles
    .getByRole("button", { name: "Cancel Changes", exact: true })
    .click();
  await runSharedSaveChecks(page, roles, role, state);
  await runCustomTokenChecks(page, roles, state);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
    document.body.classList.add("theme-dark");
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
}

async function runSharedSaveChecks(page, roles, role, state) {
  await role.selectOption("read-only");
  const tags = roles
    .locator(".mcp-tool-category")
    .filter({ has: page.getByText("Select all Tags tools", { exact: true }) });
  await tags.locator("summary").click();
  await tags.getByLabel("rename_tag", { exact: true }).check();
  await roles
    .getByRole("button", { name: "Review and Save Role", exact: true })
    .click();
  await page.evaluate(() => window.fixture.addAssignedToken());
  await roles.getByRole("button", { name: "Save Role", exact: true }).click();
  await page.waitForFunction(() =>
    document.body.textContent.includes("Could not apply this change"),
  );
  assert.equal(
    (await state()).roles
      .find((item) => item.id === "read-only")
      .tools.includes("rename_tag"),
    false,
  );
  await roles
    .getByRole("button", { name: "Review and Save Role", exact: true })
    .click();
  assert.match(
    await roles.textContent(),
    /Affected tokens: Agent two, Agent three/,
  );
  await roles.getByRole("button", { name: "Save Role", exact: true }).click();
  await page.waitForFunction(() =>
    window.fixture
      .settings()
      .roles.find((item) => item.id === "read-only")
      .tools.includes("rename_tag"),
  );
}

async function runCustomTokenChecks(page, roles, state) {
  const create = page.locator(".mcp-token").last();
  await create.getByLabel("Token label", { exact: true }).fill("Limited agent");
  await create
    .getByRole("button", { name: "Create New Role…", exact: true })
    .click();
  await roles.getByLabel("Role name", { exact: true }).fill("No tools");
  await roles
    .getByRole("button", { name: "Review and Save Role", exact: true })
    .click();
  await roles.getByRole("button", { name: "Save Role", exact: true }).click();
  await page.waitForFunction(() =>
    window.fixture.settings().roles.some((item) => item.name === "No tools"),
  );
  const emptyRole = (await state()).roles.find(
    (item) => item.name === "No tools",
  );
  assert.deepEqual(emptyRole.tools, []);
  assert.equal(
    await create.getByLabel("Role", { exact: true }).inputValue(),
    emptyRole.id,
  );
  await create
    .getByRole("button", { name: "Create Token", exact: true })
    .click();
  await page.waitForFunction(() =>
    window.fixture
      .settings()
      .tokens.some((item) => item.label === "Limited agent"),
  );
  const token = page.locator(".mcp-token").filter({
    has: page.getByRole("heading", { name: "Limited agent", exact: true }),
  });
  await token
    .getByRole("button", { name: "Revoke Token…", exact: true })
    .click();
  await token
    .getByRole("button", { name: "Revoke Token", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      !window.fixture
        .settings()
        .tokens.some((item) => item.label === "Limited agent"),
  );
  await roles
    .getByRole("button", { name: "Delete Role…", exact: true })
    .click();
  await roles.getByRole("button", { name: "Delete Role", exact: true }).click();
  await page.waitForFunction(
    () =>
      !window.fixture.settings().roles.some((item) => item.name === "No tools"),
  );
}
