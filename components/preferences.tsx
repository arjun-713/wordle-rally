"use client";
import { useEffect, useState } from "react";
import { Settings2, Volume2, Vibrate } from "lucide-react";
import { Modal } from "./shared";
type Preferences = { sound: boolean; haptics: boolean };
const defaults: Preferences = { sound: false, haptics: false };
function preferences(): Preferences {
  try {
    return {
      ...defaults,
      ...JSON.parse(localStorage.getItem("rally-preferences") ?? "{}"),
    };
  } catch {
    return fallbackPreferences;
  }
}
let fallbackPreferences = defaults;
let context: AudioContext | undefined;
export function unlockFeedback() {
  if (!preferences().sound) return;
  try {
    context ??= new AudioContext();
    void context.resume().catch(() => {});
  } catch {
    /* Unsupported audio is optional. */
  }
}
export function feedback(kind: "guess" | "win" | "error") {
  const prefs = preferences();
  if (prefs.haptics && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(
        kind === "win" ? [25, 40, 35] : kind === "error" ? [15, 25, 15] : 12,
      );
    } catch {
      /* Device may decline vibration. */
    }
  }
  if (!prefs.sound || !context || context.state !== "running") return;
  const audio = context;
  const notes =
    kind === "win"
      ? [523.25, 659.25, 783.99]
      : kind === "error"
        ? [180]
        : [392];
  notes.forEach((frequency, i) => {
    const oscillator = audio.createOscillator(),
      gain = audio.createGain(),
      start = audio.currentTime + i * 0.09;
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.045, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.13);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.15);
  });
}
export function PreferencesButton() {
  const [open, setOpen] = useState(false),
    [prefs, setPrefs] = useState(defaults),
    [haptics, setHaptics] = useState(false);
  useEffect(() => {
    setPrefs(preferences());
    setHaptics(typeof navigator.vibrate === "function");
  }, []);
  function update(key: keyof Preferences, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    fallbackPreferences = next;
    try {
      localStorage.setItem("rally-preferences", JSON.stringify(next));
    } catch {
      /* The puzzle remains available. */
    }
    if (key === "sound" && value) {
      unlockFeedback();
      feedback("guess");
    }
    if (key === "haptics" && value) feedback("guess");
  }
  return (
    <>
      <button
        className="text-button preferences-button"
        aria-label="Game settings"
        onClick={() => setOpen(true)}
      >
        <Settings2 size={18} />
        <span>Settings</span>
      </button>
      {open && (
        <Modal title="A little feedback." close={() => setOpen(false)}>
          <p className="form-intro">
            Make the game sound and feel the way you like. Both are off until
            you choose.
          </p>
          <label className="preference-row">
            <Volume2 size={21} />
            <span>
              <strong>Sound effects</strong>
              <small>Soft tones for guesses, wins, and errors.</small>
            </span>
            <input
              type="checkbox"
              aria-label="Sound effects"
              checked={prefs.sound}
              onChange={(e) => update("sound", e.target.checked)}
            />
          </label>
          <label className="preference-row">
            <Vibrate size={21} />
            <span>
              <strong>Haptic feedback</strong>
              <small>
                {haptics
                  ? "A gentle tap on supported devices."
                  : "Vibration is unavailable in this browser."}
              </small>
            </span>
            <input
              type="checkbox"
              aria-label="Haptic feedback"
              disabled={!haptics}
              checked={prefs.haptics}
              onChange={(e) => update("haptics", e.target.checked)}
            />
          </label>
          <p className="settings-note">
            Motion follows your device’s reduced motion setting. Preferences are
            saved in this browser.
          </p>
          <button
            className="button secondary full"
            disabled={!prefs.sound && !prefs.haptics}
            onClick={() => {
              unlockFeedback();
              feedback("win");
            }}
          >
            Try win feedback
          </button>
        </Modal>
      )}
    </>
  );
}
