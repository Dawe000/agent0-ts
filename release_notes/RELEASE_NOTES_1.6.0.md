# Release Notes — 1.6.0 (stable)

## Highlights

- **FeedbackFile schema aligned with deployed subgraph**: feedback file fields now match the current subgraph `FeedbackFile` entity.
- **Legacy feedback fields removed**: legacy keys are no longer accepted or mapped by the SDK.

## Changes in 1.6.0 (since 1.5.3)

- **Spec-aligned feedback fields only**
  - `Feedback` / `FeedbackFileInput` now use:
    - `mcpTool`, `mcpPrompt`, `mcpResource`
    - `a2aSkills`, `a2aContextId`, `a2aTaskId`
    - `oasfSkills`, `oasfDomains`
  - Removed legacy fields from the interfaces and runtime behavior:
    - `capability`, `name`, `skill`, `task`, `context`

- **`giveFeedback(...)` no longer accepts legacy keys**
  - The optional `feedbackFile` payload is read as spec-only fields.
  - Callers must send `mcpTool` / `a2aSkills` / `a2aContextId` / `a2aTaskId` (and other spec fields as needed).

- **Subgraph queries select spec-aligned fields**
  - Subgraph selection for `feedbackFile` includes the spec-aligned fields so the SDK matches the deployed subgraph.

- **Tests updated**
  - Feedback tests now validate `mcpTool` + `a2aSkills` instead of legacy `capability`/`skill`.

## Migration notes

- If you previously wrote feedback files like:
  - `capability: "tools"`, `name: "foo"`, `skill: "python"`, `task: "bar"`, `context: {...}`
  - Update to:
    - `mcpTool: "foo"` (or `mcpPrompt` / `mcpResource`)
    - `a2aSkills: ["python"]`
    - `a2aTaskId: "bar"` (if applicable)
    - `a2aContextId: "..."` (if applicable)

