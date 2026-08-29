// Undo/redo stacks for ModelDetail's model editing, extracted from
// ModelDetail.jsx (expert review C-11 tranche). Owns the two snapshot stacks
// (capped at 20) and the four operations on them; the caller keeps its own
// dirty-flag semantics by acting on undo/redo's boolean return (true = a
// snapshot was applied), and keeps the Ctrl+Z/Y keyboard wiring, which is
// coupled to Ctrl+S/save and the editable-element guard rather than to the
// stacks themselves.
import { useCallback, useState } from "react";

export function useModelUndo(model, setModel) {
  const [past, setPast] = useState([]);    // undo stack — model snapshots, capped at 20
  const [future, setFuture] = useState([]); // redo stack

  // Push the current model before a change; a new edit clears the redo stack.
  const pushSnapshot = useCallback(() => {
    setPast(p => [...p.slice(-19), model]);
    setFuture([]);
  }, [model]);

  const undo = useCallback(() => {
    if (!past.length) return false;
    const prev = past[past.length - 1];
    setFuture(f => [model, ...f.slice(0, 19)]);
    setPast(p => p.slice(0, -1));
    setModel(prev);
    return true;
  }, [past, model, setModel]);

  const redo = useCallback(() => {
    if (!future.length) return false;
    const next = future[0];
    setPast(p => [...p.slice(-19), model]);
    setFuture(f => f.slice(1));
    setModel(next);
    return true;
  }, [future, model, setModel]);

  const reset = useCallback(() => {
    setPast([]);
    setFuture([]);
  }, []);

  return { pushSnapshot, undo, redo, reset, canUndo: past.length > 0, canRedo: future.length > 0 };
}
