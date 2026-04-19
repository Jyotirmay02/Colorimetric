import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
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
import { getCalSamples, selectBlankSample } from "../../src/storage";
import { fitAllMetrics, MetricFit } from "../../src/metrics";
import type { CalSample } from "../../src/storage";

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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setSamples(await getCalSamples());
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
    if (samples.length < 2) return [];
    const blank = selectBlankSample(samples);
    const fits = fitAllMetrics(
      samples.map((s) => ({
        concentration: s.concentration,
        rgb: { r: s.r, g: s.g, b: s.b },
      })),
      blank ? { r: blank.r, g: blank.g, b: blank.b } : undefined
    );
    return fits.slice().sort((a, b) => (b.fit?.r2 ?? -1) - (a.fit?.r2 ?? -1));
  }, [samples]);

  const selected = useMemo(() => {
    if (sortedFits.length === 0) return null;
    if (selectedId) {
      const hit = sortedFits.find((f) => f.metric.id === selectedId);
      if (hit) return hit;
    }
    return sortedFits[0];
  }, [sortedFits, selectedId]);

  const selectedColor = selected ? METRIC_COLORS[selected.metric.id] || "#002FA7" : "#002FA7";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.label}>COLORIMETRIC · MODELS</Text>
        <Text style={styles.title}>Analysis</Text>
        <Text style={styles.subtitle}>
          14 colorimetric equations ranked by R² of linear fit vs.
          concentration.
        </Text>

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
                    label="LoD"
                    value={
                      Number.isFinite(selected.fit.lod)
                        ? selected.fit.lod.toFixed(3)
                        : "—"
                    }
                    accent="#A855F7"
                  />
                  <Stat label="n" value={`${selected.fit.n}`} accent="#0A0A0A" />
                </View>

                <Scatter fit={selected} color={selectedColor} />

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
              ALL EQUATIONS · {sortedFits.length}
            </Text>
            {sortedFits.map((f, idx) => {
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
        <View style={{ height: 32 }} />
      </ScrollView>
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
          CONCENTRATION
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
