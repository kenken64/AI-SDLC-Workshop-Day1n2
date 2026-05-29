"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface Todo {
  id: string;
  title: string;
  completed: boolean;
  due_date: string | null;
  priority: "high" | "medium" | "low";
}

interface Holiday {
  id: number;
  date: string;
  name: string;
}

function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthKey(month: string): Date {
  const [year, monthNum] = month.split("-").map(Number);
  return new Date(year, monthNum - 1, 1);
}

export default function CalendarPage() {
  const router = useRouter();

  const [monthKey, setMonthKey] = useState<string>(toMonthKey(new Date()));
  const [todos, setTodos] = useState<Todo[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("month");
    if (fromUrl && /^\d{4}-\d{2}$/.test(fromUrl)) {
      setMonthKey(fromUrl);
    }
  }, []);

  useEffect(() => {
    router.replace(`/calendar?month=${monthKey}`);
  }, [monthKey, router]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setMessage(null);
      try {
        const [todosResponse, holidaysResponse] = await Promise.all([
          fetch(`/api/todos?month=${monthKey}&includeCompleted=true`),
          fetch(`/api/holidays?month=${monthKey}`),
        ]);

        const todosJson = (await todosResponse.json()) as { success: boolean; data?: Todo[]; error?: string };
        const holidaysJson = (await holidaysResponse.json()) as { success: boolean; data?: Holiday[]; error?: string };

        if (!todosResponse.ok || !todosJson.success) {
          setMessage(todosJson.error || "Failed to load todos");
        } else {
          setTodos(todosJson.data || []);
        }

        if (!holidaysResponse.ok || !holidaysJson.success) {
          setMessage((current) => current || holidaysJson.error || "Failed to load holidays");
        } else {
          setHolidays(holidaysJson.data || []);
        }
      } catch {
        setMessage("Failed to load calendar data");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [monthKey]);

  const monthDate = useMemo(() => parseMonthKey(monthKey), [monthKey]);

  const monthLabel = useMemo(
    () =>
      monthDate.toLocaleString("en-SG", {
        month: "long",
        year: "numeric",
        timeZone: "Asia/Singapore",
      }),
    [monthDate],
  );

  const cells = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const first = new Date(year, month, 1);
    const firstDay = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const output: Array<{ type: "empty" } | { type: "day"; day: number; dateKey: string }> = [];

    for (let i = 0; i < firstDay; i += 1) {
      output.push({ type: "empty" });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      output.push({
        type: "day",
        day,
        dateKey: `${monthKey}-${String(day).padStart(2, "0")}`,
      });
    }

    return output;
  }, [monthDate, monthKey]);

  const todosByDate = useMemo(() => {
    const map = new Map<string, Todo[]>();
    for (const todo of todos) {
      if (!todo.due_date) {
        continue;
      }
      const dateKey = todo.due_date.slice(0, 10);
      const list = map.get(dateKey) || [];
      list.push(todo);
      map.set(dateKey, list);
    }
    return map;
  }, [todos]);

  const holidayByDate = useMemo(() => {
    const map = new Map<string, Holiday>();
    for (const holiday of holidays) {
      map.set(holiday.date, holiday);
    }
    return map;
  }, [holidays]);

  const selectedTodos = selectedDateKey ? todosByDate.get(selectedDateKey) || [] : [];
  const selectedHoliday = selectedDateKey ? holidayByDate.get(selectedDateKey) : undefined;

  const shiftMonth = (offset: number) => {
    const next = new Date(monthDate);
    next.setMonth(next.getMonth() + offset);
    setMonthKey(toMonthKey(next));
  };

  return (
    <main className="container">
      <section className="card" style={{ padding: "1rem", marginTop: "0.75rem" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0 }}>Calendar</h1>
            <p className="muted" style={{ margin: "0.2rem 0 0" }}>
              {monthLabel}
            </p>
          </div>
          <div className="row">
            <button className="btn" onClick={() => shiftMonth(-1)}>
              Previous
            </button>
            <button className="btn" onClick={() => setMonthKey(toMonthKey(new Date()))}>
              Today
            </button>
            <button className="btn" onClick={() => shiftMonth(1)}>
              Next
            </button>
            <Link className="btn" href="/">
              Back
            </Link>
          </div>
        </div>

        {message ? <p style={{ color: "#a83322" }}>{message}</p> : null}
        {loading ? <p className="muted">Loading...</p> : null}

        <div className="calendar-grid" style={{ marginTop: "0.75rem" }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <strong key={day} className="muted" style={{ padding: "0.3rem" }}>
              {day}
            </strong>
          ))}

          {cells.map((cell, index) => {
            if (cell.type === "empty") {
              return <div key={`empty-${index}`} />;
            }

            const todosForDate = todosByDate.get(cell.dateKey) || [];
            const holiday = holidayByDate.get(cell.dateKey);
            const todayKey = new Date().toISOString().slice(0, 10);
            const isToday = cell.dateKey === todayKey;

            return (
              <button
                type="button"
                key={cell.dateKey}
                className={`calendar-cell ${isToday ? "today" : ""}`}
                onClick={() => setSelectedDateKey(cell.dateKey)}
              >
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <strong>{cell.day}</strong>
                  {todosForDate.length > 0 ? <span className="badge">{todosForDate.length}</span> : null}
                </div>
                {holiday ? <p style={{ margin: "0.35rem 0 0", color: "#8a5e00", fontSize: "0.8rem" }}>{holiday.name}</p> : null}
              </button>
            );
          })}
        </div>
      </section>

      {selectedDateKey ? (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Day details">
          <section className="card modal-content">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>{selectedDateKey}</h3>
              <button className="btn" onClick={() => setSelectedDateKey(null)}>
                Close
              </button>
            </div>

            {selectedHoliday ? (
              <p style={{ color: "#8a5e00" }}>
                Holiday: {selectedHoliday.name}
              </p>
            ) : null}

            {selectedTodos.length === 0 ? (
              <p className="muted">No todos due on this day.</p>
            ) : (
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {selectedTodos.map((todo) => (
                  <article className="card" key={todo.id} style={{ padding: "0.6rem" }}>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <strong>{todo.title}</strong>
                      <span className={`badge priority-${todo.priority}`}>{todo.priority}</span>
                    </div>
                    <p className="muted" style={{ margin: "0.3rem 0 0" }}>
                      {todo.completed ? "Completed" : "Pending"}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}
