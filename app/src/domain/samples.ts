import { emptyWorkspace, defaultAppearance, type Workspace } from './model';
export const bookmarkSample = 'title,url,description,tags,status\nDesigning useful tools,https://example.com/tools,A guide to small useful products,Research|Ideas,Pending\nImport patterns,https://example.com/import,Mapping and duplicate handling,Research,In progress\nDesigning useful tools again,https://example.com/tools,A second note about the same link,Reading,Pending\nBroken link,not-a-url,Fix this before importing,Research,Pending\n,https://example.com/new,,Ideas,Pending\nOffline thought,,A thought without a URL,Ideas,Pending';
export const readingSample = 'title\tdescription\ttags\tstatus\nThe Design of Everyday Things\tRead chapters 1 and 2\tDesign|Books\tPending\nWrite a reading note\tSummarize the key ideas\tWriting|Design\tIn progress\nA paper notebook\tA local item with no link\tBooks\tPending';
export function demoWorkspace(kind: 'bookmarks' | 'reading' = 'bookmarks'): Workspace {
  const w = emptyWorkspace(kind === 'bookmarks' ? 'Bookmark collection' : 'Reading & writing');
  const now = new Date().toISOString(), meta = { revision: 0, createdAt: now, updatedAt: now };
  const names = kind === 'bookmarks' ? ['Research','Ideas','Reading'] : ['Design','Books','Writing'];
  w.tagTypes = [{ id: 'topic', name: 'Topic', appearance: defaultAppearance }];
  w.tags = names.map((name, i) => ({ ...meta, id: `tag-${i}`, name, statusId: 'pending', typeId: 'topic', appearance: { color: ['#0f766e','#7c3aed','#d97706'][i] } }));
  const labels = kind === 'bookmarks' ? ['User interviews','Market notes','Useful tools','Import patterns','Sketch a flow','Small experiment','Prototype notes','Feedback','An article','A long read','Design essay','Unlinked idea'] : ['Everyday things','Read chapter two','A paper notebook','Design principles','Outline a note','Draft a paragraph','Writing habits','Review the draft','Favorite passages','Library list','Book notes','Unsorted thought'];
  w.bookmarks = labels.map((title, i) => ({ ...meta, id: `bookmark-${i}`, title, description: `Notes about ${title.toLowerCase()}.`, statusId: i === 1 ? 'in-progress' : 'pending', ...(kind === 'bookmarks' ? { url: `https://example.com/${i}` } : {}) }));
  for (let i = 0; i < 11; i++) w.memberships.push({ id: `membership-${i}`, bookmarkId: `bookmark-${i}`, tagId: `tag-${Math.floor(i / 4)}` });
  for (const [b,t] of [[2,1],[6,2],[9,0]]) w.memberships.push({ id: `shared-${b}`, bookmarkId: `bookmark-${b}`, tagId: `tag-${t}` });
  return w;
}
