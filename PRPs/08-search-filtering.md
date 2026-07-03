# PRP 08 — Search & Advanced Filtering

## Feature Overview

A real-time search bar finds todos by title and subtask content. Quick filter dropdowns allow filtering by priority and tag. An advanced panel provides date-range filtering and completion-status filtering. Multiple active filters combine with AND logic. Filter combinations can be saved as named presets stored in localStorage. All filtering happens client-side for instant response.

---

## User Stories

| Persona | Story | Acceptance Criteria |
|---------|-------|---------------------|
| Focused worker | As a user, I want to search todos by title so I can find tasks quickly | Real-time results as I type |
| Category reviewer | As a user, I want to filter by tag so I see only "Work" tasks | Tag dropdown filters instantly |
| Weekly planner | As a user, I want to filter by due date range so I see this week's tasks | Date range filter shows matching todos |
| Preset saver | As a user, I want to save filter combinations so I can reapply them with one click | Saved presets persist across page loads |
| Reset user | As a user, I want one button to clear all active filters | "Clear All" removes all active filters |

---

## User Flow

### Basic Search
1. User types in the search bar
2. Todos update instantly (client-side, no API call)
3. Matches: todo title OR subtask title (case-insensitive, partial match)
4. Clear button (✕) appears while typing; clicking it clears the query

### Quick Filtering
1. User selects a priority from the **Priority** dropdown
2. User selects a tag from the **Tags** dropdown (hidden if no tags exist)
3. Todos update instantly with AND logic

### Advanced Filtering
1. User clicks **▶ Advanced** to expand the panel
2. Options: Completion status, Due Date From, Due Date To
3. Filters apply immediately; panel button shows "▼ Advanced"

### Saving a Filter Preset
1. With any filters active, **💾 Save Filter** button appears
2. User clicks it → modal shows current filter summary
3. User names the preset and clicks **Save**
4. Preset stored in `localStorage`; appears as pill in advanced panel

### Applying a Saved Preset
1. In advanced panel, user clicks a preset pill
2. All filters replaced with preset's values
3. User can modify from that starting point

---

## Technical Requirements

### Client-Side Filter State (`app/page.tsx`)

```typescript
interface FilterState {
  search: string;
  priority: Priority | 'all';
  tagId: number | null;
  completion: 'all' | 'incomplete' | 'completed';
  dateFrom: string;   // YYYY-MM-DD
  dateTo: string;     // YYYY-MM-DD
}

const DEFAULT_FILTERS: FilterState = {
  search: '',
  priority: 'all',
  tagId: null,
  completion: 'all',
  dateFrom: '',
  dateTo: '',
};
```

### Filter Function

```typescript
function applyFilters(todos: TodoWithSubtasks[], filters: FilterState): TodoWithSubtasks[] {
  return todos.filter(todo => {
    // Search: match title OR any subtask title
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const inTitle = todo.title.toLowerCase().includes(q);
      const inSubtasks = todo.subtasks.some(s => s.title.toLowerCase().includes(q));
      if (!inTitle && !inSubtasks) return false;
    }

    // Priority
    if (filters.priority !== 'all' && todo.priority !== filters.priority) return false;

    // Tag
    if (filters.tagId !== null) {
      if (!todo.tags.some(t => t.id === filters.tagId)) return false;
    }

    // Completion
    if (filters.completion === 'incomplete' && !!todo.completed) return false;
    if (filters.completion === 'completed' && !todo.completed) return false;

    // Date range — only applies to todos WITH a due date
    if (filters.dateFrom && todo.due_date) {
      if (todo.due_date.slice(0, 10) < filters.dateFrom) return false;
    }
    if (filters.dateTo && todo.due_date) {
      if (todo.due_date.slice(0, 10) > filters.dateTo) return false;
    }

    return true;
  });
}
```

### Saved Filter Presets (localStorage)

```typescript
interface FilterPreset {
  id: string;       // uuid or timestamp
  name: string;
  filters: FilterState;
}

// Storage key: 'todo-filter-presets'
function loadPresets(): FilterPreset[] {
  try {
    return JSON.parse(localStorage.getItem('todo-filter-presets') ?? '[]');
  } catch { return []; }
}

function savePreset(name: string, filters: FilterState): FilterPreset[] {
  const presets = loadPresets();
  const newPreset: FilterPreset = {
    id: Date.now().toString(),
    name,
    filters,
  };
  const updated = [...presets, newPreset];
  localStorage.setItem('todo-filter-presets', JSON.stringify(updated));
  return updated;
}

function deletePreset(id: string): FilterPreset[] {
  const updated = loadPresets().filter(p => p.id !== id);
  localStorage.setItem('todo-filter-presets', JSON.stringify(updated));
  return updated;
}
```

---

## UI Components

### Search Bar

```tsx
<div className="relative">
  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
  <input
    type="text"
    value={filters.search}
    onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
    placeholder="Search todos and subtasks…"
    className="w-full pl-9 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
  />
  {filters.search && (
    <button
      onClick={() => setFilters(f => ({ ...f, search: '' }))}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
    >
      ✕
    </button>
  )}
</div>
```

### Quick Filters Row

