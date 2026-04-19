import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import {
  CalSample,
  deleteCalSample,
  getCalSamples,
  selectBlankSample,
  setBlank,
  clearBlank,
  clearCal,
  toggleExcluded,
  activeSamples,
} from "../../src/storage";
import { bestMetric, fitAllMetrics } from "../../src/metrics";

export default function CalibrateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [samples, setSamples] = useState<CalSample[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await getCalSamples();
    list.sort((a, b) => a.concentration - b.concentration);
    setSamples(list);
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

  const blank = selectBlankSample(samples);
  const blankId = blank?.id ?? null;
  const active = activeSamples(samples);

  const rgbList = active.map((s) => ({
    concentration: s.concentration,
    rgb: { r: s.r, g: s.g, b: s.b },
    excluded: s.excluded,
  }));
  const blankRGB = blank ? { r: blank.r, g: blank.g, b: blank.b } : undefined;
  const fits = active.length >= 2 ? fitAllMetrics(rgbList, blankRGB) : [];
  const best = fits.length ? bestMetric(fits) : null;

  // Warn when concentration range span is very wide — likely saturation.
  const rangeWarning = useMemo(() => {
    if (active.length < 3) return null;
    const xs = active.map((s) => s.concentration).filter((x) => x > 0);
    if (xs.length < 3) return null;
    const mn = Math.min(...xs);
    const mx = Math.max(...xs);
    if (mn > 0 && mx / mn >= 10) {
      return `Wide range (${mn}\u2013${mx} \u00B5M). Response may be non-linear at high concentrations \u2014 consider excluding outliers.`;
    }
    return null;
  }, [active]);

  const confirmClear = () =>
    Alert.alert(
      "Clear calibration?",
      "This removes all calibration samples.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await clearCal();
            load();
          },
        },
      ]
    );

  const removeSample = (id: string) =>
    Alert.alert("Delete sample?", "", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteCalSample(id);
          load();
        },
      },
    ]);

  const toggleBlank = async (id: string) => {
    // If user taps the star on a sample that is already acting as blank
    // (either explicitly or auto), clear it. Otherwise promote that sample.
    if (blankId === id) await clearBlank();
    else await setBlank(id);
    load();
  };

  const onToggleExcluded = async (id: string) => {
    await toggleExcluded(id);
    load();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.label}>CALIBRATION · CURVE</Text>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Calibrate</Text>
          {samples.length > 0 && (
            <TouchableOpacity onPress={confirmClear} testID="clear-cal-btn">
              <Text style={styles.clearLink}>CLEAR ALL</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.subtitle}>
          Add ~10 samples of known concentration (µM). Mark a blank (I₀) for
          Beer–Lambert style equations. The app finds the equation with the
          best R² automatically.
        </Text>

        {/* Status card */}
        <View style={styles.statusCard} testID="cal-status-card">
          <View style={{ flex: 1 }}>
            <Text style={styles.statusLabel}>STATUS</Text>
            <Text style={styles.statusValue}>
              {samples.length} SAMPLE{samples.length === 1 ? "" : "S"}
              {samples.length - active.length > 0
                ? ` · ${samples.length - active.length} EXCL`
                : ""}
              {blank ? " · BLANK ✓" : " · NO BLANK"}
            </Text>
            {best && best.fit ? (
              <>
                <Text style={[styles.statusLabel, { marginTop: 10 }]}>
                  BEST FIT
                </Text>
                <Text style={styles.bestLabel}>{best.metric.label}</Text>
                <Text style={styles.bestR2}>
                  R² = {best.fit.r2.toFixed(4)} · SE = {best.fit.se.toFixed(3)}{" "}
                  · LoD = {Number.isFinite(best.fit.lod) ? `${best.fit.lod.toFixed(3)} µM` : "—"}
                </Text>
              </>
            ) : (
              <Text style={[styles.statusMute, { marginTop: 8 }]}>
                {active.length < 2
                  ? "Add ≥ 2 active samples to compute fits."
                  : "Fits pending…"}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.addBtn}
            testID="add-cal-sample-btn"
            onPress={() =>
              router.push({ pathname: "/analyze", params: { mode: "calibrate" } })
            }
            activeOpacity={0.85}
          >
            <Feather name="plus" size={20} color="#FFFFFF" />
            <Text style={styles.addBtnText}>ADD</Text>
          </TouchableOpacity>
        </View>

        {rangeWarning && (
          <View style={styles.warnBanner}>
            <Feather name="alert-triangle" size={14} color="#92400E" />
            <Text style={styles.warnText}>{rangeWarning}</Text>
          </View>
        )}

        {/* Samples list */}
        <Text style={[styles.sectionLabel, { marginTop: 6 }]}>
          SAMPLES · {samples.length}
        </Text>

        {loading ? (
          <ActivityIndicator color="#002FA7" style={{ marginVertical: 20 }} />
        ) : samples.length === 0 ? (
          <View style={styles.emptyBox} testID="cal-empty">
            <Feather name="droplet" size={32} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>NO SAMPLES YET</Text>
            <Text style={styles.emptySub}>
              Tap ADD, capture or upload a vial image, select the region of
              interest, then enter the known concentration in µM.
            </Text>
          </View>
        ) : (
          samples.map((s) => {
            const isBlankRow = s.id === blankId;
            const autoBlank = isBlankRow && !s.isBlank; // blank auto-detected via conc=0
            return (
              <View
                key={s.id}
                style={[
                  styles.sampleRow,
                  s.excluded && styles.sampleRowExcluded,
                  isBlankRow && styles.sampleRowBlank,
                ]}
                testID={`cal-item-${s.id}`}
              >
                {s.uri ? (
                  <Image source={{ uri: s.uri }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, { backgroundColor: s.hex }]} />
                )}
                <View style={{ flex: 1 }}>
                  <View style={styles.sampleTopRow}>
                    <Text style={styles.sampleName}>
                      {s.name || "Sample"}
                    </Text>
                    {isBlankRow && (
                      <View style={styles.blankPill}>
                        <Feather name="star" size={10} color="#0A0A0A" />
                        <Text style={styles.blankPillText}>
                          {autoBlank ? "BLANK (AUTO)" : "BLANK"}
                        </Text>
                      </View>
                    )}
                    {s.excluded && (
                      <View style={styles.exclPill}>
                        <Text style={styles.exclPillText}>EXCLUDED</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.sampleMeta}>
                    Conc:{" "}
                    <Text style={styles.bold}>{s.concentration} µM</Text>
                  </Text>
                  <Text style={styles.sampleMeta}>
                    R {s.r} · G {s.g} · B {s.b} · {s.hex}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => onToggleExcluded(s.id)}
                  hitSlop={10}
                  style={styles.actionBtn}
                  testID={`cal-excl-${s.id}`}
                >
                  <Feather
                    name={s.excluded ? "eye-off" : "eye"}
                    size={18}
                    color={s.excluded ? "#EF4444" : "#9CA3AF"}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => toggleBlank(s.id)}
                  hitSlop={10}
                  style={styles.actionBtn}
                  testID={`cal-blank-${s.id}`}
                >
                  <Feather
                    name="star"
                    size={18}
                    color={isBlankRow ? "#F59E0B" : "#9CA3AF"}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => removeSample(s.id)}
                  hitSlop={10}
                  style={styles.actionBtn}
                  testID={`cal-delete-${s.id}`}
                >
                  <Feather name="trash-2" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              </View>
            );
          })
        )}

        <View style={{ height: 24 }} />
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
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 6,
  },
  title: {
    fontSize: 40,
    color: "#0A0A0A",
    fontWeight: "900",
    letterSpacing: -1.4,
  },
  clearLink: {
    color: "#EF4444",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
    paddingBottom: 10,
  },
  subtitle: {
    marginTop: 10,
    fontSize: 14,
    color: "#4B5563",
    lineHeight: 20,
    marginBottom: 18,
  },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F8F9FA",
    borderColor: "#E5E7EB",
    borderWidth: 1,
    borderRadius: 6,
    padding: 16,
    marginBottom: 12,
  },
  statusLabel: {
    fontSize: 10,
    color: "#6B7280",
    letterSpacing: 2,
    fontWeight: "800",
  },
  statusValue: {
    fontSize: 14,
    color: "#0A0A0A",
    fontWeight: "800",
    marginTop: 2,
  },
  statusMute: { fontSize: 13, color: "#6B7280" },
  bestLabel: {
    fontSize: 16,
    color: "#0A0A0A",
    fontWeight: "800",
    marginTop: 2,
  },
  bestR2: { fontSize: 11, color: "#002FA7", marginTop: 2, fontWeight: "700" },
  addBtn: {
    backgroundColor: "#002FA7",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  addBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 1.6,
  },
  warnBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderWidth: 1,
    borderRadius: 6,
    marginBottom: 12,
  },
  warnText: { flex: 1, color: "#92400E", fontSize: 11, fontWeight: "700", lineHeight: 15 },
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
  sampleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8F9FA",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  },
  sampleRowBlank: {
    borderColor: "#F59E0B",
    backgroundColor: "#FFFBEB",
  },
  sampleRowExcluded: { opacity: 0.55 },
  sampleTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  sampleName: { fontSize: 14, fontWeight: "800", color: "#0A0A0A" },
  sampleMeta: { fontSize: 12, color: "#4B5563", marginTop: 2 },
  bold: { color: "#0A0A0A", fontWeight: "800" },
  blankPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FDE68A",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  blankPillText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#0A0A0A",
    letterSpacing: 1.2,
  },
  exclPill: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  exclPillText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#991B1B",
    letterSpacing: 1.2,
  },
  actionBtn: { padding: 5 },
});
