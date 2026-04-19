import AsyncStorage from "@react-native-async-storage/async-storage";

export const CAL_KEY = "chem_rgb_calibration_v2";
export const PRED_KEY = "chem_rgb_predictions_v2";

export type CalSample = {
  id: string;
  createdAt: number;
  name?: string;
  uri?: string;
  r: number;
  g: number;
  b: number;
  hex: string;
  concentration: number;
  isBlank?: boolean; // manually marked blank overrides auto-detection
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
  fallback?: boolean; // used default equation (no calibration)
};

async function readList<T>(key: string): Promise<T[]> {
  const raw = await AsyncStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T[]) : [];
}
async function writeList<T>(key: string, list: T[]) {
  await AsyncStorage.setItem(key, JSON.stringify(list));
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
export async function deleteCalSample(id: string) {
  const list = (await getCalSamples()).filter((s) => s.id !== id);
  await writeList(CAL_KEY, list);
  return list;
}
export async function clearCal() {
  await AsyncStorage.removeItem(CAL_KEY);
}

// Blank selection: manually marked isBlank, else sample with concentration === 0
export function selectBlankSample(list: CalSample[]): CalSample | null {
  const manual = list.find((s) => s.isBlank);
  if (manual) return manual;
  const zero = list.find((s) => s.concentration === 0);
  return zero || null;
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
