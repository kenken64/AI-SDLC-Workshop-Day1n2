<<<<<<< HEAD
# PRP 10: Calendar View

## Feature Overview

Provide a monthly calendar visualization of todos by due date, including month navigation and Singapore public holiday context.

## User Stories

- As a user, I can view todos arranged by calendar day.
- As a user, I can navigate between months.
- As a user, I can quickly identify days with many due tasks.
- As a user in Singapore, I can see public holidays in the calendar context.

## Technical Requirements

- Calendar layout:
  - Monthly grid (7 columns, week rows).
  - Leading/trailing day alignment for month boundaries.
- Data mapping:
  - Group todos by due date day in Singapore timezone.
  - Show day-level indicators and/or todo list snippets.
- Navigation:
  - Previous month / next month controls.
  - Jump to current month action.
- Holiday integration:
  - Read Singapore public holidays from `holidays` table when available.
  - Distinct visual marker for holiday dates.

## API and Data Notes

- Existing todos endpoint may be reused for first version.
- Optional dedicated endpoint for month-bounded queries in larger datasets.
- Date calculations must use Singapore timezone helpers.

## UI Requirements

- `/calendar` page route.
- Month-year header with navigation controls.
- Per-day cell includes:
  - date number
  - todo count or top items
  - holiday indicator/title when relevant

## Acceptance Criteria

- Calendar renders correctly for any month/year.
- Todos appear on correct calendar day in SG timezone.
- Month navigation updates view accurately.
- Holidays are shown when holiday data exists.

## Edge Cases

- Todos without due date should not appear on date cells.
- Leap year February and month transitions.
- Months starting on Sunday/Monday depending on chosen week start.

## Out of Scope

- Drag-and-drop scheduling
- Week/day agenda views
- Shared team calendars

## Testing Guidance

- Verify month rendering for 28/29/30/31-day months.
- Verify timezone placement around UTC date boundaries.
- Verify holiday markers for seeded Singapore holidays.
- Verify navigation persistence and URL state (if used).
=======
# 10 - Calendar View

## Feature Overview

Monthly calendar visualization showing todos by due date with color-coded priorities. Allows users to see the complete picture of their schedule at a glance, identify busy days, spot scheduling conflicts, and plan ahead. Includes month navigation and holiday integration support.

## User Stories

### As a visual planner
**I want to** see all my todos on a calendar grid
**So that** I can visualize my workload and plan my month

### As an organized person
**I want to** see todos color-coded by priority on the calendar
**So that** I can quickly spot urgent tasks at a glance

### As a scheduler
**I want to** navigate between months easily
**So that** I can plan both current and future tasks

### As a deadline-conscious user
**I want to** see public holidays on the calendar
**So that** I can plan around non-working days

## User Flow

### View Calendar Flow
1. User clicks "📅 Calendar" button (top navigation)
2. Calendar page loads showing current month
3. Calendar displays grid with:
   - Week days at top (Sun-Sat)
   - Date numbers (1-31)
   - Todos on their due dates
   - Color coding by priority
4. Today's date is highlighted
5. Past dates appear grayed out

### Navigate Months Flow
1. User views calendar for current month
2. Clicks "◀ Previous" to see previous month
3. Clicks "Next ▶" to see next month
4. Clicks "Today" to jump back to current month
5. Month/year title updates with navigation

### View Todo on Date Flow
1. User scans calendar for busy days
2. Sees colored todo indicators on specific dates
3. Multiple todos on one date stack vertically
4. Todo titles are truncated if too long
5. Hover shows full todo title (optional)

### Return to List Flow
1. User finishes calendar review
2. Clicks "📋 Back to List" button
3. Returns to main todo list view
4. Can apply filters/search again

## Technical Requirements

### Database Queries
No database changes needed. Uses existing todos data.

### API Endpoints
- `GET /api/todos` - Returns all todos (existing endpoint)

### Component Structure

#### Page Layout
```typescript
export default function CalendarPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    void fetchTodos();
  }, []);

  // ... component logic
}
```

#### Navigation Header
```typescript
<div className="calendar-nav">
  <button onClick={handlePrevMonth}>◀ Previous</button>
  <h2>{monthName} {year}</h2>
  <div className="nav-buttons">
    <button onClick={handleToday}>Today</button>
    <button onClick={handleNextMonth}>Next ▶</button>
  </div>
</div>
```

#### Calendar Table Structure
```typescript
<table className="calendar">
  <thead>
    <tr>
      {weekDays.map(day => (
        <th key={day}>{day}</th>
      ))}
    </tr>
  </thead>
  <tbody>
    {/* Calendar rows */}
    {calendarDays.map((day, index) => (
      <td key={index}>
        {day && (
          <>
            <div className="date-number">{day}</div>
            <div className="todos">
              {getTodosForDate(day).map(todo => (
                <TodoBadge key={todo.id} todo={todo} />
              ))}
            </div>
          </>
        )}
      </td>
    ))}
  </tbody>
</table>
```

