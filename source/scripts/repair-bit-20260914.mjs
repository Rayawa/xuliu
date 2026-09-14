// One-time, user-requested maintenance. Runs only after a successful production build.
// Removed from the next release after the repair has been verified.
import fs from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { Redis } from "@upstash/redis";
import { workspaceStateSchema } from "../lib/workspace-state-schema.ts";
import { academicCourseKey } from "../lib/academic-import.ts";
import { updateAcademicCourses, courseContentPreserved } from "../lib/academic-course-update.ts";

if (process.env.VERCEL_ENV !== "production" || process.env.XULIU_APPLY_BIT_REPAIR !== "approved-20260914") { console.log("BIT repair: disabled. Local trial does not write cloud data."); process.exit(0); }
const redis = new Redis({url:process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL, token:process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN});
const key = "xuliu-ai-v1:workspace:owner";
const historyKey = "xuliu-ai-v1:workspace:history:owner";
const markerKey = "xuliu-ai-v1:maintenance:bit-20260914:complete:owner";
const backupKey = "xuliu-ai-v1:maintenance:bit-20260914:backup:owner";
const drafts = JSON.parse(fs.readFileSync(new URL("./bit-20260914.json", import.meta.url), "utf8"));
assert.equal(drafts.length, 12);
assert.equal(drafts.reduce((n,c)=>n+c.schedule.length,0),25);
if (await redis.get(markerKey)) { console.log("BIT repair: already applied; no writes."); process.exit(0); }
const atomicRepair = `
if redis.call("EXISTS", KEYS[3]) == 1 then return 2 end
local current = redis.call("GET", KEYS[1])
if not current then return -2 end
local decoded = cjson.decode(current)
if tonumber(decoded["revision"] or 0) ~= tonumber(ARGV[1]) then return -1 end
if redis.call("EXISTS", KEYS[4]) == 1 then return -3 end
redis.call("SET", KEYS[4], current)
redis.call("LPUSH", KEYS[2], current)
redis.call("LTRIM", KEYS[2], 0, 9)
redis.call("SET", KEYS[1], ARGV[2])
redis.call("SET", KEYS[3], ARGV[3])
return 1
`;
for (let attempt=0; attempt<3; attempt++) {
  const record=await redis.get(key);
  assert.ok(record?.data?.courses?.length, "Expected an existing owner workspace; refusing an empty-data repair.");
  workspaceStateSchema.parse(record.data);
  const before=record.data;
  const matched=before.courses.filter(c=>(c.school === "bit" || c.schedule.some(s=>s.source === "bit")) && drafts.some(d=>academicCourseKey(d.title)===academicCourseKey(c.title)));
  assert.ok(matched.length>=8, "Too few existing BIT courses matched; no data changed.");
  const courses=updateAcademicCourses(before.courses,drafts,{replaceSchedules:true,id:randomUUID,create:(draft,schedule)=>({id:randomUUID(),title:draft.title,term:"2026 秋季",teacher:draft.teacher,location:draft.location,school:"bit",progress:0,requirements:"",blocks:[],schedule})});
  assert.ok(courseContentPreserved(before.courses,courses), "Course content changed; refusing repair.");
  const after={...before,courses};
  workspaceStateSchema.parse(after);
  for (const field of Object.keys(before)) if(field!=="courses") assert.deepEqual(after[field],before[field]);
  const revision=record.revision+1;
  const audit={appliedAt:new Date().toISOString(),revision,previousRevision:record.revision,coursesBefore:before.courses.length,coursesAfter:courses.length,matchedCourses:matched.length,importedCourses:12,importedSlots:25,preservedCourseIds:before.courses.map(c=>c.id),notesPreserved:true,milestonesPreserved:true,backupKey};
  const next={...record,data:after,revision,updatedAt:audit.appliedAt};
  const result=Number(await redis.eval(atomicRepair,[key,historyKey,markerKey,backupKey],[String(record.revision),JSON.stringify(next),JSON.stringify(audit)]));
  if(result===-1) continue;
  if(result===2) { console.log("BIT repair: already applied; no writes."); process.exit(0); }
  assert.equal(result,1,"Atomic repair was not applied.");
  const backup=await redis.get(backupKey);
  const saved=await redis.get(key);
  assert.deepEqual(backup.data,before);
  assert.ok(saved.revision>=revision);
  if(saved.revision===revision) assert.deepEqual(saved.data,after);
  const noteHash=createHash("sha256").update(JSON.stringify(before.courses.map(c=>[c.id,c.blocks]))).digest("hex");
  console.log(JSON.stringify({operation:"BIT timetable repair",status:"applied",revision,coursesBefore:before.courses.length,coursesAfter:courses.length,matchedCourses:matched.length,importedCourses:12,importedSlots:25,notesPreserved:true,noteHash,backupVerified:true,milestonesPreserved:true}));
  process.exit(0);
}
throw new Error("Workspace changed during every attempt; no repair applied.");
