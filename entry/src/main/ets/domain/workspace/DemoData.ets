import { Workspace } from '../../models/Workspace';
import { createEntry, localDate, addDays, uid } from './WorkspaceDomain';

export function appendDemo(data: Workspace): Workspace {
  const task = createEntry('tasks'); task.title = '整理本周学习计划'; task.area = '课内'; task.due = localDate();
  task.requirements = '把目标拆成今天能完成的一小步。'; task.progress = 20; task.status = '进行中';
  data.tasks.push(task);
  const long = createEntry('tasks'); long.title = '读完一本想读的书'; long.mode = 'multi'; long.startDate = localDate(); long.due = addDays(localDate(), 30);
  data.tasks.push(long);
  const course = createEntry('courses'); course.title = '学习方法'; course.teacher = '演示课程'; course.location = '自习室';
  course.schedule = [{ id: uid(), weekday: new Date().getDay() || 7, start: '14:00', end: '15:30', location: '自习室', source: 'manual' }];
  course.blocks = [{ id: uid(), type: 'heading', text: '本周主题', headingLevel: 2 }, { id: uid(), type: 'text', text: '用主动回忆代替重复阅读。' }];
  data.courses.push(course);
  const habit = createEntry('habits'); habit.title = '阅读十分钟'; data.habits.push(habit);
  const learning = createEntry('learning'); learning.title = '摄影'; learning.category = '兴趣'; learning.goal = '每周拍一组喜欢的照片'; data.learning.push(learning);
  const idea = createEntry('ideas'); idea.title = '把生活中有趣的问题记下来'; idea.note = '这是可编辑的演示记录，不包含上游个人数据。'; data.ideas.push(idea);
  const page = createEntry('thoughts'); page.title = '给未来的自己'; page.blocks = [{ id: uid(), type: 'text', text: '慢一点也没有关系，持续前进就好。' }]; data.pages.push(page);
  return data;
}
