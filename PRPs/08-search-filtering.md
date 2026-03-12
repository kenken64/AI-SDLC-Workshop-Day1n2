<<<<<<< HEAD
# PRP 08: Search & Filtering

## Feature Overview

Add fast, real-time search and multi-criteria filtering so users can quickly find relevant todos across larger lists.

## User Stories

- As a user, I can search todos by text while typing.
- As a user, I can combine text search with priority/tag/status filters.
- As a user, I can find matching todos without waiting for page reload.

## Technical Requirements

- Search behavior:
  - Real-time filtering on input changes.
  - Case-insensitive match.
  - Match against `title` and `description` at minimum.
- Advanced search:
  - Include title + tags when tag system exists.
  - Support partial text matches.
- Multi-criteria filtering:
  - Filter by completion status (`all`, `active`, `completed`).
  - Filter by priority (`all`, `high`, `medium`, `low`).
  - Filter by recurrence (`all`, `none`, `daily`, `weekly`, `monthly`, `yearly`) once recurrence exists.
- Performance:
  - Client-side filtering for normal todo volumes.
  - Debounce text input only if needed; default is immediate for small datasets.

## API and Data Notes

- No mandatory new API endpoints required for initial version.
- Use already-fetched todo list and derive visible items in client state.
- If dataset grows significantly, optionally add server-side query endpoint later.

## UI Requirements

- Search input placed above todo list.
- Clear filter controls with reset option.
- Empty state for no results (different from no data state).

## Acceptance Criteria

- Typing in search input updates visible list immediately.
- Combined filters produce deterministic results.
- Search and filters work together with existing sorting.
- No noticeable lag for expected local dataset size.

## Edge Cases

- Empty query should show full list (subject to active non-text filters).
- Whitespace-only query should be treated as empty.
- Filtering should still work when there are zero todos.

## Out of Scope

- Fuzzy ranking algorithms
- Saved search presets
- Full-text index in SQLite

## Testing Guidance

- Search by title and description terms.
- Combine search + status + priority filters.
- Validate no-results message.
- Validate behavior with mixed casing.
=======
# 08 - Search & Filtering

## Feature Overview

Real-time text search and advanced filtering system that allows users to find todos with multi-criteria filtering, saved filter presets, and organized results. Supports searching by title, filtering by priority, completion status, and due date ranges.

## User Stories

### As a busy professional
**I want to** quickly search for specific todos by entering keywords
**So that** I can find tasks without manually scrolling through the entire list

### As a project manager
**I want to** filter todos by priority and completion status
**So that** I can focus on what needs immediate attention

### As a productivity enthusiast
**I want to** save my common filter combinations as named presets
**So that** I can quickly apply the same filters without reconfiguring them each time

### As an organized user
**I want to** filter todos by due date ranges
**So that** I can see what's due this week, next month, etc.

## User Flow

### Search Flow
1. User enters text in search bar
2. Results update in real-time as they type
3. Search is case-insensitive and matches partial strings
4. Clear button (✕) appears when text is entered
5. User can click ✕ to instantly clear search

### Basic Filtering Flow
1. User opens todo list
2. Clicks priority dropdown to select High/Medium/Low or "All"
3. Todo list filters to show only matching priority
4. Changes apply instantly

### Advanced Filtering Flow
1. User clicks "▶ Advanced" button to expand advanced filters panel
2. Panel reveals:
   - Completion status dropdown (All/Incomplete/Completed)
   - Date From input
   - Date To input
   - Saved filter presets (if any exist)
3. User selects/enters filter criteria
4. List updates in real-time showing only matching todos
5. "Clear All" button appears when filters are active
6. "💾 Save Filter" button appears to save current filter combination

### Save Filter Preset Flow
1. User applies desired filter combination
2. Clicks "💾 Save Filter" button
3. Modal appears with text input for preset name
4. Modal shows preview of current active filters
5. User enters preset name and clicks "Save"
6. Preset saved to browser localStorage
7. Preset appears in Advanced panel under "Saved Filter Presets"

### Apply Preset Flow
1. User expands Advanced filters panel
2. Locates preset in "Saved Filter Presets" section
3. Clicks preset name button
4. All filters apply instantly
5. Search field, dropdowns, and date inputs update

### Delete Preset Flow
1. User locates preset in "Saved Filter Presets" section
2. Clicks ✕ button next to preset name
3. Preset removed immediately
4. Refresh localStorage to persist deletion

## Technical Requirements

### Database Queries
No database changes needed. All filtering is client-side after fetching current todos.

### API Endpoints
- `GET /api/todos` - Returns all todos (existing endpoint)

### Component Structure

#### Search Bar Component
```typescript
<input
  type="text"
  placeholder="🔍 Search todos..."
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
/>
```

