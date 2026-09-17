/**
 * Re-exported from the shared package so the editor, the agent tools, and
 * anything server-side all read one definition of a design. Import path kept
 * so the ~20 call sites in the editor didn't have to churn.
 */
export * from "@agentic-canvas/shared/creative";
