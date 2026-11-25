import { Camera, MediaTypeSelection } from "@capacitor/camera";
import type { MediaResult } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";

export type VideoSource = "camera" | "gallery";

const MIME_BY_EXTENSION: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  "3gp": "video/3gpp",
  mkv: "video/x-matroska",
};

function extensionFrom(result: MediaResult): string {
  const format = result.metadata?.format?.toLowerCase();
  if (format && format !== "unknown") return format.replace("jpeg", "jpg");
  const candidate = (result.uri ?? result.webPath ?? "").split("?")[0];
  const match = candidate.match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase() ?? "mp4";
}

async function mediaResultToFile(result: MediaResult): Promise<File> {
  const source =
    result.webPath ??
    (result.uri ? Capacitor.convertFileSrc(result.uri) : undefined);
  if (!source) throw new Error("The device did not return a readable video.");

  const response = await fetch(source);
  if (!response.ok) throw new Error("Unable to read the recorded video.");
  const blob = await response.blob();
  const extension = extensionFrom(result);
  const type = blob.type.startsWith("video/")
    ? blob.type
    : MIME_BY_EXTENSION[extension] ?? "video/mp4";
  const name = `bowlmetrics-delivery-${Date.now()}.${extension}`;
  return new File([blob], name, { type });
}

/**
 * Opens the native Android camera (video mode) or gallery picker. Returns
 * `null` when the user cancels. Only call this on a native platform.
 */
export async function pickNativeVideo(
  source: VideoSource,
): Promise<File | null> {
  if (!Capacitor.isNativePlatform()) return null;

  try {
    if (source === "camera") {
      const result = await Camera.recordVideo({
        saveToGallery: false,
        includeMetadata: true,
        isPersistent: false,
      });
      return await mediaResultToFile(result);
    }

    const results = await Camera.chooseFromGallery({
      mediaType: MediaTypeSelection.Video,
      allowMultipleSelection: false,
      limit: 1,
      includeMetadata: true,
    });
    const result = results.results[0];
    if (!result) return null;
    return await mediaResultToFile(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/cancel/i.test(message)) return null;
    throw new Error(`Could not open the device ${source}: ${message}`);
  }
}
