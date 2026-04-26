import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Alert, Platform } from "react-native";

export async function exportCSV(filename: string, csv: string) {
  try {
    if (Platform.OS === "web") {
      // Browser: trigger download
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const dir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory;
    const uri = `${dir}${filename}`;
    await (FileSystem as any).writeAsStringAsync(uri, csv, {
      encoding: "utf8",
    });
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

export function csvEscape(v: any): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
