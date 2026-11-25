import { useEffect, useState } from "react";

import type { AppSettings, EngineMode } from "../services/settings";

interface SettingsModalProps {
  open: boolean;
  settings: AppSettings;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
}

const ENGINE_OPTIONS: Array<{
  mode: EngineMode;
  title: string;
  description: string;
}> = [
  {
    mode: "on-device",
    title: "On-device offline",
    description:
      "MediaPipe pose analysis runs inside the app. No internet or server needed — ideal at the ground.",
  },
  {
    mode: "remote",
    title: "Remote FastAPI server",
    description:
      "Send the video to a FastAPI backend on your laptop or LAN for the server-side pipeline.",
  },
];

export default function SettingsModal({
  open,
  settings,
  onClose,
  onSave,
}: SettingsModalProps) {
  const [draft, setDraft] = useState<AppSettings>(settings);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <section className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-800 bg-slate-900 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:p-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 id="settings-title" className="text-lg font-semibold text-slate-100">
              Analysis settings
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Choose where the delivery is processed.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg border border-slate-700 px-3 text-sm text-slate-300 transition hover:border-cyan-500 hover:text-cyan-300"
          >
            Close
          </button>
        </header>

        <div className="mt-5 space-y-3">
          {ENGINE_OPTIONS.map((option) => {
            const active = draft.engineMode === option.mode;
            return (
              <button
                key={option.mode}
                type="button"
                onClick={() => setDraft((current) => ({ ...current, engineMode: option.mode }))}
                aria-pressed={active}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  active
                    ? "border-cyan-500/70 bg-cyan-500/10"
                    : "border-slate-700 bg-slate-950/40 hover:border-slate-500"
                }`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-100">{option.title}</span>
                  <span
                    className={`h-4 w-4 rounded-full border-2 ${
                      active ? "border-cyan-400 bg-cyan-400" : "border-slate-600"
                    }`}
                    aria-hidden="true"
                  />
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-400">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>

        {draft.engineMode === "remote" && (
          <label className="mt-5 block text-sm">
            <span className="mb-1.5 block font-medium text-slate-300">
              Remote FastAPI Server URL
            </span>
            <input
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={draft.remoteServerUrl}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  remoteServerUrl: event.target.value,
                }))
              }
              placeholder="http://192.168.1.20:8000"
              className="min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-base text-slate-100 outline-none focus:border-cyan-500"
            />
            <span className="mt-1.5 block text-xs text-slate-500">
              Leave blank to use the same origin as the web app. Android devices
              need your computer&apos;s LAN IP.
            </span>
          </label>
        )}

        <p className="mt-5 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs leading-relaxed text-slate-500">
          On-device mode bundles the MediaPipe runtime and pose model with the
          app. Videos stay on the phone.
        </p>

        <button
          type="button"
          onClick={() => {
            onSave(draft);
            onClose();
          }}
          className="mt-5 min-h-12 w-full rounded-xl bg-cyan-500 px-5 font-semibold text-slate-950 transition hover:bg-cyan-400"
        >
          Save settings
        </button>
      </section>
    </div>
  );
}
