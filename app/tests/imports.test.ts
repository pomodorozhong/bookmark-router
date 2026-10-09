import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseImport, guessMapping, previewImport, detectFormat } from '../src/domain/imports';
import { emptyWorkspace, urlKey } from '../src/domain/model';
import { bookmarkSample, readingSample, demoWorkspace } from '../src/domain/samples';
const options = { delimiter: '|', commonTags: '', initialStatus: 'Pending' };
test('CSV supports quoted newlines, delimiters, and source line numbers', () => {
  const parsed = parseImport('title,url,description\n"A, B",https://example.com,"line 1\nline 2"\nC,https://example.org,ok', 'csv');
  assert.equal(parsed.rows[0].values.title,'A, B'); assert.equal(parsed.rows[0].values.description,'line 1\nline 2'); assert.equal(parsed.rows[1].row,4);
});
test('CSV rejects repeated headers rather than silently losing fields', () => assert.throws(()=>parseImport('title,title\na,b','csv'), /unique/));
test('CSV flags uneven rows', () => assert.equal(parseImport('title,url\nonly one','csv').rows[0].errors.length,1));
test('formats are detected by extension and source content', () => {
  assert.equal(detectFormat('title\turl\na\tb'),'tsv'); assert.equal(detectFormat('https://example.com/?a=1,b=2'),'urls'); assert.equal(detectFormat('title,url\na,b'),'csv'); assert.equal(detectFormat('<DL><DT><A HREF="https://example.com">Test</A></DL>'),'html');
});
test('URL paste preserves source rows and warns about unrecognized values without excluding them', () => {
  const p=parseImport('https://example.com\n\njavascript:alert(1)','urls'), v=previewImport(p,guessMapping(p.headers),emptyWorkspace(),options);
  assert.equal(v.candidates[1].row,3); assert.equal(v.candidates[1].errors.length,0);assert.match(v.candidates[1].urlWarning!,/saved as text/);
});
test('HTML extracts decoded title, description, folder tags, and original line', () => {
  const p=parseImport('<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL><DT><H3>Research</H3><DL>\n<DT><A HREF="https://example.com/?a=1&amp;b=2">A &amp; B</A><DD>A useful note\n</DL></DL>','html');
  assert.equal(p.rows[0].values.title,'A & B'); assert.equal(p.rows[0].values.url,'https://example.com/?a=1&b=2'); assert.equal(p.rows[0].row,3); assert.match(p.rows[0].values.tags,/Research/); assert.match(p.rows[0].values.description,/useful note/);
});
test('bookmark sample has duplicate, unrecognized URL, missing title and URL-less records', () => {
  const p=parseImport(bookmarkSample,'csv'), v=previewImport(p,guessMapping(p.headers),emptyWorkspace(),options);
  assert.equal(v.candidates.length,6); assert.equal(v.candidates[2].duplicate?.row,2); assert.equal(v.candidates[3].errors.length,0);assert.ok(v.candidates[3].urlWarning); assert.equal(v.candidates[4].missingTitle,true); assert.equal(v.candidates[5].errors.length,0); assert.equal(v.candidates[5].url,undefined);
});
test('reading workflow permits URL-less records and combines tags', () => {
  const p=parseImport(readingSample,'tsv'), v=previewImport(p,guessMapping(p.headers),emptyWorkspace(),{...options,commonTags:'Imported|Design'});
  assert.equal(v.candidates.length,3); assert.ok(v.candidates.every(c=>!c.errors.length)); assert.deepEqual(v.candidates[0].tags,['Design','Books','Imported']);
});
test('URL matching preserves resource-identifying query and fragments', () => {
  assert.notEqual(urlKey('https://example.com/watch?v=a'),urlKey('https://example.com/watch?v=b')); assert.notEqual(urlKey('https://example.com/a#one'),urlKey('https://example.com/a#two'));
});
test('preview identifies workspace duplicates, unknown statuses/types, and repeated source rows without mutation', () => {
  const w=demoWorkspace(), before=JSON.stringify(w), p=parseImport('title,url,status,tag type\nChanged,https://example.com/0,Review,Issue\nChanged,https://example.com/0,Review,Issue','csv');
  const v=previewImport(p,guessMapping(p.headers),w,options);
  assert.equal(v.candidates[0].duplicate?.kind,'workspace'); assert.equal(v.candidates[1].repeatedRow,2); assert.deepEqual(v.unknownStatuses,['Review']); assert.deepEqual(v.unknownTypes,['Issue']); assert.equal(JSON.stringify(w),before);
});
test('product JSON requires version and preserves full restore data', () => {
  const w=demoWorkspace(), backup={format:'bubble-tag',version:1,workspace:w,media:[]};
  const p=parseImport(JSON.stringify(backup),'json'); assert.equal(p.restore?.workspace.memberships.length,w.memberships.length);
  assert.throws(()=>parseImport('{"bookmarks":[]}', 'json'),/versioned/);
});
test('empty input and HTML without bookmarks return useful errors', () => {
  assert.throws(()=>parseImport(' '),/Paste/); assert.throws(()=>parseImport('<html><p>Hello</p></html>','html'),/No bookmark/);
});
test('backup rejects missing uploaded media and repeated media entries',()=>{
 const w=demoWorkspace();w.bubbles[0].asset={source:'local',kind:'image',blobId:'image',filename:'image.png'};
 assert.throws(()=>parseImport(JSON.stringify({format:'bubble-tag',version:1,workspace:w,media:[]}),'json'),/missing local media/);
 const media={id:'image',filename:'image.png',mime:'image/png',base64:'AA=='};
 assert.throws(()=>parseImport(JSON.stringify({format:'bubble-tag',version:1,workspace:w,media:[media,media]}),'json'),/repeated media/);
});