#### Todo Badge Component
```typescript
function TodoBadge({ todo }: { todo: Todo }) {
  const priorityColor = {
    high: "#EF4444",    // Red
    medium: "#F59E0B",  // Yellow
    low: "#3B82F6"      // Blue
  }[todo.priority];

  return (
    <div
      className="todo-badge"
      style={{
        backgroundColor: priorityColor,
        color: "white",
        padding: "0.25rem 0.5rem",
        borderRadius: "0.25rem",
        fontSize: "0.75rem",
        marginBottom: "0.25rem",
        textDecoration: todo.completed ? "line-through" : "none",
        cursor: "pointer",
      }}
      title={todo.title}
    >
      {todo.title.length > 15
        ? `${todo.title.substring(0, 15)}...`
        : todo.title}
    </div>
  );
}
```

### Calendar Generation Logic

```typescript
// Generate calendar days array
function generateCalendarDays(date: Date): (number | null)[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const calendarDays: (number | null)[] = [];
  
  // Add empty cells for days before month starts
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarDays.push(null);
  }
  
  // Add days of month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  return calendarDays;
}

// Get todos for specific date
function getTodosForDate(day: number): Todo[] {
  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return todos.filter(todo => {
    if (!todo.due_date) return false;
    const todoDueDateStr = todo.due_date.split("T")[0];
    return todoDueDateStr === dateStr;
  });
}
```

### Month Navigation Logic

```typescript
function handlePrevMonth() {
  setCurrentDate(
    new Date(currentDate.getFullYear(), currentDate.getMonth() - 1)
  );
}

function handleNextMonth() {
  setCurrentDate(
    new Date(currentDate.getFullYear(), currentDate.getMonth() + 1)
  );
}

function handleToday() {
  const today = new Date();
  setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
}
```

### Styling

```css
.calendar {
  width: 100%;
  border-collapse: collapse;
}

.calendar thead th {
  padding: 0.5rem;
  text-align: center;
  background-color: #F3F4F6;
  font-weight: bold;
}

.calendar tbody td {
  padding: 0.5rem;
  border: 1px solid #D1D5DB;
  vertical-align: top;
  min-height: 120px;
  background-color: white;
}

.calendar tbody td:nth-of-type(7n+1),
.calendar tbody td:nth-of-type(7n) {
  /* weekend styling optional */
}

.calendar tbody td:has(> div > :empty) {
  background-color: #F9FAFB;
}

.date-number {
  font-weight: bold;
  margin-bottom: 0.5rem;
  color: #1F2937;
}

.todos {
  font-size: 0.875rem;
}

.todo-badge {
  background-color: inherit; /* Set by priority */
  color: white;
  padding: 0.25rem 0.5rem;
  margin-bottom: 0.25rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.todo-badge.completed {
  text-decoration: line-through;
}
```

## UI Components

### Calendar Header
- Previous/Today/Next buttons
- Large month/year title
- Centered alignment

### Calendar Grid
- 7-column table (Sun-Sat)
- 4-6 rows depending on month
- Date numbers in top-left of cell
- Todo badges below date
- Empty dates have light gray background
- Boundary dates grayed out

