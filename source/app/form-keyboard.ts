import type { KeyboardEvent } from "react";

export function isFormSaveEnter(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== "Enter") return false;
  if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
    event.preventDefault();
    return false;
  }
  return !event.defaultPrevented && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey
    && event.target instanceof HTMLInputElement && ["text", "number", "url", "email", "search", "date", "time", "month"].includes(event.target.type);
}

export function submitFormOnEnter(event: KeyboardEvent<HTMLFormElement>) {
  if (!isFormSaveEnter(event)) return;
  event.preventDefault();
  event.currentTarget.requestSubmit();
}
