import { Alert, Platform } from "react-native";

export async function exportCSV(filename: string, csv: string) {
  try {
    if (Platform.OS === "web") {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }
    // Native (iOS/Android): dynamically require so web bundle never imports it.
    const FS = require("expo-file-system/legacy");
    const Sharing = require("expo-sharing");
    const dir = FS.cacheDirectory || FS.documentDirectory;
    const uri = `${dir}${filename}`;
    await FS.writeAsStringAsync(uri, csv, { encoding: "utf8" });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "text/csv",
        dialogTitle: "Export data",
      });
    } else {
      Alert.alert("Saved", `File saved to: ${uri}`);
    }
  } catch (e: any) {
    Alert.alert("Export failed", e?.message || String(e));
  }
}

// Save a base64-encoded PNG/JPEG image (no data URI prefix needed).
export async function exportImage(filename: string, base64: string, mime = "image/png") {
  try {
    if (Platform.OS === "web") {
      const a = document.createElement("a");
      a.href = `data:${mime};base64,${base64}`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    const FS = require("expo-file-system/legacy");
    const Sharing = require("expo-sharing");
    const dir = FS.cacheDirectory || FS.documentDirectory;
    const uri = `${dir}${filename}`;
    await FS.writeAsStringAsync(uri, base64, { encoding: "base64" });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: "Export image" });
    } else {
      Alert.alert("Saved", `Image saved to: ${uri}`);
    }
  } catch (e: any) {
    Alert.alert("Export failed", e?.message || String(e));
  }
}

export function csvEscape(v: any): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