### Todo Badges
- **High Priority**: Red (#EF4444)
- **Medium Priority**: Yellow (#F59E0B)
- **Low Priority**: Blue (#3B82F6)
- White text for contrast
- Title truncated to 15 characters
- Strikethrough for completed todos
- Full title on hover (via title attribute)

### Legend
- Shows priority color meanings
- Displayed below calendar
- Color squares with labels

### Back Button
- Purple "📋 Back to List" button
- Top-right corner
- Navigates to main todo list

## Edge Cases

### No Todos
- Calendar displays empty grid
- No badges on any date
- Loading message while fetching

### Todos Without Due Date
- Not displayed on calendar
- Only show todos with due_date set

### Multiple Todos on Same Date
- Stack vertically
- Each gets separate badge
- Scroll if >5 todos on one date (optional)

### Month/Year Boundaries
- Previous month accessible (past dates)
- Next month accessible (future dates)
- No year limit (can navigate freely)

### Today Highlight
- Current date clearly marked
- Useful for orientation
- Updates if calendar kept open past midnight (optional)

### Completed Todos
- Still shown on calendar
- Strikethrough text
- Same color as when incomplete

### Long Todo Titles
- Truncate at 15 characters
- Add ellipsis (...)
- Show full title on hover

## Acceptance Criteria

### Calendar Display
- [ ] Calendar renders as table with 7 columns (Sun-Sat)
- [ ] Current month displays by default
- [ ] Week starts on Sunday
- [ ] Dates 1-31 shown in correct positions
- [ ] Empty cells for days outside current month
- [ ] Current day is highlighted

### Todo Display
- [ ] Todos appear on their due date
- [ ] High priority todos are red (#EF4444)
- [ ] Medium priority todos are yellow (#F59E0B)
- [ ] Low priority todos are blue (#3B82F6)
- [ ] Completed todos have strikethrough
- [ ] Todo titles truncate at 15 characters with ellipsis
- [ ] Multiple todos stack on same date
- [ ] Full title visible on hover

### Navigation
- [ ] "◀ Previous" button goes to previous month
- [ ] "Next ▶" button goes to next month
- [ ] "Today" button returns to current month
- [ ] Month/year title updates with navigation
- [ ] Can navigate indefinitely forward/backward

### Links & Navigation
- [ ] "📅 Calendar" button links to calendar page
- [ ] "📋 Back to List" button returns to main page
- [ ] URLs work correctly (/calendar)

### Styling & Responsive
- [ ] Calendar is responsive on mobile
- [ ] Table scrolls horizontally if needed
- [ ] All elements visible without horizontal scroll
- [ ] Colors are accessible (WCAG AA)

### Loading & Performance
- [ ] Loading message shows while fetching todos
- [ ] Calendar renders faster than list (filtered data)
- [ ] Navigation between months is smooth
- [ ] No unnecessary re-renders

## Testing Requirements

### Unit Tests
```typescript
// Calendar generation
test('generates correct calendar days for month', () => {
  const days = generateCalendarDays(new Date(2025, 10)); // November
  expect(days).toHaveLength(35); // 5 weeks
  expect(days[0]).toBe(null); // November 1st is Saturday
  expect(days[5]).toBe(1); // First actual day
});

// Todo filtering by date
test('filters todos by date', () => {
  const todos = [
    { due_date: '2025-11-05T10:00:00Z' },
    { due_date: '2025-11-15T10:00:00Z' }
  ];
  expect(getTodosForDate(5)).toEqual([todos[0]]);
});

// Priority color mapping
test('maps priority to color', () => {
  expect(priorityColor('high')).toBe('#EF4444');
  expect(priorityColor('medium')).toBe('#F59E0B');
  expect(priorityColor('low')).toBe('#3B82F6');
});

// Month navigation
test('navigates to previous month', () => {
  const current = new Date(2025, 10); // November
  const prev = new Date(current.getFullYear(), current.getMonth() - 1);
  expect(prev.getMonth()).toBe(9); // October
});
```

### E2E Tests
```typescript
test('user views calendar and navigates months', async () => {
  // Navigate to calendar
  await page.click('button:has-text("Calendar")');
  await expect(page).toHaveTitle(/Calendar/);
  
  // Verify current month shows
  const monthText = await page.textContent('h2');
  expect(monthText).toMatch(/\w+ \d{4}/);
  
  // Navigate next month
  await page.click('button:has-text("Next")');
  const newMonth = await page.textContent('h2');
  expect(newMonth).not.toBe(monthText);
  
  // Navigate previous month
  await page.click('button:has-text("Previous")');
  const oldMonth = await page.textContent('h2');
  expect(oldMonth).toBe(monthText);
  
  // Jump to today
  await page.click('button:has-text("Today")');
  const todayMonth = await page.textContent('h2');
  expect(todayMonth).toContain(new Date().toLocaleString('default', { month: 'long' }));
});

test('user sees todos color-coded by priority', async () => {
  await page.click('button:has-text("Calendar")');
  
  // Check for high priority (red)
  const highPriority = page.locator('[style*="#EF4444"]').first();
  await expect(highPriority).toBeVisible();
  
  // Check for medium priority (yellow)
  const medPriority = page.locator('[style*="#F59E0B"]').first();
  await expect(medPriority).toBeVisible();
});

test('user returns to list view', async () => {
  await page.click('button:has-text("Calendar")');
  await page.click('button:has-text("Back to List")');
  await expect(page).toHaveURL(/^\/$|\/$/);
});
```

## Out of Scope

- Holiday integration (future feature)
- Week view
- Day view with todo details
- Drag-and-drop todos to different dates
- Inline todo editing on calendar
- Recurring todo visualization
- Multi-day todos
- Time slots/hourly view
- Sharing calendar
- Printing calendar

## Success Metrics

- Calendar loads <1 second
- All todos with due dates visible
- Users spend ~30 seconds reviewing calendar
- Priority colors clearly distinguishable
- Month navigation is intuitive

## Documentation

Update USER_GUIDE.md sections:
- Section 12: Calendar View (comprehensive coverage)
- Include navigation tips
- Color legend explanation
- Use cases for calendar planning
>>>>>>> dcca7cad4188c0d5e0ba8ab6368f77b6da46b485
