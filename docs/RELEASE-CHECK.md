# Release verification

The current release target is 0.3.1. Keep package versions, the Codex manifest, generated distributions, CHANGELOG and the Git tag aligned.

Run npm run check:ci for deterministic contract, types, builds and package validation. Run npm run test:integration:codex separately on a machine with a configured Codex CLI; it creates an ephemeral test thread and the session test sends one small model request, so it is intentionally not a public-PR CI requirement. Failures must be recorded, not treated as an automatic pass.

Run `node scripts/browser-smoke.mjs` when Playwright and its Chromium browser are available. You may set PLAYWRIGHT_MODULE to an existing Playwright module file and BROWSER_EXECUTABLE to an existing Chrome binary. This optional check uses temporary data and an ephemeral local port, tests all three rooms with signage and extra furniture, verifies selection/reopen, and cleans up its browser and service. It never calls a model or changes a real user Office.

Set `CHECK_DSH_FRAME=1` after installing the DSH build dependencies to additionally build and test the real embedded frame with custom time, weather and NPC hours. This checks the bundled renderer in a browser without starting DSH; it does not replace the host installation tests below.

For each official host, record the host version and validate this user path before a release:

1. Install from the intended distribution source into a disposable host profile.
2. Open Agent Live and run a short task; verify the lead Agent, work events and completion.
3. List Offices and select meetingroom; verify both the scene and Creator use it.
4. Customize a name, add an NPC and plant, and set company/notice/slogan text. In Codex invoke the explicit customization Skill; in Pi/DSH use custom.
5. Exit custom (Pi/DSH), then run an unrelated coding task.
6. Reopen the viewer and start a new host session; verify the saved Office is selected and text remains.
7. Delegate a task; verify the child appears and departs when complete.
8. Close Agent Live's standalone viewer; verify its resources close. An embedded DSH view must not stop DSH.
9. Disable/remove the plugin through the host; verify the host still starts.

After these checks pass, merge the reviewed branch, confirm repository visibility and install links, date the changelog and create the matching version tag. The tag workflow packs the Core, Pi Adapter and DSH Adapter into the GitHub Release; npm publication of those three packages is a separate decision. Codex is distributed only through the repository Marketplace.
