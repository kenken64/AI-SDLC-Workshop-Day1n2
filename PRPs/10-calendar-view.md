# PRP 10: Calendar View

## Feature Overview
Provide a monthly calendar view showing todos by due date, with Singapore public holiday visibility.

## User Stories
- As a user, I can view all due todos in calendar format.
- As a user, I can navigate between months.
- As a user, I can see Singapore public holidays in the same view.

## User Flow
1. User navigates to `/calendar`.
2. Calendar renders current month in Singapore timezone.
3. User clicks a date to view todos due that day.
4. User navigates previous/next month.

## Technical Requirements

### Routing and Data
- Protected route: `/calendar`
- Fetch todos grouped by date for current user
- Fetch holidays from `holidays` table for visible month

### Timezone Handling
- All calendar calculations use Singapore timezone utilities
- Day boundaries must match `Asia/Singapore`

### Rendering Rules
- Show count or compact pills for each date cell
- Highlight current day and holiday dates
- Distinguish completed vs active items visually

## UI Components
- Monthly grid with weekday headers
- Month navigation controls
- Day detail panel or modal listing selected date todos

## Edge Cases
- Months with no todos should still render holidays
- Leap year and month-length differences handled correctly
- Due dates without time components map to intended local day

## Acceptance Criteria
- Calendar loads for authenticated users only
- Todos appear on correct local dates
- Month navigation updates data and UI correctly

## Testing Requirements

### Unit
- Date-to-calendar-cell mapping tests in Singapore timezone
- Month navigation state logic tests

### Integration
- Calendar data endpoint tests for grouped results and auth
- Holiday merge tests

### E2E
- Visit calendar, navigate months, verify todo and holiday rendering

## Out of Scope
- Drag-and-drop rescheduling in calendar grid
- Weekly or agenda layouts

## Success Metrics
- Users can plan workload visually by month
- Calendar date alignment errors remain zero in automated tests
