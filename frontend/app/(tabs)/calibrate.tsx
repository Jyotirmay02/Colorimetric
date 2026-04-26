import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import {
  CalSample, deleteCalSample, getCalSamples, toggleBlankFlag, clearAllBlanks,
  clearCal, toggleExcluded, activeSamples, getBlanks, avgBlankRGB,
} from "../../src/storage";
import { bestMetric, blankSigmas, fitAllMetrics } from "../../src/metrics";

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

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const blanks = getBlanks(samples);
  const blankAvg = avgBlankRGB(samples);
  const active = activeSamples(samples);

  const sigmas = useMemo(
    () => blanks.length >= 2
      ? blankSigmas(blanks.map((b) => ({ r: b.r, g: b.g, b: b.b })), blankAvg ?? undefined)
      : undefined,
    [blanks, blankAvg]
  );

  const fits = useMemo(() => active.length >= 2
    ? fitAllMetrics(
        active.map((s) => ({ concentration: s.concentration, rgb: { r: s.r, g: s.g, b: s.b }, excluded: s.excluded })),
        blankAvg ?? undefined,
        sigmas
      )
    : [], [active, blankAvg, sigmas]);
  const best = fits.length ? bestMetric(fits) : null;

  const rangeWarning = useMemo(() => {
    if (active.length < 3) return null;
    const xs = active.map((s) => s.concentration).filter((x) => x > 0);
    if (xs.length < 3) return null;
    const mn = Math.min(...xs), mx = Math.max(...xs);
    if (mn > 0 && mx / mn >= 10) {
      return `Wide range (${mn}\u2013${mx} \u00B5M). Response may be non-linear at high concentrations \u2014 consider excluding outliers.`;
    }
    return null;
  }, [active]);

  const confirmClear = () => Alert.alert("Clear calibration?", "All samples + blanks removed.", [
    { text: "Cancel", style: "cancel" },
    { text: "Clear", style: "destructive", onPress: async () => { await clearCal(); load(); } },
  ]);
  const removeSample = (id: string) => Alert.alert("Delete sample?", "", [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: async () => { await deleteCalSample(id); load(); } },
  ]);
  const toggleBlank = async (id: string) => { await toggleBlankFlag(id); load(); };
  const onClearBlanks = async () => { await clearAllBlanks(); load(); };
  const onToggleExcluded = async (id: string) => { await toggleExcluded(id); load(); };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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
          Add ~10 samples of known concentration (µM). For accurate LoD, also
          add 7–10 blank-replicate images and tag them as Blanks (⭐).
        </Text>

        {/* Status card */}
        <View style={styles.statusCard} testID="cal-status-card">
          <View style={{ flex: 1 }}>
            <Text style={styles.statusLabel}>STATUS</Text>
            <Text style={styles.statusValue}>
              {samples.length} SAMPLES{samples.length - active.length > 0 ? ` · ${samples.length - active.length} EXCL` : ""}
              {" · "}
              {blanks.length} BLANK{blanks.length === 1 ? "" : "S"}
            </Text>
            {best && best.fit ? (
              <>
                <Text style={[styles.statusLabel, { marginTop: 10 }]}>BEST FIT</Text>
                <Text style={styles.bestLabel}>{best.metric.label}</Text>
                <Text style={styles.bestR2}>
                  R² = {best.fit.r2.toFixed(4)} · σ source: {best.fit.sigmaSource === "blank-replicates" ? "BLANKS" : "REGRESSION"} · LoD = {Number.isFinite(best.fit.lod) ? `${best.fit.lod.toFixed(3)} µM` : "—"}
                </Text>
              </>
            ) : (
              <Text style={styles.statusMute}>{active.length < 2 ? "Add ≥ 2 active samples to compute fits." : "Fits pending…"}</Text>
            )}
          </View>
          <TouchableOpacity style={styles.addBtn} testID="add-cal-sample-btn"
            onPress={() => router.push({ pathname: "/analyze", params: { mode: "calibrate" } })}
            activeOpacity={0.85}>
            <Feather name="plus" size={20} color="#FFFFFF" />
            <Text style={styles.addBtnText}>ADD</Text>
          </TouchableOpacity>
        </View>

        {/* Blank-replicate σ section */}
        <View style={styles.blankBox} testID="blank-section">
          <View style={styles.blankHead}>
            <Feather name="star" size={14} color="#92400E" />
            <Text style={styles.blankTitle}>BLANK REPLICATES · {blanks.length}</Text>
            {blanks.length > 0 && (
              <TouchableOpacity onPress={onClearBlanks} testID="clear-blanks-btn">
                <Text style={styles.blankClear}>CLEAR</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.blankBody}>
            Add 7–10 images of plain blank solution (concentration = 0). The app will
            compute σ_blank for each equation and use it for IUPAC LoD = 3·σ/|slope|.
            With &lt;2 blanks, LoD falls back to regression SE.
          </Text>
          {blanks.length >= 2 && blankAvg && (
            <View style={styles.blankAvg}>
              <View style={[styles.blankSwatch, { backgroundColor: `rgb(${Math.round(blankAvg.r)}, ${Math.round(blankAvg.g)}, ${Math.round(blankAvg.b)})` }]} />
              <Text style={styles.blankAvgText}>
                avg I₀: R {blankAvg.r.toFixed(1)} · G {blankAvg.g.toFixed(1)} · B {blankAvg.b.toFixed(1)}
              </Text>
            </View>
          )}
          <TouchableOpacity onPress={() => router.push("/analysis")} style={styles.viewAnalysisBtn} testID="goto-analysis">
            <Feather name="activity" size={14} color="#002FA7" />
            <Text style={styles.viewAnalysisText}>VIEW CALIBRATE ANALYSIS</Text>
            <Feather name="chevron-right" size={14} color="#002FA7" />
          </TouchableOpacity>
        </View>

        {rangeWarning && (
          <View style={styles.warnBanner}>
            <Feather name="alert-triangle" size={14} color="#92400E" />
            <Text style={styles.warnText}>{rangeWarning}</Text>
          </View>
        )}

        <Text style={[styles.sectionLabel, { marginTop: 6 }]}>SAMPLES · {samples.length}</Text>

        {loading ? (
          <ActivityIndicator color="#002FA7" style={{ marginVertical: 20 }} />
        ) : samples.length === 0 ? (
          <View style={styles.emptyBox} testID="cal-empty">
            <Feather name="droplet" size={32} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>NO SAMPLES YET</Text>
            <Text style={styles.emptySub}>Tap ADD to capture or upload an image, select the ROI, then enter the known concentration in µM.</Text>
          </View>
        ) : (
          samples.map((s) => (
            <View key={s.id}
              style={[styles.sampleRow, s.excluded && styles.sampleRowExcluded, s.isBlank && styles.sampleRowBlank]}
              testID={`cal-item-${s.id}`}>
              {s.uri ? <Image source={{ uri: s.uri }} style={styles.thumb} /> : <View style={[styles.thumb, { backgroundColor: s.hex }]} />}
              <View style={{ flex: 1 }}>
                <View style={styles.sampleTopRow}>
                  <Text style={styles.sampleName}>{s.name || "Sample"}</Text>
                  {s.isBlank && (
                    <View style={styles.blankPill}>
                      <Feather name="star" size={9} color="#0A0A0A" />
                      <Text style={styles.blankPillText}>BLANK</Text>
                    </View>
                  )}
                  {s.excluded && (
                    <View style={styles.exclPill}>
                      <Text style={styles.exclPillText}>EXCLUDED</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.sampleMeta}>Conc: <Text style={styles.bold}>{s.concentration} µM</Text></Text>
                <Text style={styles.sampleMeta}>R {s.r} · G {s.g} · B {s.b} · {s.hex}</Text>
              </View>
              <TouchableOpacity onPress={() => onToggleExcluded(s.id)} hitSlop={10} style={styles.actionBtn} testID={`cal-excl-${s.id}`}>
                <Feather name={s.excluded ? "eye-off" : "eye"} size={18} color={s.excluded ? "#EF4444" : "#9CA3AF"} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => toggleBlank(s.id)} hitSlop={10} style={styles.actionBtn} testID={`cal-blank-${s.id}`}>
                <Feather name="star" size={18} color={s.isBlank ? "#F59E0B" : "#9CA3AF"} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removeSample(s.id)} hitSlop={10} style={styles.actionBtn} testID={`cal-delete-${s.id}`}>
                <Feather name="trash-2" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          ))
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  scroll: { paddingHorizontal: 24, paddingBottom: 24 },
  label: { fontSize: 11, color: "#6B7280", letterSpacing: 2.4, fontWeight: "700", marginTop: 16 },
  headerRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 6 },
  title: { fontSize: 40, color: "#0A0A0A", fontWeight: "900", letterSpacing: -1.4 },
  clearLink: { color: "#EF4444", fontSize: 11, fontWeight: "800", letterSpacing: 1.6, paddingBottom: 10 },
  subtitle: { marginTop: 10, fontSize: 13, color: "#4B5563", lineHeight: 19, marginBottom: 16 },
  statusCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#F8F9FA", borderColor: "#E5E7EB", borderWidth: 1, borderRadius: 6, padding: 16, marginBottom: 12 },
  statusLabel: { fontSize: 10, color: "#6B7280", letterSpacing: 2, fontWeight: "800" },
  statusValue: { fontSize: 13, color: "#0A0A0A", fontWeight: "800", marginTop: 2 },
  statusMute: { fontSize: 13, color: "#6B7280", marginTop: 8 },
  bestLabel: { fontSize: 15, color: "#0A0A0A", fontWeight: "800", marginTop: 2 },
  bestR2: { fontSize: 11, color: "#002FA7", marginTop: 2, fontWeight: "700" },
  addBtn: { backgroundColor: "#002FA7", paddingHorizontal: 18, paddingVertical: 14, borderRadius: 6, alignItems: "center", flexDirection: "row", gap: 6 },
  addBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13, letterSpacing: 1.6 },
  blankBox: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A", borderWidth: 1, padding: 14, borderRadius: 6, marginBottom: 12 },
  blankHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  blankTitle: { flex: 1, fontSize: 11, fontWeight: "900", color: "#92400E", letterSpacing: 1.6 },
  blankClear: { fontSize: 10, color: "#EF4444", fontWeight: "800", letterSpacing: 1.4 },
  blankBody: { fontSize: 11, color: "#7C2D12", lineHeight: 15 },
  blankAvg: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#FDE68A" },
  blankSwatch: { width: 24, height: 24, borderRadius: 4, borderWidth: 1, borderColor: "#92400E" },
  blankAvgText: { fontSize: 12, color: "#0A0A0A", fontWeight: "700" },
  viewAnalysisBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10, alignSelf: "flex-start", backgroundColor: "#EEF2FF", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 4 },
  viewAnalysisText: { color: "#002FA7", fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  warnBanner: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, backgroundColor: "#FFFBEB", borderColor: "#FDE68A", borderWidth: 1, borderRadius: 6, marginBottom: 12 },
  warnText: { flex: 1, color: "#92400E", fontSize: 11, fontWeight: "700", lineHeight: 15 },
  sectionLabel: { fontSize: 11, color: "#6B7280", letterSpacing: 2.2, fontWeight: "800", marginBottom: 10 },
  emptyBox: { borderColor: "#E5E7EB", borderStyle: "dashed", borderWidth: 1, borderRadius: 6, padding: 28, alignItems: "center", gap: 8, backgroundColor: "#F8F9FA" },
  emptyTitle: { fontSize: 12, fontWeight: "800", letterSpacing: 2, color: "#0A0A0A", marginTop: 4 },
  emptySub: { color: "#4B5563", textAlign: "center", fontSize: 13, maxWidth: 280, lineHeight: 18 },
  sampleRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#F8F9FA", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 6, padding: 12, marginBottom: 10 },
  sampleRowBlank: { borderColor: "#F59E0B", backgroundColor: "#FFFBEB" },
  sampleRowExcluded: { opacity: 0.55 },
  sampleTopRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  thumb: { width: 52, height: 52, borderRadius: 4, borderWidth: 1, borderColor: "#E5E7EB" },
  sampleName: { fontSize: 14, fontWeight: "800", color: "#0A0A0A" },
  sampleMeta: { fontSize: 12, color: "#4B5563", marginTop: 2 },
  bold: { color: "#0A0A0A", fontWeight: "800" },
  blankPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FDE68A", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  blankPillText: { fontSize: 9, fontWeight: "900", color: "#0A0A0A", letterSpacing: 1.2 },
  exclPill: { backgroundColor: "#FEE2E2", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  exclPillText: { fontSize: 9, fontWeight: "900", color: "#991B1B", letterSpacing: 1.2 },
  actionBtn: { padding: 5 },
});
