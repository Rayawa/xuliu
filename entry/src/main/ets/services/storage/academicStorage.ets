import { ImportedCourse, updateAcademicCourses, courseContentPreserved } from '../../domain/courses/AcademicImport';
import { saveWithCheckpoint } from './storage';

export async function commitAcademicImport(drafts: ImportedCourse[], replace: boolean, term: string, school: string): Promise<void> {
  if (term.length > 500) throw new Error('学期名称最多500字');
  await saveWithCheckpoint((current) => {
    const courses = updateAcademicCourses(current.courses, drafts, replace, term);
    if (!courseContentPreserved(current.courses, courses)) throw new Error('课程内容校验未通过，未应用导入');
    current.courses = courses;
  }, school);
}
