import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Animated,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Line,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { getCalSamples, getBlanks, avgBlankRGB, activeSamples, getPredictions, consumeAnalysisFocus } from "../../src/storage";
import { fitAllMetrics, blankSigmas, MetricFit, METRICS, predictConcentration, bestMetric } from "../../src/metrics";
import { exportCSV, csvEscape } from "../../src/exporter";
const METRICS_TOTAL = METRICS.length;
import type { CalSample, Prediction } from "../../src/storage";

const screenW = Dimensions.get("window").width;

// Colors per metric id — vibrant palette
const METRIC_COLORS: Record<string, string> = {
  R: "#EF4444",
  G: "#22C55E",
  B: "#3B82F6",
  mean: "#8B5CF6",
  luminance: "#F59E0B",
  "I0-I": "#EC4899",
  sum_over_R: "#F97316",
  sum_over_G: "#10B981",
  sum_over_B: "#06B6D4",
  R_over_G: "#A855F7",
  G_over_B: "#14B8A6",
  B_over_R: "#E11D48",
  beer_lambert: "#0EA5E9",
  euclidean: "#D946EF",
};

const colorForR2 = (r2: number) => {
  if (r2 >= 0.9) return "#16A34A"; // green
  if (r2 >= 0.7) return "#F59E0B"; // amber
  return "#EF4444"; // red
};

const labelForR2 = (r2: number) => {
  if (r2 >= 0.9) return "EXCELLENT";
  if (r2 >= 0.7) return "GOOD";
  if (r2 >= 0.4) return "WEAK";
  return "POOR";
};

