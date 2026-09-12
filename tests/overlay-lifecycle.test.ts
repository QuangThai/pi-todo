import { beforeEach, describe, expect, it } from "vitest";
import { TodoOverlay } from "../src/overlay.js";
import { __resetStore, setTodos } from "../src/store.js";
import type { TodoItem } from "../src/types.js";
import { WIDGET_KEY } from "../src/types.js";

type WidgetComponent = {
  render(width: number): string[];
  invalidate?(): void;
  dispose?(): void;
};
type WidgetContent = string[] | ((tui: unknown, theme: unknown) => WidgetComponent) | undefined;

const identityTheme = {
  fg: (_c: string, s: string) => s,
  bold: (s: string) => s,
  strikethrough: (s: string) => s,
};

/**
 * Stand-in for pi's interactive widget host, matching the parts of
 * `InteractiveMode.setExtensionWidget` that the overlay depends on:
 * a factory is invoked immediately with (tui, theme), `undefined` removes the
 * widget and disposes the old component, and `ui.invalidate()` fans out to every
 * live widget component.
 */
function createWidgetHost() {
  const widgets = new Map<string, WidgetComponent | string[]>();
  let renderRequests = 0;
  const setWidgetCalls: Array<{ key: string; kind: "factory" | "lines" | "clear" }> = [];
  const tui = { requestRender: () => void renderRequests++ };

  const ui = {
    setWidget(key: string, content: WidgetContent) {
      const existing = widgets.get(key);
      if (existing && !Array.isArray(existing)) existing.dispose?.();
      if (content === undefined) {
        widgets.delete(key);
        setWidgetCalls.push({ key, kind: "clear" });
        return;
      }
      if (Array.isArray(content)) {
        widgets.set(key, content);
        setWidgetCalls.push({ key, kind: "lines" });
        return;
      }
      widgets.set(key, content(tui, identityTheme));
      setWidgetCalls.push({ key, kind: "factory" });
    },
    setStatus() {},
  };

  return {
    ui,
    widgets,
    setWidgetCalls,
    get renderRequests() {
      return renderRequests;
    },
    /** What pi does on a theme change: TUI.invalidate() walks the component tree. */
    invalidateAll() {
      for (const widget of widgets.values()) {
        if (!Array.isArray(widget)) widget.invalidate?.();
      }
    },
    render(width = 60): string[] {
      const widget = widgets.get(WIDGET_KEY);
      if (!widget) return [];
      return Array.isArray(widget) ? widget : widget.render(width);
    },
    isShowing(): boolean {
      return widgets.has(WIDGET_KEY);
    },
  };
}

const todo = (content: string, status: TodoItem["status"]): TodoItem => ({
  id: content,
  content,
  status,
  priority: "medium",
});

beforeEach(() => __resetStore());

