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
import Svg, { Circle, Line, Text as SvgText } from "react-native-svg";
import { getCalSamples, selectBlankSample } from "../../src/storage";
import { fitAllMetrics, MetricFit } from "../../src/metrics";
import type { CalSample } from "../../src/storage";

const screenW = Dimensions.get("window").width;

export default function AnalysisScreen() {
  const insets = useSafeAreaInsets();
  const [samples, setSamples] = useState<CalSample[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setSamples(await getCalSamples());
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
    return fits.slice().sort((a, b) => {
      const ar = a.fit?.r2 ?? -1;
      const br = b.fit?.r2 ?? -1;
      return br - ar;
    });
  }, [samples]);

  const selected = useMemo(() => {
    if (sortedFits.length === 0) return null;
    if (selectedId) {
      const hit = sortedFits.find((f) => f.metric.id === selectedId);
      if (hit) return hit;
    }
    return sortedFits[0];
  }, [sortedFits, selectedId]);

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
            {/* Selected fit scatter */}
            {selected && selected.fit && (
              <View style={styles.selectedCard}>
                <Text style={styles.selectedLabel}>SELECTED FIT</Text>
                <Text style={styles.selectedName} numberOfLines={2}>
                  {selected.metric.label}
                </Text>
                <View style={styles.statsRow}>
                  <Stat label="R²" value={selected.fit.r2.toFixed(4)} />
                  <Stat label="SE" value={selected.fit.se.toFixed(3)} />
                  <Stat
                    label="LoD"
                    value={
                      Number.isFinite(selected.fit.lod)
                        ? selected.fit.lod.toFixed(3)
                        : "—"
                    }
                  />
                  <Stat label="n" value={`${selected.fit.n}`} />
                </View>
                <Scatter fit={selected} />
                <Text style={styles.eqLine}>
                  y = {selected.fit.slope.toFixed(4)}·x +{" "}
                  {selected.fit.intercept.toFixed(4)}
                </Text>
              </View>
            )}

            {/* List of all fits */}
            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
              ALL EQUATIONS · {sortedFits.length}
            </Text>
            {sortedFits.map((f, idx) => {
              const active = f.metric.id === selected?.metric.id;
              const r2 = f.fit?.r2 ?? 0;
              return (
                <TouchableOpacity
                  key={f.metric.id}
                  onPress={() => setSelectedId(f.metric.id)}
                  activeOpacity={0.85}
                  style={[styles.fitRow, active && styles.fitRowActive]}
                  testID={`fit-row-${f.metric.id}`}
                >
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>{idx + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fitLabel} numberOfLines={2}>
                      {f.metric.label}
                    </Text>
                    {f.fit ? (
                      <>
                        <View style={styles.r2Bar}>
                          <View
                            style={[
                              styles.r2Fill,
                              {
                                width: `${Math.max(2, Math.min(1, r2)) * 100}%`,
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.fitMeta}>
                          R² {r2.toFixed(4)} · SE{" "}
                          {f.fit.se.toFixed(3)} · LoD{" "}
                          {Number.isFinite(f.fit.lod)
                            ? f.fit.lod.toFixed(3)
                            : "—"}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.fitMute}>
                        {f.error || "No fit"}
                      </Text>
                    )}
                  </View>
                  {idx === 0 && f.fit && (
                    <View style={styles.bestTag}>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function Scatter({ fit }: { fit: MetricFit }) {
  if (!fit.fit) return null;
  const W = screenW - 48 - 24; // card inner width
  const H = 200;
  const padL = 38,
    padR = 8,
    padT = 12,
    padB = 28;
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
  const lineX1 = minX;
  const lineX2 = maxX;
  const lineY1 = fit.fit.slope * lineX1 + fit.fit.intercept;
  const lineY2 = fit.fit.slope * lineX2 + fit.fit.intercept;

  return (
    <View
      style={{
        backgroundColor: "#FFFFFF",
        borderRadius: 4,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        marginTop: 12,
      }}
    >
      <Svg width={W} height={H}>
        {/* axes */}
        <Line
          x1={padL}
          y1={H - padB}
          x2={W - padR}
          y2={H - padB}
          stroke="#D1D5DB"
          strokeWidth={1}
        />
        <Line
          x1={padL}
          y1={padT}
          x2={padL}
          y2={H - padB}
          stroke="#D1D5DB"
          strokeWidth={1}
        />
        {/* fit line */}
        <Line
          x1={sx(lineX1)}
          y1={sy(lineY1)}
          x2={sx(lineX2)}
          y2={sy(lineY2)}
          stroke="#002FA7"
          strokeWidth={2}
        />
        {/* points */}
        {pts.map((p, i) => (
          <Circle
            key={i}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r={4}
            fill="#FFFFFF"
            stroke="#002FA7"
            strokeWidth={2}
          />
        ))}
        {/* labels */}
        <SvgText
          x={padL}
          y={H - 6}
          fontSize={10}
          fill="#6B7280"
          fontWeight="700"
        >
          conc
        </SvgText>
        <SvgText
          x={4}
          y={padT + 10}
          fontSize={10}
          fill="#6B7280"
          fontWeight="700"
        >
          y
        </SvgText>
        <SvgText
          x={W - padR - 32}
          y={H - 6}
          fontSize={9}
          fill="#6B7280"
        >
          {maxX.toFixed(1)}
        </SvgText>
        <SvgText x={padL + 2} y={H - 6} fontSize={9} fill="#6B7280">
          {minX.toFixed(1)}
        </SvgText>
        <SvgText x={4} y={H - padB} fontSize={9} fill="#6B7280">
          {minY.toFixed(2)}
        </SvgText>
        <SvgText x={4} y={padT + 16} fontSize={9} fill="#6B7280">
          {maxY.toFixed(2)}
        </SvgText>
      </Svg>
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
  selectedCard: {
    backgroundColor: "#F8F9FA",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 6,
    padding: 16,
    marginBottom: 12,
  },
  selectedLabel: {
    fontSize: 10,
    color: "#6B7280",
    letterSpacing: 2,
    fontWeight: "800",
  },
  selectedName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0A0A0A",
    marginTop: 4,
    marginBottom: 10,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 4,
  },
  statCell: { flex: 1 },
  statLabel: {
    fontSize: 9,
    color: "#6B7280",
    letterSpacing: 1.6,
    fontWeight: "800",
  },
  statValue: {
    fontSize: 16,
    color: "#0A0A0A",
    fontWeight: "900",
    marginTop: 2,
  },
  eqLine: {
    marginTop: 10,
    fontSize: 12,
    color: "#002FA7",
    fontWeight: "700",
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
    borderRadius: 6,
    marginBottom: 8,
  },
  fitRowActive: {
    borderColor: "#002FA7",
    backgroundColor: "#EEF2FF",
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: "#0A0A0A",
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: { color: "#FFFFFF", fontWeight: "900", fontSize: 12 },
  fitLabel: {
    fontSize: 14,
    color: "#0A0A0A",
    fontWeight: "700",
  },
  r2Bar: {
    height: 6,
    backgroundColor: "#E5E7EB",
    borderRadius: 3,
    marginTop: 6,
    overflow: "hidden",
  },
  r2Fill: {
    height: "100%",
    backgroundColor: "#002FA7",
  },
  fitMeta: {
    marginTop: 4,
    fontSize: 11,
    color: "#4B5563",
    fontWeight: "600",
  },
  fitMute: { marginTop: 4, fontSize: 11, color: "#92400E", fontWeight: "600" },
  bestTag: {
    backgroundColor: "#FFC300",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 3,
  },
  bestTagText: { fontSize: 9, fontWeight: "900", color: "#0A0A0A", letterSpacing: 1.2 },
});
