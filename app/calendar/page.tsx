'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isSingaporePast } from '@/lib/timezone';

interface Todo {
  id: number;
  title: string;
  completed: number;
  priority: 'high' | 'medium' | 'low';
  due_date: string | null;
  is_recurring: number;
  recurrence_pattern: string | null;
}

interface Holiday {
  id: number;
  date: string;
  name: string;
  country: string;
}

const PRIORITY_BG: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-yellow-400',
  low: 'bg-blue-400',
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export default function CalendarPage() {
  const router = useRouter();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  useEffect(() => {
    fetch('/api/todos')
      .then(async (res) => { setTodos(await res.json()); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch(`/api/holidays?year=${year}&month=${month}`)
      .then(async res => { if (res.ok) setHolidays(await res.json()); })
      .catch(() => {});
  }, [year, month]);

  const todosWithDue = todos.filter(t => t.due_date);

  function getTodosForDay(day: number): Todo[] {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return todosWithDue.filter(t => t.due_date?.startsWith(dateStr));
  }

  function getHolidayForDay(day: number): Holiday | undefined {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return holidays.find(h => h.date === dateStr);
  }

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const monthName = new Date(year, month, 1).toLocaleString('en-SG', { month: 'long', year: 'numeric' });

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }
  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Loading…</p>
    </div>
  );

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')} className="text-blue-600 dark:text-blue-400 hover:underline text-sm">← Todos</button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">📅 Calendar</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="px-3 py-1 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">◀</button>
            <span data-testid="month-label" className="font-semibold text-gray-800 dark:text-gray-100 min-w-36 text-center">{monthName}</span>
            <button onClick={nextMonth} className="px-3 py-1 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">▶</button>
            <button onClick={goToday} className="px-3 py-1 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm hover:bg-blue-200">Today</button>
          </div>
        </div>

        {/* Calendar grid */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 bg-gray-100 dark:bg-gray-700">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">{d}</div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7">
            {/* Empty cells before first day */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-20 border-t border-r border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20" />
            ))}

            {/* Day cells */}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const dayTodos = getTodosForDay(day);
              const holiday = getHolidayForDay(day);
              const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
              const isPast = new Date(year, month, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());

              return (
                <div
                  key={day}
                  className={`min-h-20 p-1.5 border-t border-r border-gray-100 dark:border-gray-700 ${
                    isToday ? 'bg-blue-50 dark:bg-blue-950/30' :
                    holiday ? 'bg-amber-50 dark:bg-amber-950/20' :
                    isPast ? 'bg-gray-50/50 dark:bg-gray-900/10' : ''
                  }`}
                >
                  <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                    isToday ? 'bg-blue-600 text-white' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    {day}
                  </div>
                  {holiday && (
                    <div className="text-xs text-amber-700 dark:text-amber-400 truncate mb-0.5" title={holiday.name}>
                      &#x1F389; {holiday.name}
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {dayTodos.slice(0, 3).map(todo => (
                      <div
                        key={todo.id}
                        className={`text-xs text-white px-1 py-0.5 rounded truncate ${PRIORITY_BG[todo.priority]} ${todo.completed ? 'opacity-50 line-through' : ''} ${isSingaporePast(todo.due_date) && !todo.completed ? 'opacity-70' : ''}`}
                        title={todo.title}
                      >
                        {todo.title}
                      </div>
                    ))}
                    {dayTodos.length > 3 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">+{dayTodos.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 text-sm text-gray-600 dark:text-gray-400">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block" /> High</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-400 inline-block" /> Medium</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-400 inline-block" /> Low</span>
        </div>
      </div>
    </div>
  );
}
