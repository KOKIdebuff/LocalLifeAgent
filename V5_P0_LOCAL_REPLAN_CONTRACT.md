# V5 P0 Candidate Switcher Contract

## Status

This document freezes the P0 candidate-switcher subset for V5 Generative UI.
The session-local frontend runtime, adapter fallback projection, activity /
restaurant / transport preview, adoption, restoration, and one-step undo are
implemented. Backend-persisted candidate history and load-more remain unimplemented.

Related schema: `ui-contract.schema.json`, especially
`$defs.P0LocalReplanContract`, `$defs.P0LocalReplanRequest`,
`$defs.P0LocalReplanResponse`, `$defs.P0CandidateSwitcherState`,
`$defs.P0CandidatePreview`, and `x-p0LocalReplanContract`.

## Decision

"Change one" is a deterministic candidate switcher, not a random replacement.
P0 uses:

```text
linear candidate history + preview-only switching + explicit adoption
+ restore original + one-step adoption undo
```

Recommended UI:

```text
[ previous ]  2 / 5  [ next ]

[ adopt this ]  [ restore original ]
```

The current Main plan and saved snapshots must not change while the user is only
previewing candidates.

## MVP Scope

P0 supports these switch targets:

| Target | P0 capability | Notes |
| --- | --- | --- |
| `activity` | supported | Switch among 3-5 activity candidates. |
| `restaurant` | supported | Switch among 3-5 restaurant candidates. |
| `transport` | supported standalone segment card | Bind the card to one route segment between `fromRef` and `toRef`; preview downstream timeline, budget, and risk changes. |
| `timeline` | supported in itinerary detail | Adjust one explicit time block and recompute only adjacent or referenced timeline items. |

P0 supports these explicit actions:

```text
preview_previous_candidate
preview_next_candidate
adopt_preview_candidate
restore_original_candidate
undo_candidate_adoption
```

`refresh_block` remains a compatibility entry for existing fixtures and
adapters. It may initialize the switcher or preview the next candidate, but it
must not directly replace the Main plan. It must not be deleted until the user
personally experiences the new candidate switcher and explicitly approves
removal.

## Transport Route Segment

Transport is an independent actionable card, but its ownership boundary is one
route segment between two itinerary locations:

```text
routeSegmentId
fromRef
toRef
candidateTransportRefs
currentPreviewCandidateRef
originalCandidateRef
adoptedCandidateRef
timeDeltaMinutes
budgetDelta
congestionRisk
walkingRisk
transferRisk
affectedDownstreamTimelineRefs
```

The transport card must not behave like a plan-wide transport preference card.
Its actions only target the bound `routeSegmentId`. Switching transport previews
the affected downstream timeline, time, budget, congestion, walking, and
transfer risk. Main changes only after explicit adoption and validation.

## Interaction Rules

- Previous returns the exact locally cached candidate already viewed.
- Next moves to the next candidate in the stable ordered list.
- Position text shows `currentIndex + 1 / candidateCount`.
- Previous is disabled at the first candidate.
- At the last candidate, Next may request more candidates.
- Loading more is bounded; the first version keeps at most 3-5 candidates.
- A loading failure preserves the current candidate and current preview.
- Switching does not loop infinitely and does not create a branch tree.
- Candidate history exists only in the current editing session.
- A candidate is only a preview until the user selects `adopt this`.
- `restore original` returns the block to the first generated content.
- After adoption, one undo is available for that adoption.
- A committed detail-page replan creates a new plan `version` and marks the page unsaved until the user saves it.
- Refs outside `affectedRefs` must remain stable.
- A block whose execution step is `success` is locked and cannot enter the switcher.
- High-impact actions affected by a committed replan require confirmation again.

## State

Each replaceable block maintains:

```text
candidateRefs
currentIndex
currentCandidateRef
originalCandidateRef
adoptedCandidateRef
affectedTimelineRefs
loadStatus
previewStatus
```