export default function AnalysisScreen() {
  const insets = useSafeAreaInsets();
  const [samples, setSamples] = useState<CalSample[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"calibrate" | "predict">("calibrate");
  const [selectedPredictionId, setSelectedPredictionId] = useState<string | null>(null);
  const [excludedMetricIds, setExcludedMetricIds] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);

  // Animated slider for the top view tabs
  const slideX = useRef(new Animated.Value(0)).current;
  const switchView = (m: "calibrate" | "predict") => {
    setViewMode(m);
    Animated.spring(slideX, {
      toValue: m === "calibrate" ? 0 : 1,
      useNativeDriver: true,
      tension: 90,
      friction: 12,
    }).start();
  };

  const load = useCallback(async () => {
    setSamples(await getCalSamples());
    const ps = await getPredictions();
    ps.sort((a, b) => b.createdAt - a.createdAt);
    setPredictions(ps);
    const focus = await consumeAnalysisFocus();
    if (focus?.predictionId) {
      switchView("predict");
      setSelectedPredictionId(focus.predictionId);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const sortedFits = useMemo<MetricFit[]>(() => {
    const active = activeSamples(samples);
    if (active.length < 2) return [];
    const blanks = getBlanks(samples);
    const blankAvg = avgBlankRGB(samples);
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
    return fits.slice().sort((a, b) => (b.fit?.r2 ?? -1) - (a.fit?.r2 ?? -1));
  }, [samples]);

  const [category, setCategory] = useState<"conc-linear" | "logconc-loglinear">("conc-linear");
  const filteredFits = useMemo(
    () => sortedFits.filter((f) => f.metric.category === category && !excludedMetricIds.has(f.metric.id)),
    [sortedFits, category, excludedMetricIds]
  );

  const toggleMetricExcluded = (id: string) => {
    setExcludedMetricIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const includedInCategory = METRICS.filter((m) => m.category === category);
  const includedCount = includedInCategory.filter((m) => !excludedMetricIds.has(m.id)).length;

  const selected = useMemo(() => {
    if (filteredFits.length === 0) return null;
    if (selectedId) {
      const hit = filteredFits.find((f) => f.metric.id === selectedId);
      if (hit) return hit;
    }
    return filteredFits[0];
  }, [filteredFits, selectedId]);

function fmtTs(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

  const onExportCSV = async () => {
    const ranked = sortedFits.slice();
    const blankAvg = avgBlankRGB(samples);

    // ---------- Section 1: Ranked equations summary ----------
    const headerRanked = ["rank","equation_id","equation_label","category","n","R2","SE","sigma_source","slope","intercept","LoD_uM","LoQ_uM"];
    const ranks = ranked.map((f, i) => f.fit ? [
      i + 1, f.metric.id, csvEscape(f.metric.label), f.metric.category,
      f.fit.n, f.fit.r2.toFixed(6), f.fit.se.toFixed(6), f.fit.sigmaSource,
      f.fit.slope.toFixed(6), f.fit.intercept.toFixed(6),
      Number.isFinite(f.fit.lod) ? f.fit.lod.toFixed(6) : "",
      Number.isFinite(f.fit.loq) ? f.fit.loq.toFixed(6) : "",
    ] : [i + 1, f.metric.id, csvEscape(f.metric.label), f.metric.category, "", "", "", f.error || "no fit", "", "", "", ""]);

    // ---------- Section 2: Sample inputs ----------
    const sampleHeader = ["id","name","concentration_uM","log10_conc","R","G","B","hex","isBlank","excluded"];
    const sampleRows = samples.map((s) => [
      s.id, csvEscape(s.name || ""), s.concentration,
      s.concentration > 0 ? Math.log10(s.concentration).toFixed(6) : "",
      s.r, s.g, s.b, s.hex, s.isBlank ? 1 : 0, s.excluded ? 1 : 0,
    ]);

    // ---------- Section 3: Per-equation data points (long format) ----------
    // For every (equation, sample) pair: x, y_raw, y_used (for fit), y_predicted, residual.
    const ptsHeader = [
      "equation_id","equation_label","category","R2","SE","LoD_uM","slope","intercept",
      "sample_id","sample_name","concentration_uM","isBlank","excluded","used_in_fit",
      "x_value","y_raw","y_used","y_predicted","residual",
    ];
    const ptsRows: (string | number)[][] = [];
    for (const f of ranked) {
      const m = f.metric;
      const fit = f.fit;
      const r2 = fit ? fit.r2.toFixed(6) : "";
      const se = fit ? fit.se.toFixed(6) : "";
      const lod = fit && Number.isFinite(fit.lod) ? fit.lod.toFixed(6) : "";
      const slope = fit ? fit.slope.toFixed(6) : "";
      const intercept = fit ? fit.intercept.toFixed(6) : "";
      for (const s of samples) {
        const rgb = { r: s.r, g: s.g, b: s.b };
        const yRaw = m.compute(rgb, blankAvg ?? undefined);
        const isLog = m.category === "logconc-loglinear";
        const xVal = isLog
          ? (s.concentration > 0 ? Math.log10(s.concentration) : NaN)
          : s.concentration;
        const yUsed = isLog
          ? (Number.isFinite(yRaw) && yRaw > 0 ? Math.log10(yRaw) : NaN)
          : yRaw;
        const usedInFit = !s.excluded && !s.isBlank && s.concentration > 0 &&
          Number.isFinite(xVal) && Number.isFinite(yUsed);
        const yPred = fit && Number.isFinite(xVal) ? fit.slope * xVal + fit.intercept : NaN;
        const resid = Number.isFinite(yPred) && Number.isFinite(yUsed) ? yUsed - yPred : NaN;
        ptsRows.push([
          m.id, csvEscape(m.label), m.category, r2, se, lod, slope, intercept,
          s.id, csvEscape(s.name || ""), s.concentration,
          s.isBlank ? 1 : 0, s.excluded ? 1 : 0, usedInFit ? 1 : 0,
          Number.isFinite(xVal) ? (xVal as number).toFixed(6) : "",
          Number.isFinite(yRaw) ? yRaw.toFixed(6) : "",
          Number.isFinite(yUsed) ? (yUsed as number).toFixed(6) : "",
          Number.isFinite(yPred) ? yPred.toFixed(6) : "",
          Number.isFinite(resid) ? resid.toFixed(6) : "",
        ]);
      }
    }

    let csv = `# Calibrate Analysis Export\n# Generated: ${new Date().toISOString()}\n# Samples: ${samples.length}  Equations: ${METRICS.length}\n# Note: Blank samples (isBlank=1 or concentration=0) are EXCLUDED from regression but used for I0 reference and LoD sigma.\n\n`;
    csv += "# Section 1: Ranked equations (sorted by R\u00B2)\n";
    csv += headerRanked.join(",") + "\n" + ranks.map((r) => r.join(",")).join("\n");
    csv += "\n\n# Section 2: Calibration samples (raw inputs)\n";
    csv += sampleHeader.join(",") + "\n" + sampleRows.map((r) => r.join(",")).join("\n");
    csv += "\n\n# Section 3: Per-equation data points (long format)\n";
    csv += "# x_value = concentration (linear) or log10(conc) (log-log).  y_used = y_raw (linear) or log10(y_raw) (log-log).\n";
    csv += ptsHeader.join(",") + "\n" + ptsRows.map((r) => r.join(",")).join("\n");
    await exportCSV(`calibrate-analysis-${fmtTs()}.csv`, csv);
  };

  const selectedColor = selected ? METRIC_COLORS[selected.metric.id] || "#002FA7" : "#002FA7";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.label}>COLORIMETRIC · MODELS</Text>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Analysis</Text>
          {samples.length >= 2 && (
            <TouchableOpacity onPress={onExportCSV} style={styles.exportBtn} testID="export-csv-btn">
              <Feather name="download" size={13} color="#FFFFFF" />
              <Text style={styles.exportText}>CSV</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.subtitle}>
          {METRICS_TOTAL} colorimetric equations grouped by fit type. Tap a tab to switch.
        </Text>

        {/* Top-level view tabs — animated slider */}
        <View style={styles.viewTabsWrap}>
          <Animated.View
            style={[
              styles.viewSlider,
              {
                transform: [
                  {
                    translateX: slideX.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0%", "100%"],
                    }),
                  },
                ],
              },
            ]}
            pointerEvents="none"
          />
          <TouchableOpacity
            onPress={() => switchView("calibrate")}
            style={styles.viewTabAnim}
            testID="view-calibrate"
            activeOpacity={0.85}
          >
            <Text style={[styles.viewTabText, viewMode === "calibrate" && styles.viewTabTextActive]}>
              CALIBRATE ANALYSIS
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => switchView("predict")}
            style={styles.viewTabAnim}
            testID="view-predict"
            activeOpacity={0.85}
          >
            <Text style={[styles.viewTabText, viewMode === "predict" && styles.viewTabTextActive]}>
              PREDICT ANALYSIS
            </Text>
          </TouchableOpacity>
        </View>

        {viewMode === "predict" ? (
          <PredictAnalysisView
            samples={samples}
            predictions={predictions}
            selectedPredictionId={selectedPredictionId}
            onSelectPrediction={setSelectedPredictionId}
          />
        ) : (
        <>

        {/* Category tabs + filter btn */}
        <View style={styles.catRow}>
          <TouchableOpacity
            onPress={() => setCategory("conc-linear")}
            style={[styles.catTab, category === "conc-linear" && styles.catTabActive]}
            testID="cat-linear"
          >
            <Text style={[styles.catTabText, category === "conc-linear" && styles.catTabTextActive]}>
              CONC vs METRIC
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setCategory("logconc-loglinear")}
            style={[styles.catTab, category === "logconc-loglinear" && styles.catTabActive]}
            testID="cat-loglog"
          >
            <Text style={[styles.catTabText, category === "logconc-loglinear" && styles.catTabTextActive]}>
              LOG CONC vs LOG METRIC
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFilterOpen(true)}
            style={styles.filterBtn}
            testID="filter-eq-btn"
          >
            <Feather name="filter" size={13} color="#FFFFFF" />
            <Text style={styles.filterBtnText}>{includedCount}/{includedInCategory.length}</Text>
          </TouchableOpacity>
        </View>

        {samples.length < 2 ? (
          <View style={styles.emptyBox} testID="analysis-empty">
            <Feather name="activity" size={32} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>NEED ≥ 2 SAMPLES</Text>
            <Text style={styles.emptySub}>
              Add calibration samples in the Calibrate tab to see fits.
            </Text>
          </View>
        ) : (
          <>
            {/* Selected fit */}
            {selected && selected.fit && (
              <View
                style={[
                  styles.selectedCard,
                  { borderColor: selectedColor, backgroundColor: "#FFFFFF" },
                ]}
                testID="analysis-selected-card"
              >
                <View style={styles.selectedHead}>
                  <View
                    style={[styles.eqDot, { backgroundColor: selectedColor }]}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedLabel}>SELECTED FIT</Text>
                    <Text style={styles.selectedName} numberOfLines={2}>
                      {selected.metric.label}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.qualityPill,
                      { backgroundColor: colorForR2(selected.fit.r2) },
                    ]}
                  >
                    <Text style={styles.qualityPillText}>
                      {labelForR2(selected.fit.r2)}
                    </Text>
                  </View>
                </View>

                <View style={styles.statsRow}>
                  <Stat
                    label="R²"
                    value={selected.fit.r2.toFixed(4)}
                    accent={colorForR2(selected.fit.r2)}
                  />
                  <Stat
                    label="SE"
                    value={selected.fit.se.toFixed(3)}
                    accent="#0EA5E9"
                  />
                  <Stat
                    label="LoD (µM)"
                    value={
                      Number.isFinite(selected.fit.lod)
                        ? selected.fit.lod.toFixed(3)
                        : "—"
                    }
                    accent="#A855F7"
                  />
                  <Stat label="n" value={`${selected.fit.n}`} accent="#0A0A0A" />
                </View>

                <MultiScatter fits={filteredFits.slice(0, 6)} category={category} />

                <View style={styles.eqBadge}>
                  <Text style={styles.eqBadgeText}>
                    y = {selected.fit.slope.toFixed(4)}·x +{" "}
                    {selected.fit.intercept.toFixed(4)}
                  </Text>
                </View>
              </View>
            )}

            {/* List of all fits */}
            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
              {category === "conc-linear" ? "LINEAR FITS" : "LOG-LOG FITS"} · {filteredFits.length}
            </Text>
            {filteredFits.map((f, idx) => {
              const active = f.metric.id === selected?.metric.id;
              const r2 = f.fit?.r2 ?? 0;
              const mColor = METRIC_COLORS[f.metric.id] || "#002FA7";
              const qColor = colorForR2(r2);
              return (
                <TouchableOpacity
                  key={f.metric.id}
                  onPress={() => setSelectedId(f.metric.id)}
                  activeOpacity={0.85}
                  style={[
                    styles.fitRow,
                    { borderLeftColor: mColor },
                    active && {
                      backgroundColor: "#FFFFFF",
                      borderColor: mColor,
                    },
                  ]}
                  testID={`fit-row-${f.metric.id}`}
                >
                  <View
                    style={[styles.rankBadge, { backgroundColor: mColor }]}
                  >
                    <Text style={styles.rankText}>{idx + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fitLabel} numberOfLines={2}>
                      {f.metric.label}
                    </Text>
                    {f.fit ? (
                      <>
                        <View style={styles.r2BarTrack}>
                          <View
                            style={[
                              styles.r2BarFill,
                              {
                                width: `${Math.max(2, Math.min(1, r2)) * 100}%`,
                                backgroundColor: qColor,
                              },
                            ]}
                          />
                        </View>
                        <View style={styles.fitMetaRow}>
                          <Text
                            style={[styles.fitMetaR2, { color: qColor }]}
                          >
                            R² {r2.toFixed(4)}
                          </Text>
                          <Text style={styles.fitMetaDim}>
                            · SE {f.fit.se.toFixed(3)} · LoD{" "}
                            {Number.isFinite(f.fit.lod)
                              ? f.fit.lod.toFixed(3)
                              : "—"}
                          </Text>
                        </View>
                      </>
                    ) : (
                      <View
                        style={[
                          styles.needsBlankPill,
                          { backgroundColor: "#FEF3C7" },
                        ]}
                      >
                        <Feather
                          name="alert-triangle"
                          size={11}
                          color="#92400E"
                        />
                        <Text style={styles.needsBlankText}>
                          {f.error || "No fit"}
                        </Text>
                      </View>
                    )}
                  </View>
                  {idx === 0 && f.fit && (
                    <View style={styles.bestTag}>
                      <Feather name="star" size={11} color="#0A0A0A" />
                      <Text style={styles.bestTagText}>BEST</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        )}
        </>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Equation filter modal */}
      <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>FILTER · {category === "conc-linear" ? "LINEAR" : "LOG-LOG"}</Text>
              <TouchableOpacity onPress={() => setFilterOpen(false)} hitSlop={10} testID="filter-close">
                <Feather name="x" size={20} color="#0A0A0A" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => {
                  setExcludedMetricIds((prev) => {
                    const next = new Set(prev);
                    includedInCategory.forEach((m) => next.delete(m.id));
                    return next;
                  });
                }}
                style={styles.modalBtn}
                testID="filter-all"
              >
                <Text style={styles.modalBtnText}>ALL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setExcludedMetricIds((prev) => {
                    const next = new Set(prev);
                    includedInCategory.forEach((m) => next.add(m.id));
                    return next;
                  });
                }}
                style={styles.modalBtn}
                testID="filter-none"
              >
                <Text style={styles.modalBtnText}>NONE</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 460 }}>
              {includedInCategory.map((m) => {
                const checked = !excludedMetricIds.has(m.id);
                return (
                  <TouchableOpacity
                    key={m.id}
                    onPress={() => toggleMetricExcluded(m.id)}
                    style={styles.modalRow}
                    testID={`filter-row-${m.id}`}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.checkBox, checked && styles.checkBoxOn]}>
                      {checked && <Feather name="check" size={12} color="#FFFFFF" />}
                    </View>
                    <Text style={styles.modalRowText} numberOfLines={2}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function PredictAnalysisView({
  samples,
  predictions,
  selectedPredictionId,
  onSelectPrediction,
}: {
  samples: CalSample[];
  predictions: Prediction[];
  selectedPredictionId: string | null;
  onSelectPrediction: (id: string | null) => void;
}) {
  const fits = useMemo(() => {
    const active = activeSamples(samples);
    if (active.length < 2) return [];
    const blanks = getBlanks(samples);
    const blankAvg = avgBlankRGB(samples);
    const sigmas = blanks.length >= 2
      ? blankSigmas(blanks.map((b) => ({ r: b.r, g: b.g, b: b.b })), blankAvg ?? undefined)
      : undefined;
    return fitAllMetrics(
      active.map((s) => ({ concentration: s.concentration, rgb: { r: s.r, g: s.g, b: s.b }, excluded: s.excluded })),
      blankAvg ?? undefined,
      sigmas
    );
  }, [samples]);

  const blankAvg = useMemo(() => avgBlankRGB(samples), [samples]);
  const selected = predictions.find((p) => p.id === selectedPredictionId) || predictions[0] || null;

  if (predictions.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Feather name="target" size={32} color="#9CA3AF" />
        <Text style={styles.emptyTitle}>NO PREDICTIONS YET</Text>
        <Text style={styles.emptySub}>Save a prediction in the Predict tab and tap Analyze.</Text>
      </View>
    );
  }

  const rows = !selected ? [] : fits
    .map((f) => {
      if (!f.fit) return null;
      const v = predictConcentration(
        f.fit, f.metric,
        { r: selected.r, g: selected.g, b: selected.b },
        blankAvg ?? undefined
      );
      return { id: f.metric.id, label: f.metric.label, r2: f.fit.r2, value: v };
    })
    .filter(Boolean) as { id: string; label: string; r2: number; value: number }[];
  rows.sort((a, b) => b.r2 - a.r2);

  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
        <Text style={styles.sectionLabel}>SELECT PREDICTION</Text>
        {selected && rows.length > 0 && (
          <TouchableOpacity
            onPress={async () => {
              const blankAvg = avgBlankRGB(samples);
              // ---------- Section 1: Ranked equations from calibration ----------
              const headerRanked = ["rank","equation_id","equation_label","category","n","R2","SE","sigma_source","slope","intercept","LoD_uM","LoQ_uM"];
              const sorted = fits.slice().sort((a, b) => (b.fit?.r2 ?? -1) - (a.fit?.r2 ?? -1));
              const ranks = sorted.map((f, i) => f.fit ? [
                i + 1, f.metric.id, csvEscape(f.metric.label), f.metric.category,
                f.fit.n, f.fit.r2.toFixed(6), f.fit.se.toFixed(6), f.fit.sigmaSource,
                f.fit.slope.toFixed(6), f.fit.intercept.toFixed(6),
                Number.isFinite(f.fit.lod) ? f.fit.lod.toFixed(6) : "",
                Number.isFinite(f.fit.loq) ? f.fit.loq.toFixed(6) : "",
              ] : [i + 1, f.metric.id, csvEscape(f.metric.label), f.metric.category, "", "", "", f.error || "no fit", "", "", "", ""]);

              // ---------- Section 2: Predictions (raw inputs + saved-best) ----------
              const predHeader = ["id","createdAt","R","G","B","hex","savedBestEquation","savedR2","savedConc_uM"];
              const predRows = predictions.map((p) => [
                p.id, new Date(p.createdAt).toISOString(),
                p.r, p.g, p.b, p.hex,
                csvEscape(p.bestMetricLabel), p.bestR2.toFixed(6),
                Number.isFinite(p.predictedConcentration) ? p.predictedConcentration.toFixed(6) : "",
              ]);

              // ---------- Section 3: Per-prediction × per-equation (long format) ----------
              const longHeader = [
                "equation_id","equation_label","category","R2","SE","LoD_uM","slope","intercept",
                "prediction_id","createdAt","R","G","B","hex",
                "y_raw","y_used","x_value","predicted_uM",
              ];
              const longRows: (string | number)[][] = [];
              for (const f of sorted) {
                const m = f.metric;
                const fit = f.fit;
                const r2 = fit ? fit.r2.toFixed(6) : "";
                const se = fit ? fit.se.toFixed(6) : "";
                const lod = fit && Number.isFinite(fit.lod) ? fit.lod.toFixed(6) : "";
                const slope = fit ? fit.slope.toFixed(6) : "";
                const intercept = fit ? fit.intercept.toFixed(6) : "";
                for (const p of predictions) {
                  const rgb = { r: p.r, g: p.g, b: p.b };
                  const yRaw = m.compute(rgb, blankAvg ?? undefined);
                  const isLog = m.category === "logconc-loglinear";
                  const yUsed = isLog
                    ? (Number.isFinite(yRaw) && yRaw > 0 ? Math.log10(yRaw) : NaN)
                    : yRaw;
                  let xVal: number = NaN;
                  let predicted: number = NaN;
                  if (fit && Number.isFinite(yUsed) && fit.slope !== 0) {
                    xVal = (yUsed - fit.intercept) / fit.slope;
                    predicted = isLog ? Math.pow(10, xVal) : xVal;
                  }
                  longRows.push([
                    m.id, csvEscape(m.label), m.category, r2, se, lod, slope, intercept,
                    p.id, new Date(p.createdAt).toISOString(),
                    p.r, p.g, p.b, p.hex,
                    Number.isFinite(yRaw) ? yRaw.toFixed(6) : "",
                    Number.isFinite(yUsed) ? (yUsed as number).toFixed(6) : "",
                    Number.isFinite(xVal) ? xVal.toFixed(6) : "",
                    Number.isFinite(predicted) ? predicted.toFixed(6) : "",
                  ]);
                }
              }

              let csv = `# Predict Analysis Export\n# Generated: ${new Date().toISOString()}\n# Predictions: ${predictions.length}  Equations: ${METRICS.length}\n# Calibration samples used: ${samples.length}\n\n`;
              csv += "# Section 1: Ranked equations (from calibration, sorted by R\u00B2)\n";
              csv += headerRanked.join(",") + "\n" + ranks.map((r) => r.join(",")).join("\n");
              csv += "\n\n# Section 2: Predictions (raw inputs + saved best at time of prediction)\n";
              csv += predHeader.join(",") + "\n" + predRows.map((r) => r.join(",")).join("\n");
              csv += "\n\n# Section 3: Per-prediction \u00D7 per-equation predicted concentrations (long format)\n";
              csv += "# y_raw = metric value of unknown sample.  y_used = log10(y_raw) for log-log, else y_raw.\n# x_value = (y_used - intercept)/slope.  predicted_uM = 10^x_value (log-log) or x_value (linear).\n";
              csv += longHeader.join(",") + "\n" + longRows.map((r) => r.join(",")).join("\n");
              await exportCSV(`predict-analysis-${fmtTs()}.csv`, csv);
            }}
            style={styles.exportBtn}
            testID="export-predict-csv"
          >
            <Feather name="download" size={13} color="#FFFFFF" />
            <Text style={styles.exportText}>CSV</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        {predictions.map((p) => {
          const isActive = selected?.id === p.id;
          return (
            <TouchableOpacity
              key={p.id}
              onPress={() => onSelectPrediction(p.id)}
              style={[styles.predChip, isActive && styles.predChipActive]}
              testID={`pred-chip-${p.id}`}
            >
              <View style={[styles.predChipSwatch, { backgroundColor: p.hex }]} />
              <Text style={[styles.predChipText, isActive && { color: "#FFFFFF" }]} numberOfLines={1}>
                {Number.isFinite(p.predictedConcentration) ? `${p.predictedConcentration.toFixed(2)} µM` : "—"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {selected && (
        <View style={[styles.selectedCard, { borderColor: "#22C55E", backgroundColor: "#FFFFFF" }]}>
          <View style={styles.selectedHead}>
            <View style={[styles.eqDot, { backgroundColor: selected.hex }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.selectedLabel}>SELECTED PREDICTION</Text>
              <Text style={styles.selectedName}>
                {selected.bestMetricLabel}
              </Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <Stat label="R" value={`${selected.r}`} accent="#EF4444" />
            <Stat label="G" value={`${selected.g}`} accent="#22C55E" />
            <Stat label="B" value={`${selected.b}`} accent="#3B82F6" />
            <Stat label="HEX" value={selected.hex} accent="#0A0A0A" />
          </View>
        </View>
      )}

      {fits.length === 0 ? (
        <View style={styles.emptyBox}>
          <Feather name="alert-circle" size={28} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>NO CALIBRATION</Text>
          <Text style={styles.emptySub}>Build a calibration curve first to predict via every equation.</Text>
        </View>
      ) : (
        <>
          <Text style={styles.sectionLabel}>PREDICTED µM PER EQUATION · {rows.length}</Text>
          {rows.map((r, i) => {
            const qColor = r.r2 >= 0.9 ? "#16A34A" : r.r2 >= 0.7 ? "#F59E0B" : "#EF4444";
            return (
              <View key={r.id} style={[styles.fitRow, { borderLeftColor: qColor }]} testID={`pred-eq-${r.id}`}>
                <View style={[styles.rankBadge, { backgroundColor: qColor }]}>
                  <Text style={styles.rankText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fitLabel}>{r.label}</Text>
                  <Text style={[styles.fitMetaR2, { color: qColor }]}>R² {r.r2.toFixed(4)}</Text>
                </View>
                <Text style={styles.predEqValue}>
                  {Number.isFinite(r.value) ? `${r.value.toFixed(3)} µM` : "—"}
                </Text>
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <View style={[styles.statCell, { borderTopColor: accent }]}>
      <Text style={[styles.statLabel, { color: accent }]}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function MultiScatter({ fits, category }: { fits: MetricFit[]; category: "conc-linear" | "logconc-loglinear" }) {
  const valid = fits.filter((f) => f.fit && f.fit.points.length > 0);
  if (valid.length === 0) return null;
  const W = screenW - 40 - 28;
  const H = 240;
  const padL = 42, padR = 10, padT = 14, padB = 36;

  // Combined data extents
  const allXs: number[] = [];
  const allYs: number[] = [];
  valid.forEach((f) => f.fit!.points.forEach((p) => { allXs.push(p.x); allYs.push(p.y); }));
  const minX = Math.min(...allXs), maxX = Math.max(...allXs);
  const minY = Math.min(...allYs), maxY = Math.max(...allYs);
  const xr = maxX - minX || 1;
  const yr = maxY - minY || 1;
  const sx = (x: number) => padL + ((x - minX) / xr) * (W - padL - padR);
  const sy = (y: number) => padT + (1 - (y - minY) / yr) * (H - padT - padB);

  const palette = ["#002FA7","#EF4444","#22C55E","#F59E0B","#A855F7","#0EA5E9"];

  return (
    <View style={{ backgroundColor: "#F8F9FA", borderRadius: 8, borderWidth: 1, borderColor: "#E5E7EB", marginTop: 14 }}>
      <Svg width={W} height={H}>
        {[0,1,2,3,4].map((i) => {
          const y = padT + ((H - padT - padB) * i) / 4;
          return <Line key={`gy${i}`} x1={padL} y1={y} x2={W - padR} y2={y} stroke="#E5E7EB" strokeWidth={1} />;
        })}
        <Line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#9CA3AF" strokeWidth={1.5} />
        <Line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#9CA3AF" strokeWidth={1.5} />
        {valid.map((f, idx) => {
          const c = palette[idx % palette.length];
          const slope = f.fit!.slope, intercept = f.fit!.intercept;
          const lineY1 = slope * minX + intercept;
          const lineY2 = slope * maxX + intercept;
          return (
            <React.Fragment key={f.metric.id}>
              <Line x1={sx(minX)} y1={sy(lineY1)} x2={sx(maxX)} y2={sy(lineY2)} stroke={c} strokeWidth={2} opacity={0.9} />
              {f.fit!.points.map((p, i) => (
                <Circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={4} fill={c} stroke="#FFFFFF" strokeWidth={1.5} />
              ))}
            </React.Fragment>
          );
        })}
        <SvgText x={W / 2} y={H - 18} fontSize={10} fill="#6B7280" fontWeight="700" textAnchor="middle">
          {category === "conc-linear" ? "CONCENTRATION (µM)" : "log\u2081\u2080 CONC"}
        </SvgText>
        <SvgText x={padL + 2} y={H - padB + 14} fontSize={9} fill="#6B7280">{minX.toFixed(2)}</SvgText>
        <SvgText x={W - padR - 30} y={H - padB + 14} fontSize={9} fill="#6B7280">{maxX.toFixed(2)}</SvgText>
        <SvgText x={4} y={H - padB} fontSize={9} fill="#6B7280">{minY.toFixed(2)}</SvgText>
        <SvgText x={4} y={padT + 14} fontSize={9} fill="#6B7280">{maxY.toFixed(2)}</SvgText>
      </Svg>
      {/* Legend */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", padding: 8, gap: 8 }}>
        {valid.map((f, i) => (
          <View key={f.metric.id} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: palette[i % palette.length] }} />
            <Text style={{ fontSize: 10, color: "#0A0A0A", fontWeight: "700" }} numberOfLines={1}>
              {f.metric.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Scatter({ fit, color }: { fit: MetricFit; color: string }) {
  if (!fit.fit) return null;
  const W = screenW - 40 - 28; // card inner width
  const H = 220;
  const padL = 42,
    padR = 10,
    padT = 14,
    padB = 30;

  const pts = fit.fit.points;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const xr = maxX - minX || 1;
  const yr = maxY - minY || 1;
  const sx = (x: number) => padL + ((x - minX) / xr) * (W - padL - padR);
  const sy = (y: number) => padT + (1 - (y - minY) / yr) * (H - padT - padB);
  const lineY1 = fit.fit.slope * minX + fit.fit.intercept;
  const lineY2 = fit.fit.slope * maxX + fit.fit.intercept;

  // Gridlines
  const yTicks = 4;
  const xTicks = 4;

  const uid = `grad-${fit.metric.id}`;

  return (
    <View
      style={{
        backgroundColor: "#F8F9FA",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        marginTop: 14,
      }}
    >
      <Svg width={W} height={H}>
        <Defs>
          <LinearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.22} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {/* Gradient under area */}
        <Rect
          x={padL}
          y={padT}
          width={W - padL - padR}
          height={H - padT - padB}
          fill={`url(#${uid})`}
        />
        {/* Gridlines */}
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const y = padT + ((H - padT - padB) * i) / yTicks;
          return (
            <Line
              key={`gy${i}`}
              x1={padL}
              y1={y}
              x2={W - padR}
              y2={y}
              stroke="#E5E7EB"
              strokeWidth={1}
            />
          );
        })}
        {Array.from({ length: xTicks + 1 }).map((_, i) => {
          const x = padL + ((W - padL - padR) * i) / xTicks;
          return (
            <Line
              key={`gx${i}`}
              x1={x}
              y1={padT}
              x2={x}
              y2={H - padB}
              stroke="#E5E7EB"
              strokeWidth={1}
            />
          );
        })}
        {/* Axes */}
        <Line
          x1={padL}
          y1={H - padB}
          x2={W - padR}
          y2={H - padB}
          stroke="#9CA3AF"
          strokeWidth={1.5}
        />
        <Line
          x1={padL}
          y1={padT}
          x2={padL}
          y2={H - padB}
          stroke="#9CA3AF"
          strokeWidth={1.5}
        />
        {/* Fit line */}
        <Line
          x1={sx(minX)}
          y1={sy(lineY1)}
          x2={sx(maxX)}
          y2={sy(lineY2)}
          stroke={color}
          strokeWidth={2.5}
        />
        {/* Points */}
        {pts.map((p, i) => (
          <Circle
            key={i}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r={5.5}
            fill={color}
            stroke="#FFFFFF"
            strokeWidth={2}
          />
        ))}
        {/* Labels */}
        <SvgText
          x={W / 2}
          y={H - 6}
          fontSize={10}
          fill="#6B7280"
          fontWeight="700"
          textAnchor="middle"
        >
          CONCENTRATION (µM)
        </SvgText>
        <SvgText
          x={12}
          y={padT + 12}
          fontSize={10}
          fill="#6B7280"
          fontWeight="700"
        >
          y
        </SvgText>
        <SvgText x={padL + 2} y={H - padB + 14} fontSize={9} fill="#6B7280">
          {minX.toFixed(1)}
        </SvgText>
        <SvgText
          x={W - padR - 28}
          y={H - padB + 14}
          fontSize={9}
          fill="#6B7280"
        >
          {maxX.toFixed(1)}
        </SvgText>
        <SvgText x={8} y={H - padB} fontSize={9} fill="#6B7280">
          {minY.toFixed(2)}
        </SvgText>
        <SvgText x={8} y={padT + 14} fontSize={9} fill="#6B7280">
          {maxY.toFixed(2)}
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
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
    marginTop: 4,
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#0A0A0A",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 4,
    marginBottom: 8,
  },
  exportText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  catRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  catTab: {
    flex: 1,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 6,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  catTabActive: { backgroundColor: "#0A0A0A", borderColor: "#0A0A0A" },
  catTabText: { fontSize: 10.5, fontWeight: "900", color: "#0A0A0A", letterSpacing: 1.2 },
  catTabTextActive: { color: "#FFFFFF" },
  viewTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "#0A0A0A",
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
  },
  viewTabActive: { backgroundColor: "#002FA7", borderColor: "#002FA7" },
  viewTabText: { fontSize: 11, fontWeight: "900", color: "#0A0A0A", letterSpacing: 1.2 },
  viewTabTextActive: { color: "#FFFFFF" },
  predChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#F8F9FA",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 6,
    marginRight: 8,
  },
  predChipActive: { backgroundColor: "#002FA7", borderColor: "#002FA7" },
  predChipSwatch: { width: 16, height: 16, borderRadius: 3, borderWidth: 1, borderColor: "rgba(0,0,0,0.1)" },
  predChipText: { fontSize: 12, fontWeight: "800", color: "#0A0A0A" },
  predEqValue: { fontSize: 14, fontWeight: "900", color: "#0A0A0A", minWidth: 80, textAlign: "right" },
  viewTabsWrap: {
    flexDirection: "row",
    backgroundColor: "#F1F2F5",
    borderRadius: 8,
    padding: 4,
    marginBottom: 14,
    position: "relative",
    overflow: "hidden",
  },
  viewSlider: {
    position: "absolute",
    top: 4,
    left: 4,
    width: "50%",
    height: "100%",
    backgroundColor: "#002FA7",
    borderRadius: 6,
    marginRight: 4,
  },
  viewTabAnim: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    zIndex: 2,
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#0A0A0A",
    paddingHorizontal: 10,
    paddingVertical: 11,
    borderRadius: 6,
  },
  filterBtnText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(10,10,10,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 30,
  },
  modalHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitle: { fontSize: 13, fontWeight: "900", letterSpacing: 1.6, color: "#0A0A0A" },
  modalActions: { flexDirection: "row", gap: 8, marginBottom: 12 },
  modalBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: "#EEF2FF",
  },
  modalBtnText: { color: "#002FA7", fontWeight: "900", fontSize: 11, letterSpacing: 1.2 },
  modalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  checkBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#9CA3AF",
    alignItems: "center",
    justifyContent: "center",
  },
  checkBoxOn: { backgroundColor: "#002FA7", borderColor: "#002FA7" },
  modalRowText: { flex: 1, fontSize: 13, color: "#0A0A0A", fontWeight: "600" },
  title: {
    fontSize: 40,
    color: "#0A0A0A",
    fontWeight: "900",
    letterSpacing: -1.4,
  },
  subtitle: {
    fontSize: 13,
    color: "#4B5563",
    marginTop: 6,
    marginBottom: 16,
    lineHeight: 18,
  },
  emptyBox: {
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
    borderWidth: 1,
    borderRadius: 8,
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
  selectedCard: {
    borderWidth: 2,
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  selectedHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  eqDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  selectedLabel: {
    fontSize: 10,
    color: "#6B7280",
    letterSpacing: 2,
    fontWeight: "800",
  },
  selectedName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0A0A0A",
    marginTop: 2,
  },
  qualityPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  qualityPillText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  statCell: {
    flex: 1,
    backgroundColor: "#F8F9FA",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderTopWidth: 3,
    borderRadius: 6,
    padding: 10,
  },
  statLabel: {
    fontSize: 10,
    letterSpacing: 1.6,
    fontWeight: "800",
  },
  statValue: {
    fontSize: 16,
    color: "#0A0A0A",
    fontWeight: "900",
    marginTop: 2,
  },
  eqBadge: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#0A0A0A",
    borderRadius: 6,
  },
  eqBadgeText: {
    color: "#22C55E",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "Menlo",
  },
  sectionLabel: {
    fontSize: 11,
    color: "#6B7280",
    letterSpacing: 2.2,
    fontWeight: "800",
    marginBottom: 10,
  },
  fitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    backgroundColor: "#F8F9FA",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderLeftWidth: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  rankBadge: {
    width: 30,
    height: 30,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: { color: "#FFFFFF", fontWeight: "900", fontSize: 12 },
  fitLabel: {
    fontSize: 14,
    color: "#0A0A0A",
    fontWeight: "700",
  },
  r2BarTrack: {
    height: 8,
    backgroundColor: "#E5E7EB",
    borderRadius: 4,
    marginTop: 6,
    overflow: "hidden",
  },
  r2BarFill: { height: "100%", borderRadius: 4 },
  fitMetaRow: { flexDirection: "row", marginTop: 4, alignItems: "center" },
  fitMetaR2: { fontSize: 12, fontWeight: "900" },
  fitMetaDim: { fontSize: 11, color: "#6B7280", fontWeight: "600" },
  needsBlankPill: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  needsBlankText: {
    fontSize: 11,
    color: "#92400E",
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  bestTag: {
    backgroundColor: "#FDE68A",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  bestTagText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#0A0A0A",
    letterSpacing: 1.2,
  },
});