#### Filter Controls Row
```typescript
<div className="row">
  {/* Priority Dropdown */}
  <select value={priorityFilter} onChange={handlePriorityChange}>
    <option value="all">All Priorities</option>
    <option value="high">High</option>
    <option value="medium">Medium</option>
    <option value="low">Low</option>
  </select>

  {/* Advanced Toggle Button */}
  <button onClick={() => setShowAdvanced(!showAdvanced)}>
    {showAdvanced ? "▼" : "▶"} Advanced
  </button>

  {/* Active Filters Actions */}
  {hasActiveFilters && (
    <>
      <button onClick={clearAllFilters}>Clear All</button>
      <button onClick={() => setShowSavePreset(true)}>💾 Save Filter</button>
    </>
  )}
</div>
```

#### Advanced Filters Panel
```typescript
{showAdvanced && (
  <div className="advanced-panel">
    {/* Completion Status */}
    <select value={completionFilter} onChange={handleCompletionChange}>
      <option value="all">All Todos</option>
      <option value="incomplete">Incomplete Only</option>
      <option value="completed">Completed Only</option>
    </select>

    {/* Date Range */}
    <input type="date" value={dateFrom} onChange={handleDateFromChange} />
    <input type="date" value={dateTo} onChange={handleDateToChange} />

    {/* Presets List */}
    {presets.map(preset => (
      <div key={preset.name}>
        <button onClick={() => applyPreset(preset)}>{preset.name}</button>
        <button onClick={() => deletePreset(preset.name)}>✕</button>
      </div>
    ))}
  </div>
)}
```

### State Management

```typescript
// Search/Filter State
const [searchQuery, setSearchQuery] = useState("");
const [priorityFilter, setPriorityFilter] = useState<"all" | "high" | "medium" | "low">("all");
const [showAdvanced, setShowAdvanced] = useState(false);
const [completionFilter, setCompletionFilter] = useState<"all" | "completed" | "incomplete">("all");
const [dateFrom, setDateFrom] = useState("");
const [dateTo, setDateTo] = useState("");
const [presets, setPresets] = useState<FilterPreset[]>([]);
const [showSavePreset, setShowSavePreset] = useState(false);
const [presetName, setPresetName] = useState("");
```

### Filtering Logic

```typescript
const visibleTodos = useMemo(() => {
  let filtered = todos;

  // Priority filter
  if (priorityFilter !== "all") {
    filtered = filtered.filter(todo => todo.priority === priorityFilter);
  }

  // Search filter
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filtered = filtered.filter(todo =>
      todo.title.toLowerCase().includes(query)
    );
  }

  // Completion filter
  if (completionFilter === "completed") {
    filtered = filtered.filter(todo => todo.completed);
  } else if (completionFilter === "incomplete") {
    filtered = filtered.filter(todo => !todo.completed);
  }

  // Date range filter
  if (dateFrom || dateTo) {
    filtered = filtered.filter(todo => {
      if (!todo.due_date) return false;
      const dueDate = new Date(todo.due_date);
      if (dateFrom && dueDate < new Date(dateFrom)) return false;
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (dueDate > toDate) return false;
      }
      return true;
    });
  }

  return filtered;
}, [todos, priorityFilter, searchQuery, completionFilter, dateFrom, dateTo]);
```

### Preset Persistence

```typescript
// Load presets from localStorage on mount
useEffect(() => {
  try {
    const saved = localStorage.getItem("filterPresets");
    if (saved) setPresets(JSON.parse(saved));
  } catch {
    // Ignore errors
  }
}, []);

// Save presets to localStorage
function savePresets(updatedPresets: FilterPreset[]) {
  try {
    localStorage.setItem("filterPresets", JSON.stringify(updatedPresets));
    setPresets(updatedPresets);
  } catch {
    // Ignore errors
  }
}
```

## UI Components

### Search Bar
- Full-width text input
- Placeholder: "🔍 Search todos..."
- Clear button (✕) appears on focus/input
- Case-insensitive search
- Real-time filtering

### Priority Filter Dropdown
- Options: All Priorities, High, Medium, Low
- Updates immediately on selection
- Yellow background for active selection

### Advanced Button
- Toggle button: "▶ Advanced" (closed) / "▼ Advanced" (open)
- Blue background when panel is open
- Gray background when closed

