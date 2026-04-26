import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import {
  getCalSamples,
  getPredictions,
  deletePrediction,
  getBlanks,
  avgBlankRGB,
  activeSamples,
} from "../../src/storage";
import {
  bestMetric,
  blankSigmas,
  fitAllMetrics,
  DEFAULT_EQUATION_LABEL,
} from "../../src/metrics";
import type { CalSample, Prediction } from "../../src/storage";

export default function PredictScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [cal, setCal] = useState<CalSample[]>([]);
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const c = await getCalSamples();
    const p = await getPredictions();
    p.sort((a, b) => b.createdAt - a.createdAt);
    setCal(c);
    setPreds(p);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const { hasCalibration, bestInfo } = useMemo(() => {
    const active = activeSamples(cal);
    if (active.length < 2) return { hasCalibration: false, bestInfo: null };
    const blanks = getBlanks(cal);
    const blankAvg = avgBlankRGB(cal);
    const sigmas = blanks.length >= 2
      ? blankSigmas(blanks.map((b) => ({ r: b.r, g: b.g, b: b.b })), blankAvg ?? undefined)
      : undefined;
    const fits = fitAllMetrics(
      active.map((s) => ({
        concentration: s.concentration,
        rgb: { r: s.r, g: s.g, b: s.b },
        excluded: s.excluded,
      })),
      blankAvg ?? undefined,
      sigmas
    );
    const b = bestMetric(fits);
    return { hasCalibration: !!(b && b.fit), bestInfo: b };
  }, [cal]);

  const startPredict = () => {
    router.push({ pathname: "/analyze", params: { mode: "predict" } });
  };

  const remove = async (id: string) => {
    await deletePrediction(id);
    load();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.label}>MEASURE · NEW SAMPLE</Text>
        <Text style={styles.title}>Predict</Text>

        {/* Mode banner */}
        <View
          style={[
            styles.banner,
            hasCalibration ? styles.bannerOk : styles.bannerWarn,
          ]}
          testID="predict-banner"
        >
          <Feather
            name={hasCalibration ? "check-circle" : "alert-triangle"}
            size={16}
            color={hasCalibration ? "#15803D" : "#92400E"}
          />
          <Text
            style={[
              styles.bannerText,
              { color: hasCalibration ? "#15803D" : "#92400E" },
            ]}
          >
            {hasCalibration
              ? `CALIBRATED · best: ${bestInfo?.metric.label}  (R² = ${bestInfo?.fit?.r2.toFixed(4)})`
              : `NO CALIBRATION — using default equation: ${DEFAULT_EQUATION_LABEL}`}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={startPredict}
          testID="start-predict-btn"
          activeOpacity={0.85}
        >
          <Feather name="target" size={18} color="#FFFFFF" />
          <Text style={styles.primaryBtnText}>MEASURE NEW SAMPLE</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push("/analysis")}
          style={styles.linkRow}
          testID="goto-predict-analysis"
          activeOpacity={0.85}
        >
          <Feather name="activity" size={14} color="#002FA7" />
          <Text style={styles.linkText}>VIEW PREDICT ANALYSIS</Text>
          <Feather name="chevron-right" size={14} color="#002FA7" />
        </TouchableOpacity>

        <Text style={styles.hint}>
          You'll select a region of interest on the image. RGB is extracted
          from that region and converted to concentration. Last 10
          predictions are kept here.
        </Text>

        {/* Predictions list */}
        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>
          RECENT · {preds.length}
        </Text>

        {loading ? (
          <ActivityIndicator color="#002FA7" style={{ marginVertical: 20 }} />
        ) : preds.length === 0 ? (
          <View style={styles.emptyBox} testID="predict-empty">
            <Feather name="inbox" size={30} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>NO PREDICTIONS YET</Text>
            <Text style={styles.emptySub}>
              Measure a sample to see predicted concentration here.
            </Text>
          </View>
        ) : (
          preds.map((p) => (
            <View key={p.id} style={styles.row} testID={`pred-item-${p.id}`}>
              {p.uri ? (
                <Image source={{ uri: p.uri }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, { backgroundColor: p.hex }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.bigValue}>
                  {Number.isFinite(p.predictedConcentration)
                    ? `${p.predictedConcentration.toFixed(3)} µM`
                    : "—"}
                </Text>
                <Text style={styles.meta}>
                  via{" "}
                  <Text style={styles.bold}>{p.bestMetricLabel}</Text>
                  {"  "}
                  {p.fallback ? (
                    <Text style={{ color: "#92400E" }}>[DEFAULT]</Text>
                  ) : (
                    <Text style={{ color: "#002FA7" }}>
                      R² {p.bestR2.toFixed(3)}
                    </Text>
                  )}
                </Text>
                <Text style={styles.meta}>
                  R {p.r} · G {p.g} · B {p.b} · {p.hex}
                </Text>
                <TouchableOpacity
                  onPress={async () => {
                    const { setAnalysisFocus } = await import("../../src/storage");
                    await setAnalysisFocus(p.id);
                    router.push("/analysis");
                  }}
                  style={styles.analyzeBtn}
                  testID={`pred-analyze-${p.id}`}
                  activeOpacity={0.85}
                >
                  <Feather name="activity" size={11} color="#002FA7" />
                  <Text style={styles.analyzeBtnText}>ANALYZE</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => remove(p.id)}
                hitSlop={10}
                testID={`pred-delete-${p.id}`}
              >
                <Feather name="trash-2" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          ))
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  scroll: { paddingHorizontal: 24, paddingBottom: 24 },
  label: {
    fontSize: 11,
    color: "#6B7280",
    letterSpacing: 2.4,
    fontWeight: "700",
    marginTop: 16,
  },
  title: {
    fontSize: 40,
    color: "#0A0A0A",
    fontWeight: "900",
    letterSpacing: -1.4,
    marginBottom: 18,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 16,
  },
  bannerOk: { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" },
  bannerWarn: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" },
  bannerText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    flex: 1,
  },
  primaryBtn: {
    backgroundColor: "#002FA7",
    height: 56,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 8,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginTop: 10,
  },
  linkText: {
    color: "#002FA7",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  hint: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 18,
    lineHeight: 17,
  },
  sectionLabel: {
    fontSize: 11,
    color: "#6B7280",
    letterSpacing: 2.2,
    fontWeight: "800",
    marginBottom: 10,
  },
  emptyBox: {
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
    borderWidth: 1,
    borderRadius: 6,
    padding: 28,
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F8F9FA",
  },
  emptyTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
    color: "#0A0A0A",
    marginTop: 4,
  },
  emptySub: {
    color: "#4B5563",
    textAlign: "center",
    fontSize: 13,
    maxWidth: 280,
    lineHeight: 18,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F8F9FA",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  bigValue: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0A0A0A",
    letterSpacing: -0.5,
  },
  meta: { fontSize: 12, color: "#4B5563", marginTop: 2 },
  bold: { color: "#0A0A0A", fontWeight: "700" },
  analyzeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 6,
  },
  analyzeBtnText: {
    color: "#002FA7",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
});