```tsx
<div className="flex flex-wrap gap-2">
  {/* Priority filter */}
  <select value={filters.priority} onChange={...}>
    <option value="all">All Priorities</option>
    <option value="high">High Priority</option>
    <option value="medium">Medium Priority</option>
    <option value="low">Low Priority</option>
  </select>

  {/* Tag filter — only shown if tags exist */}
  {tags.length > 0 && (
    <select value={filters.tagId ?? ''} onChange={...}>
      <option value="">All Tags</option>
      {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  )}

  {/* Advanced toggle */}
  <button onClick={() => setAdvancedOpen(o => !o)}
    className={`text-sm px-3 py-1.5 rounded-lg ${advancedOpen ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
    {advancedOpen ? '▼ Advanced' : '▶ Advanced'}
  </button>

  {/* Clear all — shown when any filter active */}
  {hasActiveFilters && (
    <>
      <button onClick={clearFilters} className="text-sm text-red-600 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20">
        Clear All
      </button>
      <button onClick={() => setSavePresetOpen(true)} className="text-sm text-green-600 px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20">
        💾 Save Filter
      </button>
    </>
  )}
</div>
```

### Advanced Filters Panel

```tsx
{advancedOpen && (
  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-3">
    {/* Completion status */}
    <div>
      <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Status</label>
      <select value={filters.completion} onChange={...}>
        <option value="all">All Todos</option>
        <option value="incomplete">Incomplete Only</option>
        <option value="completed">Completed Only</option>
      </select>
    </div>

    {/* Date range */}
    <div className="flex gap-3">
      <div>
        <label className="text-xs text-gray-500">Due Date From</label>
        <input type="date" value={filters.dateFrom} onChange={...} />
      </div>
      <div>
        <label className="text-xs text-gray-500">Due Date To</label>
        <input type="date" value={filters.dateTo} onChange={...} />
      </div>
    </div>

    {/* Saved presets */}
    {presets.length > 0 && (
      <div>
        <label className="text-xs text-gray-500">Saved Presets</label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {presets.map(p => (
            <div key={p.id} className="flex items-center gap-1">
              <button onClick={() => applyPreset(p)} className="text-xs bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded">
                {p.name}
              </button>
              <button onClick={() => handleDeletePreset(p.id)} className="text-gray-400 hover:text-red-500 text-xs">
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
)}
```

### Save Filter Modal

Shows current active filters as a preview:
```
Current Filters:
• Search: "meeting"
• Priority: High
• Tag: Work
• Completion: Incomplete
• Date Range: 2025-11-01 to 2025-11-07
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Search with no results | Show "No todos match your filters" empty state |
| Date range with no due dates | Todos without due_date excluded from date-range filter |
| Preset with deleted tag | Tag filter becomes "All Tags" when tag no longer exists |
| Multiple presets with same name | Allowed — ID distinguishes them |
| Search across 500+ todos | Client-side; stays fast since no API round-trip |
| Date From > Date To | Both filters still apply independently (may produce empty results) |

---

## Acceptance Criteria

- [ ] Search filters todos in real-time as user types
- [ ] Search matches title AND subtask titles (case-insensitive)
- [ ] Clear (✕) button clears search
- [ ] Priority filter shows only todos matching selected priority
- [ ] Tag filter hidden when user has no tags
- [ ] Advanced panel opens/closes on toggle button
- [ ] Completion filter: "Incomplete Only" hides completed todos
- [ ] Date range filter shows only todos with due_date in range
- [ ] All filters apply AND logic simultaneously
- [ ] "Clear All" button resets all filters to defaults
- [ ] "💾 Save Filter" visible when any filter is active
- [ ] Preset saved to localStorage and survives page reload
- [ ] Clicking preset applies all its filters
- [ ] Preset delete removes it from localStorage and panel
- [ ] Todo counts in section headers reflect filtered results

---

## Testing Requirements

### E2E Tests (`tests/09-search-filtering.spec.ts`)

```typescript
test('search finds todo by title', async ({ page }) => {
  await helpers.createTodo(page, { title: 'Team meeting agenda' });
  await helpers.createTodo(page, { title: 'Buy groceries' });
  await page.fill('[placeholder="Search todos and subtasks…"]', 'meeting');
  await expect(page.getByText('Team meeting agenda')).toBeVisible();
  await expect(page.getByText('Buy groceries')).not.toBeVisible();
});

test('search finds todo via subtask title', async ({ page }) => {
  await helpers.createTodo(page, { title: 'Project Alpha' });
  await helpers.addSubtask(page, 'Project Alpha', 'Write quarterly report');
  await page.fill('[placeholder="Search todos and subtasks…"]', 'quarterly');
  await expect(page.getByText('Project Alpha')).toBeVisible();
});

test('save and apply filter preset', async ({ page }) => {
  await page.selectOption('[data-testid="priority-filter"]', 'high');
  await page.getByRole('button', { name: 'Save Filter' }).click();
  await page.fill('[placeholder="Preset name"]', 'High Priority');
  await page.getByRole('button', { name: 'Save' }).click();
  // Reload and apply preset
  await page.reload();
  await page.getByRole('button', { name: 'Advanced' }).click();
  await page.getByText('High Priority').click();
  await expect(page.getByTestId('priority-filter')).toHaveValue('high');
});
```

---

## Out of Scope

- Server-side search (all filtering is client-side)
- Full-text search ranking / relevance scoring
- Search history
- Regex search
- Preset sharing between users

---

## Success Metrics

- Search response: instant (< 16ms) for up to 500 todos
- Filter changes reflected in < 1 frame (no observable lag)
- Preset persistence verified across hard refresh
