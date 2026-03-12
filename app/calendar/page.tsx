"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Todo = {
  id: number;
  title: string;
  description: string | null;
  priority: "high" | "medium" | "low";
  recurrence_pattern: "daily" | "weekly" | "monthly" | "yearly" | null;
  due_date: string | null;
  completed: 0 | 1;
  created_at: string;
  updated_at: string;
};

export default function CalendarPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    void fetchTodos();
  }, []);

  async function fetchTodos() {
    setIsLoading(true);

    try {
      const response = await fetch("/api/todos", { method: "GET" });
      const payload = (await response.json()) as {
        data?: Todo[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to fetch todos.");
      }

      setTodos(payload.data ?? []);
    } catch {
      // Error handled by isLoading state
    } finally {
      setIsLoading(false);
    }
  }

  const monthName = currentDate.toLocaleString("en-US", { month: "long" });
  const year = currentDate.getFullYear();

  const firstDay = new Date(year, currentDate.getMonth(), 1);
  const lastDay = new Date(year, currentDate.getMonth() + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const getTodosForDate = (day: number): Todo[] => {
    const dateStr = `${year}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return todos.filter((todo) => {
      if (!todo.due_date) return false;
      const todoDueDateStr = todo.due_date.split("T")[0];
      return todoDueDateStr === dateStr;
    });
  };

  const handlePrevMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1),
    );
  };

  const handleNextMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1),
    );
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarDays.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const priorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "#EF4444";
      case "medium":
        return "#F59E0B";
      case "low":
        return "#3B82F6";
      default:
        return "#6B7280";
    }
  };

  return (
    <main>
      <div className="container stack">
        <header className="stack">
          <div className="row between">
            <div>
              <h1>Calendar View</h1>
              <p className="muted">Visualize your todos on a monthly calendar.</p>
            </div>
            <Link href="/">
              <button className="secondary">📋 Back to List</button>
            </Link>
          </div>
        </header>

        <section className="card">
          <div className="row between" style={{ marginBottom: "1rem", alignItems: "center" }}>
            <button className="secondary" onClick={handlePrevMonth}>
              ◀ Previous
            </button>
            <h2 style={{ margin: 0 }}>
              {monthName} {year}
            </h2>
            <div className="row">
              <button className="secondary" onClick={handleToday}>
                Today
              </button>
              <button className="secondary" onClick={handleNextMonth}>
                Next ▶
              </button>
            </div>
          </div>

          {isLoading ? (
            <p className="muted">Loading...</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {weekDays.map((day) => (
                      <th
                        key={day}
                        style={{
                          padding: "0.5rem",
                          textAlign: "center",
                          backgroundColor: "#F3F4F6",
                          fontWeight: "bold",
                        }}
                      >
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: Math.ceil(calendarDays.length / 7) }).map(
                    (_, weekIndex) => (
                      <tr key={weekIndex}>
                        {calendarDays
                          .slice(weekIndex * 7, (weekIndex + 1) * 7)
                          .map((day, dayIndex) => (
                            <td
                              key={`${weekIndex}-${dayIndex}`}
                              style={{
                                padding: "0.5rem",
                                border: "1px solid #D1D5DB",
                                verticalAlign: "top",
                                minHeight: "120px",
                                backgroundColor: day === null ? "#F9FAFB" : "white",
                              }}
                            >
                              {day !== null && (
                                <div>
                                  <div
                                    style={{
                                      fontWeight: "bold",
                                      marginBottom: "0.5rem",
                                      color: "#1F2937",
                                    }}
                                  >
                                    {day}
                                  </div>
                                  <div style={{ fontSize: "0.875rem" }}>
                                    {getTodosForDate(day).map((todo) => (
                                      <div
                                        key={todo.id}
                                        style={{
                                          padding: "0.25rem 0.5rem",
                                          marginBottom: "0.25rem",
                                          backgroundColor: priorityColor(todo.priority),
                                          color: "white",
                                          borderRadius: "0.25rem",
                                          fontSize: "0.75rem",
                                          textDecoration: todo.completed ? "line-through" : "none",
                                          cursor: "pointer",
                                        }}
                                        title={todo.title}
                                      >
                                        {todo.title.length > 15
                                          ? `${todo.title.substring(0, 15)}...`
                                          : todo.title}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </td>
                          ))}
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #D1D5DB" }}>
            <p style={{ fontSize: "0.875rem", color: "#6B7280", marginBottom: "0.5rem" }}>
              Legend
            </p>
            <div className="row" style={{ gap: "1rem", fontSize: "0.875rem" }}>
              <div className="row" style={{ gap: "0.5rem", alignItems: "center" }}>
                <div
                  style={{
                    width: "12px",
                    height: "12px",
                    backgroundColor: "#EF4444",
                    borderRadius: "2px",
                  }}
                />
                <span>High Priority</span>
              </div>
              <div className="row" style={{ gap: "0.5rem", alignItems: "center" }}>
                <div
                  style={{
                    width: "12px",
                    height: "12px",
                    backgroundColor: "#F59E0B",
                    borderRadius: "2px",
                  }}
                />
                <span>Medium Priority</span>
              </div>
              <div className="row" style={{ gap: "0.5rem", alignItems: "center" }}>
                <div
                  style={{
                    width: "12px",
                    height: "12px",
                    backgroundColor: "#3B82F6",
                    borderRadius: "2px",
                  }}
                />
                <span>Low Priority</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
