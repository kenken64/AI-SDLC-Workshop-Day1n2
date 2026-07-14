'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { generateCalendarGrid, type CalendarDay } from '@/lib/calendar';
import type { Holiday, Todo } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DayData {
  day: CalendarDay;
  todos: Todo[];
  holiday: Holiday | undefined;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseMonthParam(raw: string | null): { year: number; month: number } {
  if (raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) {
    const [y, m] = raw.split('-').map(Number);
    return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString('en-SG', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Singapore',
  });
}

function prevMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function nextMonthOf(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

function todayMonthParam(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Priority colours (matches PRP 02 palette) ───────────────────────────────
const PILL_STYLE: Record<string, string> = {
  high:   'bg-red-100 text-red-700 border border-red-300 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800',
  medium: 'bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
  low:    'bg-sky-100 text-sky-700 border border-sky-300 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
};

const MAX_VISIBLE = 3;

// ─── Sub-components ───────────────────────────────────────────────────────────

function CalendarCell({ data, onClick }: { data: DayData; onClick: (date: string) => void }) {
  const { day, todos, holiday } = data;
  const dayNum = day.date.split('-')[2];
  const visible = todos.slice(0, MAX_VISIBLE);
  const overflow = todos.length - visible.length;

  const cellBase = 'relative min-h-[90px] w-full p-1.5 text-left cursor-pointer transition border-r border-b border-slate-200 dark:border-slate-700';
  const cellCond = [
    !day.isCurrentMonth && 'bg-slate-50/50 dark:bg-slate-900/30',
    day.isCurrentMonth && !day.isToday && !day.isWeekend && 'bg-white dark:bg-slate-950',
    day.isCurrentMonth && day.isWeekend && !day.isToday && 'bg-slate-50 dark:bg-slate-900/60',
    day.isToday && 'bg-blue-50 ring-2 ring-inset ring-blue-400 dark:bg-blue-950/40 dark:ring-blue-600',
    day.isPast && day.isCurrentMonth && !day.isToday && 'opacity-60',
  ].filter(Boolean).join(' ');

  return (
    <button type="button" className={`${cellBase} ${cellCond} hover:bg-blue-50/60 dark:hover:bg-blue-950/20`} onClick={() => onClick(day.date)}>
      <span
        className={`inline-block rounded-full text-xs font-semibold leading-5 w-5 h-5 text-center mb-0.5 ${
          day.isToday
            ? 'bg-blue-500 text-white'
            : day.isCurrentMonth
              ? 'text-slate-700 dark:text-slate-200'
              : 'text-slate-400 dark:text-slate-600'
        }`}
      >
        {dayNum}
      </span>

      {holiday && (
        <div className="truncate rounded-sm bg-emerald-100 px-1 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 mb-0.5">
          🇸🇬 {holiday.name}
        </div>
      )}

      <div className="space-y-0.5">
        {visible.map((t) => (
          <div
            key={t.id}
            className={`truncate rounded-sm px-1 text-[10px] font-medium leading-4 ${PILL_STYLE[t.priority] ?? ''}`}
            title={t.title}
          >
            {t.title}
          </div>
        ))}
        {overflow > 0 && (
          <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 pl-1">
            +{overflow} more
          </div>
        )}
      </div>
    </button>
  );
}

function DayTodosModal({
  date,
  todos,
  holiday,
  onClose,
}: {
  date: string;
  todos: Todo[];
  holiday: Holiday | undefined;
  onClose: () => void;
}) {
  const label = new Date(date + 'T12:00:00').toLocaleDateString('en-SG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Singapore',
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">Due on</p>
            <h2 className="mt-0.5 text-xl font-semibold tracking-tight">{label}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            Close
          </button>
        </div>

        {holiday && (
          <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            🇸🇬 {holiday.name}
          </div>
        )}

        {todos.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No todos due on this day.</p>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {todos.map((t) => (
              <div
                key={t.id}
                className={`flex items-center gap-3 rounded-2xl border p-3 ${
                  t.completed
                    ? 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40'
                    : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    t.priority === 'high' ? 'bg-red-500' : t.priority === 'low' ? 'bg-sky-500' : 'bg-amber-400'
                  }`}
                />
                <span
                  className={`flex-1 text-sm font-medium ${
                    t.completed ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-100'
                  }`}
                >
                  {t.title}
                </span>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${
                    t.priority === 'high'
                      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
                      : t.priority === 'low'
                        ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300'
                        : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
                  }`}
                >
                  {t.priority}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function CalendarPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { year, month } = parseMonthParam(searchParams.get('month'));

  const [todos, setTodos] = useState<Todo[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [todosRes, holidaysRes] = await Promise.all([
        fetch('/api/todos'),
        fetch(`/api/holidays?year=${year}&month=${month}`),
      ]);
      if (todosRes.ok) setTodos((await todosRes.json()) as Todo[]);
      if (holidaysRes.ok) {
        const data = (await holidaysRes.json()) as { holidays: Holiday[] };
        setHolidays(data.holidays);
      }
    })();
  }, [year, month]);

  const grid = generateCalendarGrid(year, month);
  const holidayMap = new Map(holidays.map((h) => [h.date, h]));

  const cells: DayData[] = grid.map((day) => ({
    day,
    todos: todos.filter((t) => t.due_date?.startsWith(day.date)),
    holiday: holidayMap.get(day.date),
  }));

  function navigate(y: number, m: number) {
    const param = `${y}-${String(m).padStart(2, '0')}`;
    router.replace(`/calendar?month=${param}`);
  }

  const prev = prevMonth(year, month);
  const next = nextMonthOf(year, month);
  const todayParam = todayMonthParam();
  const currentParam = `${year}-${String(month).padStart(2, '0')}`;

  const selectedTodos = selectedDate ? todos.filter((t) => t.due_date?.startsWith(selectedDate)) : [];
  const selectedHoliday = selectedDate ? holidayMap.get(selectedDate) : undefined;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.16),_transparent_34%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_56%,_#eff6ff_100%)] px-4 py-8 text-slate-900 dark:bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.2),_transparent_34%),linear-gradient(180deg,_#020617_0%,_#0f172a_56%,_#111827_100%)] dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-4">

        {/* Header */}
        <header className="rounded-[2rem] border border-white/60 bg-white/80 p-5 shadow-[0_20px_80px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/70">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-purple-600 dark:text-purple-400">Calendar</p>
              <h1 className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-3xl">{monthLabel(year, month)}</h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => navigate(prev.year, prev.month)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                ◀
              </button>
              <button
                type="button"
                onClick={() => router.replace(`/calendar?month=${todayParam}`)}
                disabled={currentParam === todayParam}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => navigate(next.year, next.month)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                ▶
              </button>
              <Link
                href="/"
                className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                ← List view
              </Link>
            </div>
          </div>
        </header>

        {/* Grid */}
        <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700">
            {DAY_HEADERS.map((h) => (
              <div
                key={h}
                className={`py-2 text-center text-xs font-semibold uppercase tracking-wide ${
                  h === 'Sun' || h === 'Sat'
                    ? 'text-slate-400 dark:text-slate-500'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {h}
              </div>
            ))}
          </div>

          {/* Calendar cells — always 42 (6×7) */}
          <div className="grid grid-cols-7">
            {cells.map((data) => (
              <CalendarCell key={data.day.date} data={data} onClick={setSelectedDate} />
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 px-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-400" /> High priority
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" /> Medium priority
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-400" /> Low priority
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-400" /> Public holiday
          </span>
        </div>
      </div>

      {/* Day-detail modal */}
      {selectedDate && (
        <DayTodosModal
          date={selectedDate}
          todos={selectedTodos}
          holiday={selectedHoliday}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </main>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarPageInner />
    </Suspense>
  );
}
