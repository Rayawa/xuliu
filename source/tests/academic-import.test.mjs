import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseAcademicRows, academicCourseTitle } from "../lib/academic-import.ts";
import { courseContentPreserved, updateAcademicCourses } from "../lib/academic-course-update.ts";
import { courseRunsInTimetableWeek } from "../lib/timetable.ts";

const rows = JSON.parse(fs.readFileSync(new URL("./fixtures/bit-grid.json", import.meta.url), "utf8"));
const parsed = parseAcademicRows(rows, "bit");
const byTitle = (title) => parsed.find((course) => course.title === title);
test("BIT export: all courses, multiple courses per cell, class variants and repeated long lessons", () => {
  assert.equal(parsed.length, 12);
  assert.equal(parsed.reduce((sum, item) => sum + item.schedule.length, 0), 25);
  assert.equal(byTitle("会计学专业导论").schedule.length, 4);
  assert.deepEqual(byTitle("会计学专业导论").schedule[0], {weekday:2,start:"08:00",end:"11:30",location:"文萃楼M135",weeks:"-2周",source:"bit"});
  assert.deepEqual(byTitle("会计学专业导论").schedule[1], {weekday:1,start:"13:20",end:"16:50",location:"文萃楼M135",weeks:"-2周",source:"bit"});
  assert.equal(byTitle("概率论与数理统计").schedule.length, 2);
  assert.equal(byTitle("大数据分析（全英文）").schedule.length, 2);
  assert.equal(byTitle("气候与社会").schedule[0].end, "20:05");
  assert.equal(byTitle("气候与社会").schedule[1].end, "20:55");
  assert.equal(academicCourseTitle("（本）101341436-会计学基础（全英文）[01S01]"), "会计学基础（全英文）");
  assert.equal(academicCourseTitle("形势与政策Ⅲ"), "形势与政策Ⅲ");
});
test("discontinuous and negative week rules remain distinct", () => {
  const slots = byTitle("文献检索").schedule;
  assert.equal(slots.filter(s => courseRunsInTimetableWeek(s.weeks, -1)).length, 3);
  assert.equal(slots.filter(s => courseRunsInTimetableWeek(s.weeks, -2)).length, 1);
  assert.equal(slots.filter(s => courseRunsInTimetableWeek(s.weeks, 1)).length, 0);
  const rule=byTitle("会计学基础（全英文）").schedule[0].weeks;
  assert.equal(rule,"1周、4-10周、12-15周");
  for (const week of [1,4,10,12,15]) assert.equal(courseRunsInTimetableWeek(rule,week),true);
  for (const week of [-1,2,3,11,16]) assert.equal(courseRunsInTimetableWeek(rule,week),false);
});
test("reimport retains every course ID, notes, attachments, milestones and progress; second import is idempotent", () => {
  let seq=0;
  const notes=[{id:"note",type:"text",text:"重要笔记",embeddedFiles:[{id:"file",url:"https://example.org/file",fileName:"作业.pdf"}]}];
  const manual={id:"manual",weekday:6,start:"08:00",end:"09:00",location:"自习",source:"manual"};
  const original=[{id:"keep",title:"（本）101341432-会计学专业导论[01]",school:"bit",blocks:notes,progress:45,requirements:"我的要求",schedule:[{id:"wrong",weekday:2,start:"08:00",end:"09:35",location:"错误旧地点",weeks:"-2周",source:"bit"},manual]},
    {id:"other-school",title:"会计学专业导论",school:"pku",blocks:notes,schedule:[]},
    {id:"duplicate-with-notes",title:"101341432-会计学专业导论[02]",school:"bit",blocks:[{id:"other-note",text:"另一份笔记"}],schedule:[]},
    {id:"not-in-file",title:"我的其他课程",school:"bit",blocks:notes,schedule:[]}];
  const milestones=[{id:"node",courseId:"keep",requirements:"已有节点"}];
  const before=structuredClone({original,milestones});
  const options={replaceSchedules:true,id:()=>`new-${++seq}`,create:(draft,schedule)=>({id:`course-${++seq}`,title:draft.title,school:draft.school,blocks:[],schedule})};
  const next=updateAcademicCourses(original,parsed,options);
  assert.equal(courseContentPreserved(original,next),true);
  assert.equal(next[0].id,"keep");
  assert.equal(next[0].title,"会计学专业导论");
  assert.equal(next[0].schedule.length,5);
  assert.ok(next[0].schedule.includes(manual));
  assert.strictEqual(next[1],original[1]);
  assert.strictEqual(next[3],original[3]);
  assert.deepEqual(next[2].blocks,original[2].blocks);
  assert.deepEqual({original,milestones},before);
  assert.deepEqual(updateAcademicCourses(next,parsed,options),next);
});
test("merge distinguishes identical times in different weeks", () => {
  let id=0; const options={replaceSchedules:false,id:()=>String(++id),create:(draft,schedule)=>({id:String(++id),title:draft.title,school:draft.school,schedule})};
  const result=updateAcademicCourses([], [byTitle("文献检索")], options);
  assert.equal(result[0].schedule.length,4);
  assert.deepEqual(updateAcademicCourses(result,[byTitle("文献检索")],options),result);
});
