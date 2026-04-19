import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addCalSample,
  addPrediction,
  getCalSamples,
  selectBlankSample,
} from "../src/storage";
import {
  bestMetric,
  defaultEquationValue,
  DEFAULT_EQUATION_LABEL,
  fitAllMetrics,
  METRICS,
  predictConcentration,
} from "../src/metrics";
import { pickFromGallery, takePhoto } from "../src/imagePicker";

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL || "";

type Mode = "calibrate" | "predict";

type ImageState = { uri: string; base64: string } | null;

export default function AnalyzeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: Mode }>();
  const mode: Mode = params.mode === "predict" ? "predict" : "calibrate";

  const [image, setImage] = useState<ImageState>(null);
  const [rgb, setRgb] = useState<{ r: number; g: number; b: number; hex: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [tapPoint, setTapPoint] = useState<{ x: number; y: number } | null>(null);
  const [imgBox, setImgBox] = useState<{ w: number; h: number }>({ w: 1, h: 1 });

  // Calibration inputs
  const [concentration, setConcentration] = useState<string>("");
  const [asBlank, setAsBlank] = useState(false);
  const [sampleName, setSampleName] = useState("");

  // Calibration data (for predict mode fits)
  const [calSamplesLoaded, setCalSamplesLoaded] = useState(false);
  const [calFits, setCalFits] = useState<ReturnType<typeof fitAllMetrics>>([]);
  const [hasCal, setHasCal] = useState(false);
  const blankRef = useRef<{ r: number; g: number; b: number } | undefined>(undefined);

  const [saving, setSaving] = useState(false);

  // Load calibration for predict mode
  useEffect(() => {
    (async () => {
      const cs = await getCalSamples();
      if (cs.length >= 2) {
        const blank = selectBlankSample(cs);
        blankRef.current = blank ? { r: blank.r, g: blank.g, b: blank.b } : undefined;
        const fits = fitAllMetrics(
          cs.map((s) => ({
            concentration: s.concentration,
            rgb: { r: s.r, g: s.g, b: s.b },
          })),
          blankRef.current
        );
        setCalFits(fits);
        setHasCal(true);
      } else {
        setHasCal(false);
      }
      setCalSamplesLoaded(true);
    })();
  }, []);

  const pickImage = useCallback(async (src: "camera" | "gallery") => {
    const p = src === "camera" ? await takePhoto() : await pickFromGallery();
    if (!p) return;
    setImage(p);
    setRgb(null);
    setTapPoint(null);
  }, []);

  const callExtract = async (xNorm: number, yNorm: number) => {
    if (!image) return;
    setLoading(true);
    try {
      const body = {
        image_base64: image.base64,
        x: xNorm,
        y: yNorm,
        region_size: 0.08,
      };
      const res = await fetch(`${BACKEND}/api/extract-rgb`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRgb({ r: data.r, g: data.g, b: data.b, hex: data.hex });
    } catch (e: any) {
      Alert.alert("Extraction failed", e?.message || "Please retry.");
    } finally {
      setLoading(false);
    }
  };

  const onImageLayout = (e: any) => {
    const { width, height } = e.nativeEvent.layout;
    setImgBox({ w: width, h: height });
  };

  const onImagePress = (e: any) => {
    if (!image) return;
    const { locationX, locationY } = e.nativeEvent;
    const xNorm = Math.max(0, Math.min(1, locationX / imgBox.w));
    const yNorm = Math.max(0, Math.min(1, locationY / imgBox.h));
    setTapPoint({ x: locationX, y: locationY });
    callExtract(xNorm, yNorm);
  };

  // Predict mode — per-metric values
  const predictRows = useMemo(() => {
    if (mode !== "predict" || !rgb) return [];
    if (hasCal) {
      return calFits.map((f) => {
        if (!f.fit) {
          return {
            id: f.metric.id,
            label: f.metric.label,
            r2: null as number | null,
            prediction: NaN,
            note: f.error,
          };
        }
        const prediction = predictConcentration(
          f.fit,
          f.metric,
          rgb,
          blankRef.current
        );
        return {
          id: f.metric.id,
          label: f.metric.label,
          r2: f.fit.r2,
          prediction,
          note: undefined,
        };
      });
    }
    // Fallback: just show default equation value
    return [
      {
        id: "default",
        label: DEFAULT_EQUATION_LABEL,
        r2: null,
        prediction: defaultEquationValue(rgb),
        note: "Default equation output (no calibration)",
      },
    ];
  }, [mode, rgb, calFits, hasCal]);

  const bestRow = useMemo(() => {
    if (mode !== "predict" || !hasCal) return null;
    const b = bestMetric(calFits);
    if (!b || !b.fit) return null;
    return {
      label: b.metric.label,
      r2: b.fit.r2,
      value: predictConcentration(b.fit, b.metric, rgb!, blankRef.current),
    };
  }, [mode, hasCal, calFits, rgb]);

  const onSave = async () => {
    if (!rgb) {
      Alert.alert("No RGB", "Tap the image to sample a region first.");
      return;
    }
    setSaving(true);
    try {
      if (mode === "calibrate") {
        const conc = parseFloat(concentration);
        if (!Number.isFinite(conc)) {
          Alert.alert("Concentration required", "Enter a numeric value.");
          setSaving(false);
          return;
        }
        await addCalSample({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          createdAt: Date.now(),
          name: sampleName.trim() || `C=${conc}`,
          uri: image?.uri,
          r: rgb.r,
          g: rgb.g,
          b: rgb.b,
          hex: rgb.hex,
          concentration: conc,
          isBlank: asBlank,
        });
        router.back();
      } else {
        // predict
        let bestLabel = DEFAULT_EQUATION_LABEL;
        let bestId = "default";
        let bestR2 = 0;
        let predicted = defaultEquationValue(rgb);
        let fallback = true;
        if (hasCal && bestRow) {
          const b = bestMetric(calFits);
          bestLabel = b!.metric.label;
          bestId = b!.metric.id;
          bestR2 = b!.fit!.r2;
          predicted = bestRow.value;
          fallback = false;
        }
        await addPrediction({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          createdAt: Date.now(),
          uri: image?.uri,
          r: rgb.r,
          g: rgb.g,
          b: rgb.b,
          hex: rgb.hex,
          bestMetricId: bestId,
          bestMetricLabel: bestLabel,
          bestR2,
          predictedConcentration: predicted,
          fallback,
        });
        router.back();
      }
    } catch (e: any) {
      Alert.alert("Save failed", e?.message || "Please retry.");
    } finally {
      setSaving(false);
    }
  };

  const title = mode === "calibrate" ? "Add calibration" : "New measurement";
  const subtitle =
    mode === "calibrate"
      ? "SAMPLE · KNOWN CONCENTRATION"
      : "ROI · PREDICT CONCENTRATION";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#FFFFFF" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={12}
            testID="analyze-back-btn"
          >
            <Feather name="chevron-left" size={26} color="#0A0A0A" />
          </TouchableOpacity>
          <Text style={styles.label}>{subtitle}</Text>
          <View style={{ width: 26 }} />
        </View>

        <Text style={styles.title}>{title}</Text>

        {/* Image pick buttons */}
        {!image && (
          <View style={styles.pickCol}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => pickImage("camera")}
              testID="analyze-camera-btn"
              activeOpacity={0.85}
            >
              <Feather name="camera" size={18} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>TAKE PHOTO</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => pickImage("gallery")}
              testID="analyze-gallery-btn"
              activeOpacity={0.85}
            >
              <Feather name="upload" size={18} color="#0A0A0A" />
              <Text style={styles.secondaryBtnText}>UPLOAD FROM GALLERY</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Image + ROI tap */}
        {image && (
          <>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={onImagePress}
              style={styles.imageWrap}
              testID="analyze-image-touchable"
            >
              <Image
                source={{ uri: image.uri }}
                style={styles.image}
                resizeMode="cover"
                onLayout={onImageLayout}
              />
              {tapPoint && (
                <View
                  pointerEvents="none"
                  style={[
                    styles.crosshair,
                    { left: tapPoint.x - 16, top: tapPoint.y - 16 },
                  ]}
                />
              )}
              {!tapPoint && (
                <View pointerEvents="none" style={styles.tapHint}>
                  <Feather name="crosshair" size={16} color="#FFFFFF" />
                  <Text style={styles.tapHintText}>
                    TAP THE REGION OF INTEREST
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.topRow}>
              <TouchableOpacity
                onPress={() => {
                  setImage(null);
                  setRgb(null);
                  setTapPoint(null);
                }}
                testID="analyze-change-img-btn"
                style={styles.linkBtn}
              >
                <Feather name="refresh-ccw" size={14} color="#002FA7" />
                <Text style={styles.linkBtnText}>CHANGE IMAGE</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* RGB display */}
        {image && (
          <View style={styles.bentoRow}>
            <MetricCard
              label="R"
              value={rgb?.r ?? 0}
              color="#EF4444"
              loading={loading}
              testID="rgb-value-red"
            />
            <MetricCard
              label="G"
              value={rgb?.g ?? 0}
              color="#22C55E"
              loading={loading}
              testID="rgb-value-green"
            />
            <MetricCard
              label="B"
              value={rgb?.b ?? 0}
              color="#3B82F6"
              loading={loading}
              testID="rgb-value-blue"
            />
          </View>
        )}
        {rgb && (
          <View style={styles.hexRow}>
            <View style={[styles.swatch, { backgroundColor: rgb.hex }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.statKey}>HEX</Text>
              <Text style={styles.statVal}>{rgb.hex}</Text>
            </View>
          </View>
        )}

        {/* Calibrate inputs */}
        {mode === "calibrate" && rgb && (
          <>
            <Text style={styles.sectionLabel}>CONCENTRATION</Text>
            <TextInput
              style={styles.numInput}
              keyboardType="decimal-pad"
              value={concentration}
              onChangeText={setConcentration}
              placeholder="e.g. 5.0"
              placeholderTextColor="#9CA3AF"
              testID="concentration-input"
            />
            <TextInput
              style={[styles.numInput, { marginTop: 10 }]}
              value={sampleName}
              onChangeText={setSampleName}
              placeholder="Sample name (optional)"
              placeholderTextColor="#9CA3AF"
              testID="sample-name-input"
            />
            <TouchableOpacity
              onPress={() => setAsBlank((b) => !b)}
              style={[styles.blankToggle, asBlank && styles.blankToggleActive]}
              testID="blank-toggle"
              activeOpacity={0.85}
            >
              <Feather
                name={asBlank ? "star" : "circle"}
                size={16}
                color={asBlank ? "#0A0A0A" : "#9CA3AF"}
              />
              <Text style={styles.blankToggleText}>
                {asBlank ? "MARKED AS BLANK (I\u2080)" : "MARK AS BLANK (I\u2080)"}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* Predict output */}
        {mode === "predict" && rgb && calSamplesLoaded && (
          <>
            {hasCal && bestRow ? (
              <View style={styles.bigResult} testID="predict-result">
                <Text style={styles.bigResultLabel}>
                  PREDICTED CONCENTRATION
                </Text>
                <Text style={styles.bigResultValue}>
                  {Number.isFinite(bestRow.value)
                    ? bestRow.value.toFixed(3)
                    : "—"}
                </Text>
                <Text style={styles.bigResultMeta}>
                  via <Text style={{ fontWeight: "800" }}>{bestRow.label}</Text>
                  {"  "}·  R² {bestRow.r2.toFixed(3)}
                </Text>
              </View>
            ) : (
              <View style={styles.fallbackBanner}>
                <Feather name="alert-triangle" size={14} color="#92400E" />
                <Text style={styles.fallbackText}>
                  No calibration — using default equation.{"\n"}
                  Value: {Number.isFinite(defaultEquationValue(rgb))
                    ? defaultEquationValue(rgb).toFixed(4)
                    : "—"}{" "}
                  ({DEFAULT_EQUATION_LABEL})
                </Text>
              </View>
            )}

            {/* Per-metric table */}
            <Text style={[styles.sectionLabel, { marginTop: 14 }]}>
              ALL {hasCal ? "EQUATIONS" : ""} · PREDICTIONS
            </Text>
            {predictRows.map((r) => (
              <View key={r.id} style={styles.predRow} testID={`pred-row-${r.id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.predLabel} numberOfLines={2}>
                    {r.label}
                  </Text>
                  {r.r2 !== null && (
                    <Text style={styles.predR2}>R² {r.r2.toFixed(3)}</Text>
                  )}
                  {r.note && <Text style={styles.predMute}>{r.note}</Text>}
                </View>
                <Text style={styles.predValue}>
                  {Number.isFinite(r.prediction)
                    ? r.prediction.toFixed(3)
                    : "—"}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* Save */}
        {image && rgb && (
          <TouchableOpacity
            onPress={onSave}
            disabled={saving}
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            testID="save-analyze-btn"
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Feather name="save" size={18} color="#FFFFFF" />
                <Text style={styles.saveBtnText}>
                  {mode === "calibrate" ? "SAVE TO CALIBRATION" : "SAVE PREDICTION"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function MetricCard({
  label,
  value,
  color,
  loading,
  testID,
}: {
  label: string;
  value: number;
  color: string;
  loading: boolean;
  testID?: string;
}) {
  return (
    <View style={[styles.metricCard, { borderLeftColor: color }]} testID={testID}>
      <Text style={[styles.metricLabel, { color }]}>{label}</Text>
      {loading ? (
        <ActivityIndicator color="#0A0A0A" style={{ marginTop: 8 }} />
      ) : (
        <Text style={styles.metricValue}>{value}</Text>
      )}
      <Text style={styles.metricUnit}>/ 255</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  label: {
    fontSize: 10,
    color: "#6B7280",
    letterSpacing: 2.2,
    fontWeight: "800",
  },
  title: {
    fontSize: 30,
    color: "#0A0A0A",
    fontWeight: "900",
    letterSpacing: -1,
    marginBottom: 18,
  },
  pickCol: { gap: 10, marginBottom: 20 },
  primaryBtn: {
    backgroundColor: "#002FA7",
    height: 56,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  secondaryBtn: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: "#0A0A0A",
    height: 56,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  secondaryBtnText: {
    color: "#0A0A0A",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  imageWrap: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#F8F9FA",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 10,
  },
  image: { width: "100%", height: "100%" },
  crosshair: {
    position: "absolute",
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    backgroundColor: "rgba(0,47,167,0.45)",
  },
  tapHint: {
    position: "absolute",
    bottom: 10,
    alignSelf: "center",
    backgroundColor: "rgba(10,10,10,0.75)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tapHintText: {
    color: "#FFFFFF",
    fontSize: 11,
    letterSpacing: 1.6,
    fontWeight: "800",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 10,
  },
  linkBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  linkBtnText: {
    color: "#002FA7",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  bentoRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  metricCard: {
    flex: 1,
    backgroundColor: "#F8F9FA",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderLeftWidth: 4,
    borderRadius: 6,
    padding: 14,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2.2,
  },
  metricValue: {
    marginTop: 6,
    fontSize: 28,
    fontWeight: "900",
    color: "#0A0A0A",
    letterSpacing: -1,
  },
  metricUnit: { fontSize: 11, color: "#6B7280", marginTop: -2 },
  hexRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F8F9FA",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  statKey: {
    fontSize: 10,
    color: "#6B7280",
    fontWeight: "800",
    letterSpacing: 2,
  },
  statVal: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0A0A0A",
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "800",
    letterSpacing: 2.2,
    marginBottom: 8,
    marginTop: 6,
  },
  numInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: "#0A0A0A",
    backgroundColor: "#FFFFFF",
  },
  blankToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 6,
  },
  blankToggleActive: {
    backgroundColor: "#FFFBEA",
    borderColor: "#FFC300",
  },
  blankToggleText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: "#0A0A0A",
  },
  bigResult: {
    backgroundColor: "#FFFBEA",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#FFC300",
    padding: 18,
    marginTop: 4,
  },
  bigResultLabel: {
    fontSize: 11,
    color: "#92400E",
    letterSpacing: 2.2,
    fontWeight: "800",
  },
  bigResultValue: {
    fontSize: 44,
    fontWeight: "900",
    color: "#0A0A0A",
    letterSpacing: -1.4,
    marginTop: 2,
  },
  bigResultMeta: { fontSize: 13, color: "#4B5563", marginTop: 4 },
  fallbackBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderWidth: 1,
    padding: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  fallbackText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#92400E",
    flex: 1,
    lineHeight: 17,
  },
  predRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 6,
    backgroundColor: "#F8F9FA",
    marginBottom: 6,
  },
  predLabel: { fontSize: 13, fontWeight: "700", color: "#0A0A0A" },
  predR2: { fontSize: 11, color: "#002FA7", fontWeight: "700", marginTop: 2 },
  predMute: { fontSize: 11, color: "#92400E", fontWeight: "600", marginTop: 2 },
  predValue: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0A0A0A",
    minWidth: 70,
    textAlign: "right",
  },
  saveBtn: {
    marginTop: 18,
    backgroundColor: "#002FA7",
    height: 56,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
});
