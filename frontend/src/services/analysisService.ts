import type {
  AnalysisResult,
  AnalyzeOptions,
} from "../types/biomechanics";
import type { AnalysisProgress } from "../engine/offlineAnalyzer";
import type { AppSettings } from "./settings";
import { Capacitor } from "@capacitor/core";

export type { AnalysisProgress };

export interface AnalysisRequestOptions {
  file: File;
  options: AnalyzeOptions;
  settings: AppSettings;
  onProgress?: (progress: AnalysisProgress) => void;
}

function analyzeEndpoint(serverUrl: string): string {
  const trimmed = serverUrl.trim().replace(/\/+$/, "");
  return trimmed ? `${trimmed}/api/analyze` : "/api/analyze";
}

async function analyzeRemote({
  file,
  options,
  settings,
  onProgress,
}: AnalysisRequestOptions): Promise<AnalysisResult> {
  onProgress?.({ stage: "Uploading video…", percent: 10 });

  const form = new FormData();
  form.append("video", file);
  form.append("bowler_type", options.bowlerType);
  form.append("bowling_arm", options.bowlingArm);
  form.append("camera_view", options.cameraView);

  onProgress?.({ stage: "Analyzing on server…", percent: 45 });
  const response = await fetch(analyzeEndpoint(settings.remoteServerUrl), {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      detail?: unknown;
    } | null;
    throw new Error(
      typeof body?.detail === "string"
        ? body.detail
        : `Analysis failed (${response.status})`,
    );
  }

  const payload = (await response.json()) as AnalysisResult;
  onProgress?.({ stage: "Analysis complete", percent: 100 });
  return { ...payload, engine: "remote" };
}

/**
 * Runs analysis on the phone by default (MediaPipe WASM) or against an
 * optional FastAPI server configured in Settings.
 */
export async function analyzeDelivery(
  request: AnalysisRequestOptions,
): Promise<AnalysisResult> {
  if (request.settings.engineMode === "on-device") {
    // Code-split so desktop/remote users do not download the MediaPipe bundle.
    const { analyzeVideoOffline } = await import("../engine/offlineAnalyzer");
    return analyzeVideoOffline(request.file, request.options, request.onProgress);
  }

  if (!request.settings.remoteServerUrl.trim() && Capacitor.isNativePlatform()) {
    throw new Error(
      "Add a Remote FastAPI Server URL in Settings, or switch to On-device mode.",
    );
  }

  return analyzeRemote(request);
}
