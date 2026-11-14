"use client";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef } from "react";

type Guard = { register: (id: string, dirty: boolean) => void; release: (id: string) => void; allowLeave: () => boolean };
const Context = createContext<Guard>({ register: () => undefined, release: () => undefined, allowLeave: () => true });

export function NavigationGuardProvider({ children }: { children: React.ReactNode }) {
  const dirty = useRef(new Set<string>());
  const register = useCallback((id: string, changed: boolean) => { if (changed) dirty.current.add(id); else dirty.current.delete(id); }, []);
  const release = useCallback((id: string) => { dirty.current.delete(id); }, []);
  const allowLeave = useCallback(() => !dirty.current.size || window.confirm("You have unsaved changes. Leave and discard those changes?"), []);
  useEffect(() => {
    // Preserve Next.js history state while tracking the distance needed to undo
    // a cancelled back/forward transition. No extra history entries are added.
    const originalPush = history.pushState, originalReplace = history.replaceState;
    let position = Number(history.state?.vetWorkspacePosition ?? 0), restoring = false;
    const stamp = (state: unknown, index: number) => ({ ...(state && typeof state === "object" ? state : {}), vetWorkspacePosition: index });
    originalReplace.call(history, stamp(history.state, position), "");
    const push: History["pushState"] = function(this: History, state, title, url) { originalPush.call(this, stamp(state, ++position), title, url); };
    const replace: History["replaceState"] = function(this: History, state, title, url) { originalReplace.call(this, stamp(state, position), title, url); };
    history.pushState = push; history.replaceState = replace;
    const pop = (event: PopStateEvent) => {
      const target = event.state?.vetWorkspacePosition;
      if (restoring) { restoring = false; event.stopImmediatePropagation(); return; }
      if (typeof target !== "number") return;
      if (target !== position && !allowLeave()) { event.stopImmediatePropagation(); restoring = true; history.go(position - target); }
      else position = target;
    };
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.current.size) { event.preventDefault(); event.returnValue = ""; } };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.hasAttribute("download") || anchor.target === "_blank") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.pathname === location.pathname && url.search === location.search) return;
      if (!allowLeave()) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", pop, true);
    document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("popstate", pop, true); document.removeEventListener("click", click, true); if (history.pushState === push) history.pushState = originalPush; if (history.replaceState === replace) history.replaceState = originalReplace; };
  }, [allowLeave]);
  return <Context.Provider value={{ register, release, allowLeave }}>{children}</Context.Provider>;
}

export function useNavigationGuard() { return useContext(Context); }
export function useUnsavedChanges(changed: boolean) {
  const id = useId(); const { register, release, allowLeave } = useNavigationGuard();
  useLayoutEffect(() => { register(id, changed); return () => release(id); }, [id, changed, register, release]);
  return { clear: () => release(id), allowLeave };
}