### Advanced Filters Panel
- Light gray background (#F3F4F6)
- Rounded corners (0.5rem)
- Padding (1rem)
- Contains:
  - Completion Status dropdown
  - Due Date From input
  - Due Date To input
  - Saved Filter Presets section

### Clear All Button
- Red background (#EF4444)
- White text
- Appears when filters are active
- Resets all filters to default

### Save Filter Button
- Green background (#10B981)
- White text
- Appears when filters are active
- Opens preset name input

### Filter Preset Pills
- White background
- Gray border (#D1D5DB)
- Rounded corners
- Contains: Preset Name + ✕ Delete button
- Click name to apply preset
- Click ✕ to delete preset

## Edge Cases

### Empty Search Results
- Display "No todos match your criteria" message
- Show current active filters
- Offer "Clear All" button to reset

### Invalid Date Ranges
- If "Date From" > "Date To", ignore the range
- Show validation message (optional)

### Conflicting Filters
- Filters use AND logic (all must match)
- Example: High priority AND incomplete AND this week

### Preset Name Conflicts
- Allow overwriting presets with same name
- Or prevent duplicates with validation

### Browser Storage Limits
- localStorage has ~5-10MB limit
- For massive preset lists (unlikely), handle gracefully

## Acceptance Criteria

### Search Functionality
- [ ] Search bar filters todos in real-time
- [ ] Search is case-insensitive
- [ ] Partial matches work (e.g., "proj" matches "project")
- [ ] Clear button (✕) clears search immediately
- [ ] Empty search shows all todos

### Basic Filtering
- [ ] Priority dropdown filters by High/Medium/Low
- [ ] "All Priorities" option shows all todos
- [ ] Filter changes apply instantly
- [ ] Priority filter combines with other filters

### Advanced Filters
- [ ] Advanced panel toggles open/closed
- [ ] Completion filter shows Incomplete/Completed/All options
- [ ] Date From filter hides todos before selected date
- [ ] Date To filter hides todos after selected date
- [ ] Both dates can be used together for range
- [ ] Filters combine with AND logic (all must match)

### Filter Presets
- [ ] "Save Filter" button appears when filters are active
- [ ] Save modal shows current filter preview
- [ ] Preset names are required and trimmed
- [ ] Saved presets appear in Advanced panel
- [ ] Clicking preset name applies all saved filters
- [ ] Delete button (✕) removes preset
- [ ] Presets persist in localStorage
- [ ] Presets survive page refresh

### UI/UX
- [ ] "Clear All" button appears when filters active
- [ ] "Save Filter" button appears when filters active
- [ ] Active filter state clearly visible
- [ ] Advanced panel collapses when not needed
- [ ] All controls are responsive and accessible

## Testing Requirements

### Unit Tests
```typescript
// Search filtering
test('filters todos by search query', () => {
  const todos = [
    { id: 1, title: 'Meeting' },
    { id: 2, title: 'Lunch' }
  ];
  expect(filterTodos(todos, { search: 'meet' })).toEqual([todos[0]]);
});

// Priority filtering
test('filters todos by priority', () => {
  const todos = [
    { priority: 'high' },
    { priority: 'low' }
  ];
  expect(filterTodos(todos, { priority: 'high' })).toHaveLength(1);
});

// Completion filtering
test('filters todos by completion', () => {
  const todos = [
    { completed: true },
    { completed: false }
  ];
  expect(filterTodos(todos, { completion: 'incomplete' })).toHaveLength(1);
});

// Date range filtering
test('filters todos by date range', () => {
  const todos = [
    { due_date: '2025-11-05' },
    { due_date: '2025-11-15' }
  ];
  expect(filterTodos(todos, {
    dateFrom: '2025-11-10',
    dateTo: '2025-11-20'
  })).toHaveLength(1);
});

// Combined filters
test('combines filters with AND logic', () => {
  const todos = [
    { title: 'Report', priority: 'high', completed: false }
  ];
  expect(filterTodos(todos, {
    search: 'report',
    priority: 'high',
    completion: 'incomplete'
  })).toHaveLength(1);
});
```

### E2E Tests
```typescript
test('user can save and apply filter preset', async () => {
  await page.fill('input[placeholder="Search"]', 'meeting');
  await page.selectOption('select', 'high');
  await page.click('button:has-text("Save Filter")');
  await page.fill('input[placeholder="Preset name"]', 'My Meetings');
  await page.click('button:has-text("Save")');
  
  // Clear filters
  await page.click('button:has-text("Clear All")');
  expect(await page.inputValue('input[placeholder="Search"]')).toBe('');
  
  // Apply preset
  await page.click('button:has-text("My Meetings")');
  expect(await page.inputValue('input[placeholder="Search"]')).toBe('meeting');
});

test('user can delete filter preset', async () => {
  // Create preset...
  
  // Delete preset
  await page.click('button.preset-delete');
  expect(await page.isVisible('button:has-text("My Preset")')).toBe(false);
});
```

## Out of Scope

- Full-text search in description or subtasks (title-only for MVP)
- Tag-based filtering (separate feature)
- Saved search queries (different from presets)
- Search history
- Advanced boolean operators (AND, OR, NOT)

## Success Metrics

- Search returns results in <100ms
- Filtering is responsive (no visible lag)
- Users create at least 1 filter preset
- Filter preset persistence survives page refresh
- No more than 2 clicks to access advanced filters

## Documentation

Update USER_GUIDE.md sections:
- Section 10: Search & Advanced Filtering (comprehensive coverage)
- Include filter preset workflow
- Add examples of filter combinations
>>>>>>> dcca7cad4188c0d5e0ba8ab6368f77b6da46b485
