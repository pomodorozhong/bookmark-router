# Map canvas redesign

The redesign for [#93](https://github.com/pomodorozhong/bookmark-router/issues/93): every control says what it acts on, and the graph gets the whole window. It was designed together with Untangle ([#90](https://github.com/pomodorozhong/bookmark-router/issues/90)) and ships first, without the Connections view. [Product behavior](product.md#current-behavior) describes the result; this page records the decisions behind it.

## Decisions

- **Ownership in the labels.** The old joined Search | Show | Filters | Highlight box became three labeled menus: **Bookmarks** (Filter, Highlight), **Tags** (Show tag types, Hide single tags, Edit tag types) and **Views** (Saved views, Reset search and state). An earlier round used bookmark and tag icons as group owners; they read as buttons, so the owner chose text labels with active-rule counts (October 30). On phones one **Filters** menu holds the same three sections.
- **One name for tags.** The Filter field formerly called Group is **Tag**, and a new **Tag type** field filters bookmarks by the types of their tags.
- **No side effects hidden in visibility.** Hiding a tag type hides its tags and links only; bookmarks stay unless another rule removes them. Per tag, **Hide tag** keeps its bookmarks and **Hide tag + bookmarks** removes them. Type hiding wins over a tag's Show choice, and the panel says so. Hidden tags of the current bookmark no longer peek, so reading a record never widens the graph.
- **Saved views cover everything they claim.** A view now stores search, bookmark state, rules, inclusion settings, type and tag visibility, and highlights in the optional `SavedView.graph` field. Views saved before it load their original filter and hidden tags and leave the other settings alone. Reset is deliberately narrower: it clears search and returns to To triage.
- **Map canvas layout.** After rejecting a sidebar and a toolbar hierarchy, the owner chose **Map canvas** from a from-scratch mockup (October 30): the graph fills the window; a floating header, the graph tools, the bookmark card and a queue strip float over it. Framing uses the four-sided area the floating parts leave uncovered. Heights of the header, the phone sheet and the progress line are measured into CSS variables, so the parts below them follow however they wrap.
- **Plain controls and one palette.** Header and graph-tool buttons have no fills; menus, popovers and dialogs share 36 px rows and one focus ring. The theme roles follow the mockup palette (warm stone neutrals, teal accent, orange highlight) and gain a dark appearance that follows the system setting.

Private mockups embed a personal collection and stay outside Git.

## Compatibility

- Saved views without `graph` and backups made before this change validate and load unchanged; new fields are validated atomically, so an invalid view fails without changing the collection or Undo history.
- Collection records, memberships, node positions and pins are untouched by saving, loading or resetting views.

## Verification

See the pull request for this change.
