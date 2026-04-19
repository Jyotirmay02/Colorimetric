import AsyncStorage from "@react-native-async-storage/async-storage";

export const CAL_KEY = "chem_rgb_calibration_v2";
export const PRED_KEY = "chem_rgb_predictions_v2";
export const SETTINGS_KEY = "chem_rgb_settings_v1";

export type CalSample = {
  id: string;
  createdAt: number;
  name?: string;
  uri?: string;
  r: number;
  g: number;
  b: number;
  hex: string;
  concentration: number; // in micromolar (µM)
  isBlank?: boolean;
  excluded?: boolean; // keep but drop from fit
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
  predictedConcentration: number; // in µM
  fallback?: boolean;
};

export type RoiMode = "manual" | "center" | "locked";
export type Settings = {
  roiMode: RoiMode;
  lastRoi: { x: number; y: number } | null; // normalized 0..1
  regionSize: number; // 0..0.5, fraction of min(w,h)
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

// Settings
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
export async function setBlank(id: string) {
  const list = await getCalSamples();
  const next = list.map((s) => ({ ...s, isBlank: s.id === id }));
  await writeList(CAL_KEY, next);
  return next;
}
export async function clearBlank() {
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

// Blank resolution:
// 1. Sample explicitly marked isBlank
// 2. Any sample with concentration === 0 (auto)
export function selectBlankSample(list: CalSample[]): CalSample | null {
  const manual = list.find((s) => s.isBlank);
  if (manual) return manual;
  const zero = list.find((s) => s.concentration === 0);
  return zero || null;
}

// Returns only the samples that actually participate in the fit (not excluded).
export function activeSamples(list: CalSample[]): CalSample[] {
  return list.filter((s) => !s.excluded);
}

// Predictions
export async function getPredictions(): Promise<Prediction[]> {
  return readList<Prediction>(PRED_KEY);
}
export async function addPrediction(p: Prediction) {
  const list = await getPredictions();
  list.push(p);
  await writeList(PRED_KEY, list);
  return list;
}
export async function deletePrediction(id: string) {
  const list = (await getPredictions()).filter((s) => s.id !== id);
  await writeList(PRED_KEY, list);
  return list;
}
export async function clearPredictions() {
  await AsyncStorage.removeItem(PRED_KEY);
}
