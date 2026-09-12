# Release verification

The current development target is 0.3.0, not a published release. Keep CHANGELOG marked Unreleased until the release is actually cut.

Run npm run check:ci for deterministic contract, types, builds and package validation. Run npm run test:integration:codex separately on a machine with a configured Codex CLI; it creates an ephemeral test thread and the session test sends one small model request, so it is intentionally not a public-PR CI requirement. Failures must be recorded, not treated as an automatic pass.

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

After these checks pass, merge the reviewed branch, confirm repository visibility and install links, date the changelog and create the matching version tag. The tag workflow creates the GitHub Release; npm publication is a separate decision.