The candidate list order is stable for the editing session. Returning to a
previous candidate reads local history and must not regenerate it.

## Preview Contract

Each preview includes:

```text
candidate
affected timeline
time delta
budget delta
risk delta and risk changes
schema validation result
```

While previewing:

- `mainPlanMutated=false`
- `savedSnapshotMutated=false`
- collaboration, execution, audit, and persisted plan state remain unchanged

The UI must visibly distinguish `previewing` from `adopted`.

## Adoption And Restoration

Adoption is a commit boundary:

```text
user clicks adopt this
-> validate time
-> validate budget
-> validate risk
-> validate schema
-> create one-step adoption snapshot
-> update Main only when every required check passes
```

If validation fails, preserve the current Main plan and keep the candidate
preview available for review.

`restore original` commits the original candidate back to Main after the same
time, budget, risk, and schema validation. `undo_candidate_adoption` restores
the one snapshot created immediately before the latest adoption. P0 does not
provide a general undo stack.

## Load-More Failure

When Next reaches the last loaded candidate:

```text
request more candidates
-> append deterministic candidates on success
-> preserve current index and preview on failure
```

Failure must never clear the original candidate, candidate history, current
preview, Main plan, or saved snapshots.

## Required

- Stable ordered candidate history per replaceable block.
- Accurate Previous and Next navigation.
- Current position and total count.
- Explicit preview versus adopted state.
- Preview time, budget, timeline, and risk changes.
- Standalone transport cards bound to `routeSegmentId + fromRef + toRef`.
- Transport preview includes congestion, walking, transfer, and downstream timeline impact.
- No Main or saved-snapshot mutation before adoption.
- Explicit adoption with time, budget, risk, and schema validation.
- Restore original.
- One-step undo after adoption.
- Preserve current candidate when loading or validation fails.

## Not In P0

- Random replacement.
- Infinite candidate loops.
- More than 5 candidates per block.
- Complex branch trees.
- Cross-session candidate history.
- Full cascade engine.
- Complex locked-ref solving.
- Multi-version preview snapshots.
- General undo stack.
- Collaboration or execution state participating in candidate selection.
- Backend-persisted preview history.
- Automatic constraint relaxation.

## Recommended Implementation Order

1. Session-local stable candidate list for activity and restaurant blocks.
2. Previous, Next, and position indicator.
3. Preview-only timeline, budget, time, and risk diff.
4. Adopt with validation and one-step snapshot.
5. Restore original and one-step adoption undo.
6. Bounded load-more with failure preservation.
7. Compatibility mapping from `refresh_block`.
8. User experience review gate before deleting `refresh_block`.

## Done When

- Previous always restores the exact candidate previously viewed.
- Next follows a stable ordered list and never silently randomizes.
- Preview does not mutate Main or saved snapshots.
- Adopt updates Main only after time, budget, risk, and schema checks pass.
- Restore original returns to the first generated content.
- One undo is available after adoption.
- Loading or validation failure preserves the current candidate and Main plan.
- It does not affect the old `agent-core.js` fallback.
- It does not mutate collaboration, execution, audit, or SQLite state during preview.

## Candidate Paths

| Path | Approach | Pros | Cons |
| --- | --- | --- | --- |
| A. Random replacement | Each click regenerates and immediately replaces. | Lowest initial implementation cost. | Cannot go back reliably; silently mutates Main; rejected. |
| B. Linear candidate switcher | Stable 3-5 candidates, preview, adopt, restore, one undo. | Predictable, understandable, testable, and bounded. | Requires explicit session state and diff preview. |
| C. Branch tree | Every candidate and adoption becomes a plan branch. | Strong history and comparison capability. | Too complex for P0 and overlaps Plan Branch lifecycle. |

Final recommendation: use path B.

Execution state is not a candidate-ranking input. It is only an eligibility
guard: successfully executed blocks are locked, while pending, recoverable,
cancelled, or skipped blocks follow the reopen rules in
`V5_PLAN_LIFECYCLE_CONTRACT.md`.
