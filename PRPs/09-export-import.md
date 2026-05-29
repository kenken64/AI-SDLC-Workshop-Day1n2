# PRP 09: Export and Import

## Feature Overview
Support JSON-based backup and restore for todos and related entities while preserving relationships.

## User Stories
- As a user, I can export my data to a JSON file.
- As a user, I can import a previous backup into my account.
- As a user, imported data preserves tags and subtasks correctly.

## User Flow
1. User starts export and downloads generated JSON.
2. User selects backup file for import.
3. System validates payload structure.
4. System remaps IDs and creates records safely.

## Technical Requirements

### API Endpoints
- `GET /api/todos/export`
- `POST /api/todos/import`

### Export Payload
- Include todos, subtasks, tags, and todo-tag mappings
- Include metadata such as timestamps where useful

### Import Rules
- Validate schema before processing
- Remap source IDs to new IDs to avoid collisions
- Preserve parent-child and many-to-many relationships
- Restrict import to authenticated user scope

## UI Components
- Export button and import file picker
- Import preview summary (counts, warnings)
- Clear success/error reporting

## Edge Cases
- Invalid JSON returns user-friendly validation error
- Partial import failures should report rollback behavior clearly
- Duplicate tag names during import should be merged or renamed by policy

## Acceptance Criteria
- Export file can be re-imported into a clean account successfully
- Relationship integrity remains intact after import
- Invalid files do not corrupt existing data

## Testing Requirements

### Unit
- Schema validation tests for import payload
- ID remapping utility tests

### Integration
- Round-trip export and import endpoint tests
- Import failure tests for malformed payloads

### E2E
- Export existing data, clear test account data, import, verify parity

## Out of Scope
- Cross-product import formats
- Incremental sync between devices

## Success Metrics
- Reliable backup and restore confidence for users
- Low import failure rate for valid exported files
