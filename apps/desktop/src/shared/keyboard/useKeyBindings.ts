import { useEffect, useRef, useSyncExternalStore } from "react";
import { keymap, type KeyBinding } from "./keymap";

/**
 * Registers `bindings` while the calling component is mounted. `run` callbacks may change every
 * render: the registry always calls the latest one. The registration itself is renewed only when
 * an id, key, label, group or flag changes.
 *
 * ```tsx
 * useKeyBindings([
 *   { id: "today.confirm", keys: "C", label: "Confirm review item", group: "Today", run: confirm },
 *   { id: "list.next", keys: ["J", "ArrowDown"], label: "Next item", group: "Lists", run: next },
 * ]);
 * ```
 */
export function useKeyBindings(bindings: readonly KeyBinding[]): void {
  const latest = useRef(bindings);
  useEffect(() => {
    latest.current = bindings;
  });

  const signature = JSON.stringify(
    bindings.map(({ id, keys, label, group, enabled, inTextFields, inOverlays, hidden, when }) => [
      id,
      keys,
      label,
      group,
      enabled,
      inTextFields,
      inOverlays,
      hidden,
      when !== undefined,
    ]),
  );

  useEffect(() => {
    const unregister = latest.current.map((binding) =>
      keymap.register({
        ...binding,
        run: (event) => latest.current.find((current) => current.id === binding.id)?.run(event),
        ...(binding.when && {
          when: (event: KeyboardEvent) =>
            latest.current.find((current) => current.id === binding.id)?.when?.(event) ?? true,
        }),
      }),
    );
    return () => {
      for (const stop of unregister) stop();
    };
  }, [signature]);
}

/** Every binding registered right now, in registration order (the shortcuts sheet). */
export function useRegisteredBindings(): readonly KeyBinding[] {
  return useSyncExternalStore(keymap.subscribe, keymap.bindings);
}
