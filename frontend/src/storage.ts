import AsyncStorage from "@react-native-async-storage/async-storage";

export const CAL_KEY = "chem_rgb_calibration_v2";
export const PRED_KEY = "chem_rgb_predictions_v2";
export const SETTINGS_KEY = "chem_rgb_settings_v1";
export const PRED_MAX = 10;

export type CalSample = {
  id: string;
  createdAt: number;
  name?: string;
  uri?: string;
  r: number;
  g: number;
  b: number;
  hex: string;
  concentration: number; // µM
  isBlank?: boolean;
  excluded?: boolean;
};

export type Prediction = {
  id: string;
  createdAt: number;
  uri?: string;
  r: number;
  g: number;
  b: number;
  hex: string;
  bestMetricId: string;
  bestMetricLabel: string;
  bestR2: number;
  predictedConcentration: number;
  fallback?: boolean;
};

export type RoiMode = "manual" | "center" | "locked";
export type Settings = {
  roiMode: RoiMode;
  lastRoi: { x: number; y: number } | null;
  regionSize: number;
};

export const DEFAULT_SETTINGS: Settings = {
  roiMode: "center",
  lastRoi: null,
  regionSize: 0.15,
};

async function readList<T>(key: string): Promise<T[]> {
  const raw = await AsyncStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T[]) : [];
}
async function writeList<T>(key: string, list: T[]) {
  await AsyncStorage.setItem(key, JSON.stringify(list));
}

export async function getSettings(): Promise<Settings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Settings) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export async function saveSettings(s: Partial<Settings>): Promise<Settings> {
  const cur = await getSettings();
  const next = { ...cur, ...s };
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

// Calibration
export async function getCalSamples(): Promise<CalSample[]> {
  return readList<CalSample>(CAL_KEY);
}
export async function addCalSample(s: CalSample) {
  const list = await getCalSamples();
  list.push(s);
  await writeList(CAL_KEY, list);
  return list;
}
export async function updateCalSample(id: string, patch: Partial<CalSample>) {
  const list = await getCalSamples();
  const next = list.map((s) => (s.id === id ? { ...s, ...patch } : s));
  await writeList(CAL_KEY, next);
  return next;
}
// Toggle individual blank flag (multi-blank capable)
export async function toggleBlankFlag(id: string) {
  const list = await getCalSamples();
  const next = list.map((s) =>
    s.id === id ? { ...s, isBlank: !s.isBlank } : s
  );
  await writeList(CAL_KEY, next);
  return next;
}
export async function clearAllBlanks() {
  const list = await getCalSamples();
  const next = list.map((s) => ({ ...s, isBlank: false }));
  await writeList(CAL_KEY, next);
  return next;
}
export async function toggleExcluded(id: string) {
  const list = await getCalSamples();
  const next = list.map((s) =>
    s.id === id ? { ...s, excluded: !s.excluded } : s
  );
  await writeList(CAL_KEY, next);
  return next;
}
export async function deleteCalSample(id: string) {
  const list = (await getCalSamples()).filter((s) => s.id !== id);
  await writeList(CAL_KEY, list);
  return list;
}
export async function clearCal() {
  await AsyncStorage.removeItem(CAL_KEY);
}

// All blanks: explicit isBlank=true; if none, fall back to all conc=0 samples.
export function getBlanks(list: CalSample[]): CalSample[] {
  const explicit = list.filter((s) => s.isBlank);
  if (explicit.length > 0) return explicit;
  return list.filter((s) => s.concentration === 0);
}
export function avgBlankRGB(list: CalSample[]): { r: number; g: number; b: number } | null {
  const blanks = getBlanks(list);
  if (blanks.length === 0) return null;
  const r = blanks.reduce((a, s) => a + s.r, 0) / blanks.length;
  const g = blanks.reduce((a, s) => a + s.g, 0) / blanks.length;
  const b = blanks.reduce((a, s) => a + s.b, 0) / blanks.length;
  return { r, g, b };
}
export function activeSamples(list: CalSample[]): CalSample[] {
  return list.filter((s) => !s.excluded);
}

// Predictions (cap at PRED_MAX = 10, FIFO)
export async function getPredictions(): Promise<Prediction[]> {
  return readList<Prediction>(PRED_KEY);
}
export async function addPrediction(p: Prediction) {
  const list = await getPredictions();
  list.push(p);
  // keep only newest PRED_MAX
  list.sort((a, b) => b.createdAt - a.createdAt);
  const trimmed = list.slice(0, PRED_MAX);
  await writeList(PRED_KEY, trimmed);
  return trimmed;
}
export async function deletePrediction(id: string) {
  const list = (await getPredictions()).filter((s) => s.id !== id);
  await writeList(PRED_KEY, list);
  return list;
}
import AsyncStorage from "@react-native-async-storage/async-storage";

const FOCUS_KEY = "chem_rgb_analysis_focus_v1";
export async function setAnalysisFocus(predictionId: string) {
  await AsyncStorage.setItem(FOCUS_KEY, JSON.stringify({ predictionId }));
}
export async function consumeAnalysisFocus(): Promise<{ predictionId: string } | null> {
  const raw = await AsyncStorage.getItem(FOCUS_KEY);
  if (!raw) return null;
  await AsyncStorage.removeItem(FOCUS_KEY);
  try { return JSON.parse(raw); } catch { return null; }
}

export async function clearPredictions() {
  await AsyncStorage.removeItem(PRED_KEY);
}
