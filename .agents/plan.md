# Continuation plan

Updated October 13, 2026 (Asia/Taipei).

## Current objective

The remote-image and Apply anyway work is complete and committed. The user reports thumbnail repair is working and accepted the two-click flow. The final reminder placement is implemented and browser-verified. There are no remaining agreed implementation steps for this feature.

Read [session progress](progress.md) for decisions and verification limits. [WebMCP](../docs/webmcp.md) is the authoritative behavior, setup, and verification reference. The broader [product plan](../docs/plan.md) and [product progress](../docs/progress.md) retain unrelated work.

## If round 4 acceptance resumes

1. Read the current app, tools, and collection state. The user's usual dev origin is `http://127.0.0.1:5199/`; availability and selection must be checked again. Avoid reloading a pending proposal; reload discards proposals and selection. Use the recovery guidance in the WebMCP document if discovery fails.
2. Run only the remaining [human acceptance tasks](../docs/webmcp.md#finish-the-codex-connection) the user wants to try: two additions with one Undo, group reads independent of queue visibility, rejection without saving, and stale-batch review/application/Undo. Earlier technical checks already cover these paths.
3. Preserve the accepted same-button confirmation: first click changes label/color and reveals the right-aligned reminder below the buttons; second click saves. Further edits and reopening reset confirmation.
4. Record broader round 4 approval only after explicit user acceptance. Thumbnail and two-click feedback do not close the entire round. Claude conversation testing remains deferred.

These are broader product follow-ups, not unfinished steps in the completed feature. The older thumbnail retry task is superseded by the user's report; do not require a redundant retry without new feedback.

## Boundaries

Keep human batch review and one Undo per batch. Tools read/propose only. Source actual image candidates and preserve populated values when filling missing fields. Local uploads, asset removal, video/audio writes, assets on creations, group creation/deletion, coordinated agent writes, and bundled fetching remain outside the accepted scope.

Keep local configuration and personal collection backups out of handoff commits. Update these notes at meaningful milestones and link to durable docs rather than duplicating them.
