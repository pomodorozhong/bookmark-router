> **Archived October 12, 2026.** Round 2 was approved; later tag styles and the compact filter bar supersede parts of this checklist. See [the app guide](../../app/README.md) for current controls.

# Round 2 — what to try

About 5 minutes, in your own collection. Run `npm run dev` in `app/` and open http://localhost:5199.

1. **Read an issue.** Click the **#141 App Store Optimization** node in the graph. The right panel shows its type, status, GitHub link, and description, then its 7 bookmarks with the reason each belongs. Click one bookmark: it opens as the current bookmark. Press Esc to close an issue view.
2. **Override a tag's look.** Click a tag, then **Edit**. Open **Appearance**, check **Color override** and pick a color, check **Shape override** and choose **Diamond**, and type an icon such as ★. The preview changes as you go. Save, and check that the node in the graph changes too. Then press **Undo** in the toast and check it changes back.
3. **Create a tag type.** ⋯ → **Tag types…** → fill in **New type** (name, color, shape) → **Add type**. Check that it appears in the list and as a toggle in the filter bar. Then edit a tag and choose the new type in **Tag type** (the list also offers **New type…**).
4. **Edit a type.** In **Tag types…**, click **Edit** on Topic, change its color, and save. Every topic node should change color, except tags with their own color override.

Report anything that looks wrong or reads oddly; it gets fixed before round 3.
