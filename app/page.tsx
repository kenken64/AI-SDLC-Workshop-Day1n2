'use client';

/**
 * app/page.tsx — main todo page stub.
 *
 * TODO (Person B — feat/member-b-crud-priority):
 *   Replace this entire file with the full monolithic todo UI.
 *   See PRPs/01-todo-crud-operations.md and PRPs/02-priority-system.md.
 *
 * middleware.ts already protects this route — you are authenticated here.
 */

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-gray-400 text-sm">
        Todo list — Person B will implement this (feat/member-b-crud-priority).
      </p>
    </main>
  );
}
