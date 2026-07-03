import { NextRequest, NextResponse } from 'next/server';
import { todoDB, subtaskDB, tagDB, SYSTEM_USER_ID } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid format: expected array' }, { status: 400 });
    }

    let count = 0;

    for (const item of body) {
      if (!item.title || typeof item.title !== 'string') continue;

      const todo = todoDB.create({
        title: item.title,
        priority: ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium',
        due_date: item.due_date ?? null,
        is_recurring: !!item.is_recurring,
        recurrence_pattern: item.recurrence_pattern ?? null,
        reminder_minutes: item.reminder_minutes ?? null,
      });

      if (item.completed) {
        todoDB.update(todo.id, { completed: true });
      }

      if (Array.isArray(item.subtasks)) {
        for (const sub of item.subtasks) {
          if (sub.title) subtaskDB.create({ todoId: todo.id, title: sub.title });
        }
      }

      if (Array.isArray(item.tags)) {
        const tagIds: number[] = [];
        for (const tagData of item.tags) {
          if (!tagData.name) continue;
          let tag = tagDB.findByUserAndName(SYSTEM_USER_ID, tagData.name);
          if (!tag) {
            tag = tagDB.create({ userId: SYSTEM_USER_ID, name: tagData.name, color: tagData.color ?? '#3B82F6' });
          }
          tagIds.push(tag.id);
        }
        if (tagIds.length) tagDB.setTodoTags(todo.id, tagIds);
      }

      count++;
    }

    return NextResponse.json({ message: `Successfully imported ${count} todo${count !== 1 ? 's' : ''}`, count });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ error: 'Failed to import todos. Please check the file format.' }, { status: 400 });
  }
}
