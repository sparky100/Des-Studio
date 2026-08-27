// src/ui/shared/xyflow.js
//
// Thin re-export of @xyflow/react. App code imports the canvas library
// through this module instead of importing "@xyflow/react" directly.
//
// Why this exists: several tests `vi.mock('@xyflow/react', ...)` to replace
// the real canvas with a lightweight stub. Vitest's default pools reuse one
// worker across many test files for performance, and that reuse doesn't
// reliably extend to resetting Node's native ESM loader cache for
// externally-resolved third-party packages the way it does for local source
// files — so under full-suite CPU contention, a mock for "@xyflow/react"
// itself could intermittently miss and let the real package through (seen
// as "[React Flow]: Seems like you have not used zustand provider as an
// ancestor" — a real <ReactFlow> internal-context error a test's stubbed
// canvas div was never meant to trigger). vite-node always isolates local
// source-file modules per test file reliably, so mocking *this* file's path
// instead of the package specifier is unaffected by that gap.
//
// Re-export every named export any app file currently imports from
// "@xyflow/react" — add to this list if a new one is needed, don't reach
// back to the package directly.
export {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  useStoreApi,
} from '@xyflow/react';
