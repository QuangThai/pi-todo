import type { ExtensionUIContext, Theme } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { renderOverlayLines, renderOverlayPlainLines, shouldShowOverlay } from "./format.js";
import { getTodos } from "./store.js";
import { MAX_OVERLAY_LINES, WIDGET_KEY } from "./types.js";

/**
 * The "Updated Plan" widget above the editor.
 *
 * Two host behaviours shape this class.
 *
 * 1. `invalidate()` on a widget component means "drop cached rendering state,
 *    you are about to be re-rendered" — pi calls it from `ui.invalidate()` on a
 *    theme change and on terminal cell-dimension responses. It does *not* mean
 *    the widget was removed. Treating it as removal desynchronises our
 *    registration flag from pi's widget map, and then the `setWidget(key,
 *    undefined)` that should hide a finished list never fires, leaving a stale
 *    overlay on screen. So registration state is only ever changed here, next to
 *    the `setWidget` call that caused it.
 *
 * 2. Only interactive mode can run a component factory. RPC mode forwards the
 *    string-array form of `setWidget` and silently drops factories, so a
 *    factory-only overlay is invisible to every non-TUI front end. We therefore
 *    render themed lines for the TUI and plain lines everywhere else.
 */
export class TodoOverlay {
  private uiCtx: ExtensionUIContext | undefined;
  /** Interactive mode only: component factories are ignored by other hosts. */
  private useComponent = true;
  private widgetRegistered = false;
  private tui: TUI | undefined;
  /** Last plain payload, so non-TUI hosts are not spammed with identical widgets. */
  private lastPlainPayload: string | undefined;

  setUICtx(ctx: ExtensionUIContext, useComponent: boolean): void {
    if (ctx !== this.uiCtx || useComponent !== this.useComponent) {
      this.uiCtx = ctx;
      this.useComponent = useComponent;
      this.widgetRegistered = false;
      this.tui = undefined;
      this.lastPlainPayload = undefined;
    }
  }

  update(): void {
    if (!this.uiCtx) return;
    const todos = getTodos();

    if (!shouldShowOverlay(todos)) {
      this.clearWidget();
      return;
    }

    if (this.useComponent) {
      this.renderComponent();
    } else {
      this.renderPlain();
    }
  }

  private renderComponent(): void {
    if (!this.uiCtx) return;
    if (this.widgetRegistered) {
      // Same component instance; ask for a repaint and let render() re-read the store.
      this.tui?.requestRender();
      return;
    }
    this.uiCtx.setWidget(
      WIDGET_KEY,
      (tui, theme: Theme) => {
        this.tui = tui;
        return {
          render: (width: number) => renderOverlayLines(getTodos(), theme, width),
          // Cache-invalidation hook, not a lifecycle signal: nothing is cached.
          invalidate: () => {},
          dispose: () => {
            this.tui = undefined;
          },
        };
      },
      { placement: "aboveEditor" },
    );
    this.widgetRegistered = true;
  }

  private renderPlain(): void {
    if (!this.uiCtx) return;
    const lines = renderOverlayPlainLines(getTodos(), { maxLines: MAX_OVERLAY_LINES });
    const payload = lines.join("\n");
    if (this.widgetRegistered && payload === this.lastPlainPayload) return;
    this.uiCtx.setWidget(WIDGET_KEY, lines, { placement: "aboveEditor" });
    this.widgetRegistered = true;
    this.lastPlainPayload = payload;
  }

  private clearWidget(): void {
    if (!this.widgetRegistered) return;
    this.uiCtx?.setWidget(WIDGET_KEY, undefined);
    this.widgetRegistered = false;
    this.tui = undefined;
    this.lastPlainPayload = undefined;
  }

  isRegistered(): boolean {
    return this.widgetRegistered;
  }

  dispose(): void {
    if (this.uiCtx) this.uiCtx.setWidget(WIDGET_KEY, undefined);
    this.widgetRegistered = false;
    this.tui = undefined;
    this.lastPlainPayload = undefined;
    this.uiCtx = undefined;
  }
}