describe("TodoOverlay widget lifecycle (interactive)", () => {
  it("registers a component widget once and repaints it afterwards", () => {
    const host = createWidgetHost();
    const overlay = new TodoOverlay();
    overlay.setUICtx(host.ui as never, true);

    setTodos([todo("wire overlay", "in_progress")]);
    overlay.update();
    expect(host.isShowing()).toBe(true);
    expect(host.setWidgetCalls.filter((c) => c.kind === "factory")).toHaveLength(1);

    setTodos([todo("wire overlay", "in_progress"), todo("write docs", "pending")]);
    overlay.update();
    // Still one registration; the live component re-reads the store on repaint.
    expect(host.setWidgetCalls.filter((c) => c.kind === "factory")).toHaveLength(1);
    expect(host.renderRequests).toBeGreaterThan(0);
    expect(host.render().join("\n")).toContain("write docs");
  });

  it("hides the widget once no open work remains", () => {
    const host = createWidgetHost();
    const overlay = new TodoOverlay();
    overlay.setUICtx(host.ui as never, true);

    setTodos([todo("wire overlay", "in_progress")]);
    overlay.update();
    expect(host.isShowing()).toBe(true);

    setTodos([todo("wire overlay", "completed")]);
    overlay.update();
    expect(host.isShowing()).toBe(false);
  });

  it("still hides the widget after a theme change invalidated the component", () => {
    // Regression: `invalidate()` means "drop cached rendering state", and pi calls
    // it from ui.invalidate() on every theme change. Treating it as "the widget
    // was removed" desynced the registration flag from pi's widget map, and the
    // clearing setWidget(key, undefined) then never fired — leaving a finished
    // checklist pinned above the editor for the rest of the session.
    const host = createWidgetHost();
    const overlay = new TodoOverlay();
    overlay.setUICtx(host.ui as never, true);

    setTodos([todo("wire overlay", "in_progress")]);
    overlay.update();
    expect(host.isShowing()).toBe(true);

    host.invalidateAll();

    setTodos([todo("wire overlay", "completed")]);
    overlay.update();
    // The user-visible symptom first: nothing open, so nothing above the editor.
    expect(host.isShowing()).toBe(false);
    expect(overlay.isRegistered()).toBe(false);
  });

  it("keeps its registration flag in step with the host across an invalidate", () => {
    const host = createWidgetHost();
    const overlay = new TodoOverlay();
    overlay.setUICtx(host.ui as never, true);

    setTodos([todo("wire overlay", "in_progress")]);
    overlay.update();
    host.invalidateAll();

    expect(overlay.isRegistered()).toBe(host.isShowing());
  });

  it("does not re-register the widget after an invalidate", () => {
    const host = createWidgetHost();
    const overlay = new TodoOverlay();
    overlay.setUICtx(host.ui as never, true);

    setTodos([todo("a", "in_progress")]);
    overlay.update();
    host.invalidateAll();
    setTodos([todo("a", "in_progress"), todo("b", "pending")]);
    overlay.update();

    expect(host.setWidgetCalls.filter((c) => c.kind === "factory")).toHaveLength(1);
  });

  it("clears the widget on dispose", () => {
    const host = createWidgetHost();
    const overlay = new TodoOverlay();
    overlay.setUICtx(host.ui as never, true);
    setTodos([todo("a", "pending")]);
    overlay.update();

    overlay.dispose();
    expect(host.isShowing()).toBe(false);
    expect(overlay.isRegistered()).toBe(false);
  });

  it("re-registers against a replacement UI context", () => {
    const first = createWidgetHost();
    const overlay = new TodoOverlay();
    overlay.setUICtx(first.ui as never, true);
    setTodos([todo("a", "pending")]);
    overlay.update();

    const second = createWidgetHost();
    overlay.setUICtx(second.ui as never, true);
    overlay.update();
    expect(second.isShowing()).toBe(true);
    expect(second.setWidgetCalls.filter((c) => c.kind === "factory")).toHaveLength(1);
  });
});

describe("TodoOverlay widget lifecycle (non-TUI hosts)", () => {
  it("sends plain lines instead of a factory, which RPC silently drops", () => {
    const host = createWidgetHost();
    const overlay = new TodoOverlay();
    overlay.setUICtx(host.ui as never, false);

    setTodos([todo("wire overlay", "in_progress"), todo("write docs", "pending")]);
    overlay.update();

    expect(host.setWidgetCalls.map((c) => c.kind)).toEqual(["lines"]);
    const lines = host.render();
    expect(lines[0]).toBe("Updated Plan");
    expect(lines.join("\n")).toContain("[•] wire overlay");
    expect(lines.join("\n")).toContain("[ ] write docs");
    // Plain output must carry no escape codes; RPC hosts render it verbatim.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the absence of escape codes
    for (const line of lines) expect(line).not.toMatch(/\x1b/);
  });

  it("stays within pi's 10-line widget budget", () => {
    const host = createWidgetHost();
    const overlay = new TodoOverlay();
    overlay.setUICtx(host.ui as never, false);

    setTodos(Array.from({ length: 40 }, (_, i) => todo(`task ${i}`, i === 39 ? "in_progress" : "pending")));
    overlay.update();

    const lines = host.render();
    expect(lines.length).toBeLessThanOrEqual(10);
    // The active item is outside the visible prefix, so it is pinned, not moved.
    expect(lines.join("\n")).toContain("Active: [•] task 39");
    expect(lines.join("\n")).toMatch(/\+\d+ more/);
  });

  it("does not resend an identical plain payload", () => {
    const host = createWidgetHost();
    const overlay = new TodoOverlay();
    overlay.setUICtx(host.ui as never, false);

    setTodos([todo("a", "pending")]);
    overlay.update();
    overlay.update();
    overlay.update();

    expect(host.setWidgetCalls).toHaveLength(1);
  });

  it("clears the plain widget when work finishes", () => {
    const host = createWidgetHost();
    const overlay = new TodoOverlay();
    overlay.setUICtx(host.ui as never, false);

    setTodos([todo("a", "pending")]);
    overlay.update();
    setTodos([todo("a", "completed")]);
    overlay.update();

    expect(host.isShowing()).toBe(false);
    expect(host.setWidgetCalls.map((c) => c.kind)).toEqual(["lines", "clear"]);
  });
});
