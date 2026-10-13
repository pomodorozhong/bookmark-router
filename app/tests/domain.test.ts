import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { WorkspaceStore } from '../src/domain/storage';
import { applyCommand, ConflictError } from '../src/domain/commands';
import { validateWorkspace, appearanceFor } from '../src/domain/model';
import { demoWorkspace } from '../src/domain/samples';
test('fixtures satisfy model and appearance inherits from type',()=>{ const w=demoWorkspace();validateWorkspace(w);assert.equal(appearanceFor(w.tags[0],w).shape,'circle'); });
test('memberships reject dangling references and duplicate pairs',()=>{ const w=demoWorkspace();w.memberships.push({...w.memberships[0],id:'duplicate'});assert.throws(()=>validateWorkspace(w),/repeated membership/);w.memberships.pop();w.memberships[0].tagId='absent';assert.throws(()=>validateWorkspace(w),/dangling/); });
test('schema, unknown status and dangerous media URLs reject',()=>{ const w=demoWorkspace();w.bubbles[0].statusId='absent';assert.throws(()=>validateWorkspace(w),/status/);w.bubbles[0].statusId='pending';w.bubbles[0].asset={kind:'image',source:'remote',url:'javascript:alert(1)'};assert.throws(()=>validateWorkspace(w),/HTTP/); });
test('commands preserve source, check revisions, and validate patch',()=>{ const w=demoWorkspace(), before=JSON.stringify(w);const next=applyCommand(w,0,{type:'bubble.patch',id:'bubble-0',expectedRecordRevision:0,patch:{title:'Edited'}});assert.equal(next.bubbles[0].title,'Edited');assert.equal(next.revision,1);assert.equal(JSON.stringify(w),before);assert.throws(()=>applyCommand(w,1,{type:'membership.set',bubbleId:'bubble-0',tagId:'tag-0',linked:true}),ConflictError);assert.equal(applyCommand(w,0,{type:'bubble.patch',id:'bubble-0',expectedRecordRevision:0,patch:{url:'file:///private'}}).bubbles[0].url,'file:///private'); });
test('bulk tag status requires the exact reviewed linked bubble set',()=>{ const w=demoWorkspace(), linked=w.memberships.filter(m=>m.tagId==='tag-0').map(m=>m.bubbleId);assert.throws(()=>applyCommand(w,0,{type:'tag.status',id:'tag-0',statusId:'done',reviewedBubbleRevisions:{}}),ConflictError);const next=applyCommand(w,0,{type:'tag.status',id:'tag-0',statusId:'done',reviewedBubbleRevisions:Object.fromEntries(linked.map(id=>[id,0]))});assert.equal(next.tags[0].statusId,'done');assert.ok(next.bubbles.filter(b=>linked.includes(b.id)).every(b=>b.statusId==='done'));assert.equal(next.bubbles[5].statusId,'pending'); });
test('tag-only status leaves bubbles independent and removing status reassigns',()=>{ const w=demoWorkspace();const next=applyCommand(w,0,{type:'tag.status',id:'tag-0',statusId:'done'});assert.equal(next.bubbles[0].statusId,'pending');const removed=applyCommand(next,1,{type:'status.remove',id:'pending',replacementId:'in-progress'});assert.ok(!removed.statuses.some(s=>s.id==='pending'));assert.ok(!removed.bubbles.some(b=>b.statusId==='pending')); });
test('IndexedDB survives reopening, rejects cross-tab stale writes and keeps geometry separate',async()=>{
 const name=`test-${crypto.randomUUID()}`, w=demoWorkspace(), first=new WorkspaceStore(name), second=new WorkspaceStore(name);
 await first.create(w); const next=await first.command(w.id,0,{type:'bubble.patch',id:'bubble-0',expectedRecordRevision:0,patch:{title:'Persisted'}});
 await assert.rejects(second.command(w.id,0,{type:'bubble.patch',id:'bubble-1',expectedRecordRevision:0,patch:{title:'Stale'}}),ConflictError);
 await first.saveGeometry({workspaceId:w.id,positions:{'bubble-0':{x:1,y:2,pinned:true}}});assert.equal((await first.get(w.id))?.revision,next.revision);
 await first.close();await second.close();const reopened=new WorkspaceStore(name);assert.equal((await reopened.get(w.id))?.bubbles[0].title,'Persisted');assert.equal((await reopened.getGeometry(w.id))?.positions['bubble-0'].pinned,true);await reopened.close();
});
test('simultaneous writes serialize and exactly one same-revision command succeeds',async()=>{
 const name=`test-${crypto.randomUUID()}`, a=new WorkspaceStore(name),b=new WorkspaceStore(name),w=demoWorkspace();await a.create(w);
 const results=await Promise.allSettled([a.command(w.id,0,{type:'membership.set',bubbleId:'bubble-11',tagId:'tag-0',linked:true}),b.command(w.id,0,{type:'membership.set',bubbleId:'bubble-11',tagId:'tag-1',linked:true})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await a.get(w.id))?.revision,1);await a.close();await b.close();
});
test('bubble/tag IDs cannot collide and malformed saved views reject',()=>{
 const w=demoWorkspace();w.tags[0].id=w.bubbles[0].id;assert.throws(()=>validateWorkspace(w),/globally unique/);
 const other=demoWorkspace();other.views=[{id:'view',name:'Test',filter:{op:'distance',tagIds:['absent'],hops:3},sort:'title',hiddenTagIds:[]}];assert.throws(()=>validateWorkspace(other),/distance/);
});
test('runtime patch cannot replace identity or revision',()=>{
 const w=demoWorkspace();assert.throws(()=>applyCommand(w,0,{type:'bubble.patch',id:'bubble-0',expectedRecordRevision:0,patch:{id:'hijacked'} as never}),/unsupported fields/);
});
test('appearance overrides inherit by field and can update type defaults',()=>{
 const w=demoWorkspace();
 const tag=w.tags[0];
 const next=applyCommand(w,0,{type:'tag.patch',id:tag.id,expectedRecordRevision:0,patch:{appearance:{size:110,shape:'diamond'}}});
 assert.equal(appearanceFor(next.tags[0],next).size,110);
 assert.equal(appearanceFor(next.tags[0],next).shape,'diamond');
 assert.equal(appearanceFor(next.tags[0],next).color,tag.appearance.color);
 const inherited=applyCommand(next,1,{type:'tag.patch',id:tag.id,expectedRecordRevision:1,patch:{appearance:{}}});
 assert.equal(appearanceFor(inherited.tags[0],inherited).size,64);
 const typed=applyCommand(inherited,2,{type:'tag-type.patch',id:'topic',patch:{appearance:{shape:'rounded-square',size:88}}});
 assert.equal(appearanceFor(typed.tags[1],typed).shape,'rounded-square');
 assert.equal(appearanceFor(typed.tags[1],typed).size,88);
});
test('reviewed bulk status changes record an undo and reject later edits',()=>{
 const w=demoWorkspace();
 const targets=[w.tags[0],w.bubbles[0]];
 const changed=applyCommand(w,0,{type:'status.bulk',source:'tag',targetIds:targets.map(r=>r.id),statusId:'done',reviewedRecordRevisions:Object.fromEntries(targets.map(r=>[r.id,r.revision]))});
 assert.equal(changed.tags[0].statusId,'done');
 assert.equal(changed.bubbles[0].statusId,'done');
 const change=changed.settings.statusHistory![0];
 const undone=applyCommand(changed,1,{type:'status.undo',changeId:change.id,reviewedRecordRevisions:change.afterRevisions});
 assert.equal(undone.tags[0].statusId,'pending');
 assert.equal(undone.bubbles[0].statusId,'pending');
 assert.equal(undone.settings.statusHistory?.length,0);
 const changedAgain=applyCommand(w,0,{type:'status.bulk',source:'selection',targetIds:['bubble-0'],statusId:'done',reviewedRecordRevisions:{'bubble-0':0}});
 const record=changedAgain.bubbles[0];
 record.revision++;
 assert.throws(()=>applyCommand(changedAgain,1,{type:'status.undo',changeId:changedAgain.settings.statusHistory![0].id,reviewedRecordRevisions:changedAgain.settings.statusHistory![0].afterRevisions}),ConflictError);
});
