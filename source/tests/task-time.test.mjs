import test from 'node:test';
import assert from 'node:assert/strict';
import { appendTimeEntry, descendantTasks, detachRemovedParents, elapsedSeconds, entryMatches, parentError, restoreFocusSession } from '../lib/task-time.ts';
import { createEmptyWorkspaceState, workspaceStateSchema } from '../lib/workspace-state-schema.ts';

const task = (id, extra = {}) => ({ id, title: id, area: '课内', source: '测试', done: false, today: true, elapsed: 0, ...extra });
const node = { id: 'paper-node', title: '结课论文', date: '2026-09-17', time: '18:00', location: '', requirements: '保留要求', area: '课内', done: false };

test('elapsed time follows timestamps across throttling, pauses, and custom durations', () => {
  const s = { id: 'round', target: {kind:'task',id:'t'}, mode:'pomodoro', duration: 600, elapsed: 20, startedAt: 1000 };
  assert.equal(elapsedSeconds(s, 91000), 110);
  assert.equal(elapsedSeconds(s, 9001000), 600);
  assert.equal(elapsedSeconds({...s,startedAt:null}, 9001000), 20);
  assert.equal(elapsedSeconds({...s,startedAt:95000}, 91000), 20);
  assert.equal(elapsedSeconds({...s,mode:'stopwatch'}, 9001000), 9020);
  assert.equal(elapsedSeconds({...s,mode:'stopwatch'}, 900001000), 86400);
  assert.deepEqual(restoreFocusSession(s), s);
  assert.equal(restoreFocusSession({...s,elapsed:-1}), null);
  assert.equal(restoreFocusSession({...s,target:{kind:'other',id:'t'}}), null);
});
test('completion is idempotent; tasks and course nodes have independent totals', () => {
  const state = { ...createEmptyWorkspaceState(), tasks:[task('same')], milestones:[{...node,id:'same'}] };
  const entry = {id:'one',taskId:'same',targetKind:'task',minutes:7,date:'2026-09-17',mode:'pomodoro'};
  const once = appendTimeEntry(state,entry);
  assert.equal(once.tasks[0].elapsed,7);
  assert.equal(once.milestones[0].elapsed,undefined);
  assert.equal(appendTimeEntry(once,entry),once);
  const twice=appendTimeEntry(once,{...entry,id:'two',targetKind:'milestone',minutes:13});
  assert.equal(twice.tasks[0].elapsed,7);
  assert.equal(twice.milestones[0].elapsed,13);
  assert.equal(entryMatches({...entry,targetKind:undefined},{kind:'task',id:'same'}),true);
  assert.equal(entryMatches(entry,{kind:'milestone',id:'same'}),false);
  for (const minutes of [0,-1,1.5,1441,NaN]) assert.throws(()=>appendTimeEntry(state,{...entry,minutes}));
  assert.throws(()=>appendTimeEntry(state,{...entry,taskId:'missing'}));
});
test('parent hierarchies reject cycles and missing targets, without double-counting descendants', () => {
  const tasks=[task('p',{elapsed:10}),task('c',{parentId:'p',elapsed:20}),task('g',{parentId:'c',elapsed:5}),task('n',{parentMilestoneId:'paper-node',elapsed:8})];
  assert.equal(parentError(tasks,[node]),'');
  assert.deepEqual(descendantTasks(tasks,{kind:'task',id:'p'}).map(t=>t.id),['c','g']);
  assert.deepEqual(descendantTasks(tasks,{kind:'milestone',id:node.id}).map(t=>t.id),['n']);
  assert.ok(parentError([task('p',{parentId:'c'}),task('c',{parentId:'p'})],[]));
  assert.ok(parentError([task('p',{parentId:'p'})],[]));
  assert.ok(parentError([task('p',{parentId:'missing'})],[]));
  assert.ok(parentError([task('n',{parentId:'p',parentMilestoneId:node.id}),task('p')],[node]));
});
test('legacy task data and rich records survive schema save/export/restore with the new fields', () => {
  const legacy={...createEmptyWorkspaceState(),tasks:[task('paper',{elapsed:43,progressLogs:[{id:'log',date:'2026-09-16',progress:30,status:'进行中',note:'原进度'}]})],milestones:[node]};
  assert.deepEqual(workspaceStateSchema.parse(legacy),legacy);
  const blocks=[{id:'note',type:'text',text:'审稿意见',embeddedFiles:[{id:'f',url:'https://example.blob.vercel-storage.com/attachments/owner/draft.pdf',fileName:'论文.pdf',fileSize:100,mimeType:'application/pdf',uploadedAt:'2026-09-17'}]}];
  const updated={...legacy,tasks:[{...legacy.tasks[0],blocks},task('review',{parentId:'paper',blocks}),task('node-review',{parentMilestoneId:node.id,blocks})],milestones:[{...node,blocks,elapsed:10}],focusSettings:{minutes:45,sound:true,volume:60},timeEntries:[{id:'time',taskId:node.id,targetKind:'milestone',minutes:10,date:'2026-09-17',mode:'manual',note:'修改引言'}]};
  assert.deepEqual(workspaceStateSchema.parse(JSON.parse(JSON.stringify(updated))),updated);
  assert.equal(workspaceStateSchema.safeParse({...updated,focusSettings:{...updated.focusSettings,minutes:0}}).success,false);
  assert.equal(workspaceStateSchema.safeParse({...updated,tasks:[task('review',{parentId:'review'})]}).success,false);
});

test('removing a parent preserves child records and only detaches the deleted relationship', () => {
  const child=task('child',{parentId:'parent',elapsed:42,blocks:[{id:'b',type:'text',text:'保留审稿笔记'}]});
  const nodeChild=task('node-child',{parentMilestoneId:node.id,elapsed:13});
  const nested=task('nested',{parentId:'child'});
  const previous={tasks:[task('parent'),child,nodeChild,nested],milestones:[node]};
  assert.equal(detachRemovedParents(previous,previous),previous.tasks);
  const tasks=detachRemovedParents(previous,{tasks:[child,nodeChild,nested],milestones:[]});
  assert.deepEqual(tasks[0],task('child',{elapsed:42,blocks:child.blocks}));
  assert.deepEqual(tasks[1],task('node-child',{elapsed:13}));
  assert.equal(tasks[2],nested);
  assert.equal(parentError(tasks,[]),'');
  assert.equal(child.parentId,'parent');
});
