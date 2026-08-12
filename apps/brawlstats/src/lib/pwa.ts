import { useSyncExternalStore } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let pendingPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((listener) => listener());
}

export function initializePwa() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    pendingPrompt = event as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    pendingPrompt = null;
    emit();
  });
}

export function useInstallPrompt() {
  const available = useSyncExternalStore(subscribe, () => pendingPrompt !== null, () => false);
  async function install(): Promise<boolean> {
    if (!pendingPrompt) return false;
    const prompt = pendingPrompt;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") {
      pendingPrompt = null;
      emit();
      return true;
    }
    return false;
  }
  return { available, install };
}
