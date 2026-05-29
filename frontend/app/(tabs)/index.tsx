import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ImageBackground,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import {
  getCalSamples,
  getPredictions,
  getBlanks,
  avgBlankRGB,
  activeSamples,
} from "../../src/storage";
import { bestMetric, blankSigmas, fitAllMetrics, METRICS } from "../../src/metrics";
import type { CalSample, Prediction } from "../../src/storage";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [cal, setCal] = useState<CalSample[]>([]);
  const [preds, setPreds] = useState<Prediction[]>([]);

  const load = useCallback(async () => {
    setCal(await getCalSamples());
    const p = await getPredictions();
    p.sort((a, b) => b.createdAt - a.createdAt);
    setPreds(p);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const { best, hasBlank } = useMemo(() => {
    const active = activeSamples(cal);
    if (active.length < 2) return { best: null, hasBlank: false };
    const blanks = getBlanks(cal);
    const blankAvg = avgBlankRGB(cal);
    const sigmas = blanks.length >= 2 ? blankSigmas(blanks.map((b) => ({ r: b.r, g: b.g, b: b.b })), blankAvg ?? undefined) : undefined;
    const fits = fitAllMetrics(
      active.map((s) => ({
        concentration: s.concentration,
        rgb: { r: s.r, g: s.g, b: s.b },
        excluded: s.excluded,
      })),
      blankAvg ?? undefined,
      sigmas
    );
    return { best: bestMetric(fits), hasBlank: !!blankAvg };
  }, [cal]);

  const bestR2 = best?.fit?.r2;
  const bestLabel = best?.metric.label;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <ImageBackground
          source={{
            uri: "https://images.unsplash.com/photo-1764504985766-14ea5760a6fa?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
          }}
          imageStyle={{ borderRadius: 12, opacity: 0.22 }}
          style={styles.hero}
        >
          <Text style={styles.heroEyebrow}>COLORIMETRIC · LAB</Text>
          <Text style={styles.heroTitle}>Spectral{"\n"}Solution Lab.</Text>
          <Text style={styles.heroSub}>
            Build calibration curves from vial images. Predict concentration
            by color. Find the equation that fits your analyte best.
          </Text>
        </ImageBackground>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <StatTile
            testID="home-stat-cal"
            accent="#3B82F6"
            value={`${cal.length}`}
            label="CALIBRATION SAMPLES"
            icon="droplet"
          />
          <StatTile
            testID="home-stat-pred"
            accent="#22C55E"
            value={`${preds.length}`}
            label="PREDICTIONS"
            icon="target"
          />
          <StatTile
            testID="home-stat-r2"
            accent="#F59E0B"
            value={bestR2 != null ? bestR2.toFixed(3) : "—"}
            label="BEST R²"
            icon="trending-up"
          />
          <StatTile
            testID="home-stat-blank"
            accent="#A855F7"
            value={hasBlank ? "SET" : "—"}
            label="BLANK (I₀)"
            icon="star"
          />
        </View>

        {/* Best model card */}
        {best && best.fit ? (
          <View style={styles.bestCard} testID="home-best-card">
            <View style={styles.bestHeader}>
              <View style={styles.bestTrophy}>
                <Feather name="award" size={18} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bestLabel}>BEST COLORIMETRIC MODEL</Text>
                <Text style={styles.bestName} numberOfLines={2}>
                  {bestLabel}
                </Text>
              </View>
            </View>
            <View style={styles.bestStatsRow}>
              <BestStat label="R²" value={best.fit.r2.toFixed(4)} accent="#16A34A" />
              <BestStat label="SE" value={best.fit.se.toFixed(3)} accent="#0EA5E9" />
              <BestStat
                label="LoD (µM)"
                value={
                  Number.isFinite(best.fit.lod)
                    ? best.fit.lod.toFixed(3)
                    : "—"
                }
                accent="#A855F7"
              />
              <BestStat label="n" value={`${best.fit.n}`} accent="#F59E0B" />
            </View>
          </View>
        ) : (
          <View style={styles.setupCard}>
            <Feather name="info" size={18} color="#002FA7" />
            <View style={{ flex: 1 }}>
              <Text style={styles.setupTitle}>GET STARTED</Text>
              <Text style={styles.setupBody}>
                Add at least 2 calibration samples to find the best-fitting
                equation. Add a blank (I₀) to unlock Beer-Lambert.
              </Text>
            </View>
          </View>
        )}

        {/* Primary actions */}
        <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
        <View style={styles.actionGrid}>
          <ActionCard
            testID="home-action-calibrate"
            accent="#002FA7"
            icon="sliders"
            title="Calibrate"
            body="Add samples with known concentration"
            onPress={() => router.push("/calibrate")}
          />
          <ActionCard
            testID="home-action-predict"
            accent="#22C55E"
            icon="target"
            title="Predict"
            body="Measure a new unknown sample"
            onPress={() => router.push("/predict")}
          />
          <ActionCard
            testID="home-action-add"
            accent="#EF4444"
            icon="plus"
            title="Add Sample"
            body="Camera or gallery → tap ROI"
            onPress={() =>
              router.push({ pathname: "/analyze", params: { mode: "calibrate" } })
            }
          />
          <ActionCard
            testID="home-action-analysis"
            accent="#F59E0B"
            icon="activity"
            title="Analysis"
            body={`All ${METRICS.length} equations ranked by R²`}
            onPress={() => router.push("/analysis")}
          />
        </View>

        {/* Recent predictions removed — see Predict tab */}

        {/* Footer — credits */}
        <View style={styles.footer}>
          <View style={styles.footerDivider} />
          <Text style={styles.footerLabel}>DEVELOPED BY</Text>
          <Text style={styles.footerNames}>
            Swagatika Sahu · Biswajit Mohapatra · Jyotirmay Sethi
          </Text>
          <Text style={styles.footerCollegeLabel}>PROJECT WORK AT</Text>
          <Text style={styles.footerCollege}>
            Maharaja Purna Chandra Autonomous College{"\n"}Baripada, Odisha, India
          </Text>
          <Text style={styles.footerCopyright}>
            © {new Date().getFullYear()} Spectral Solution Lab. All rights reserved.
          </Text>
        </View>

        <View style={{ height: 16 }} />
      </ScrollView>
    </View>
  );
}

function StatTile({
  value,
  label,
  icon,
  accent,
  testID,
}: {
  value: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  accent: string;
  testID?: string;
}) {
  return (
    <View
      style={[styles.statTile, { borderTopColor: accent }]}
      testID={testID}
    >
      <View style={styles.statHead}>
        <Feather name={icon} size={14} color={accent} />
        <Text style={[styles.statLabel, { color: accent }]}>{label}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function BestStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <View style={[styles.bestStatCell, { borderTopColor: accent }]}>
      <Text style={[styles.bestStatLabel, { color: accent }]}>{label}</Text>
      <Text style={styles.bestStatValue}>{value}</Text>
    </View>
  );
}

function ActionCard({
  icon,
  title,
  body,
  onPress,
  accent,
  testID,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
  onPress: () => void;
  accent: string;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={styles.actionCard}
      testID={testID}
    >
      <View style={[styles.actionIcon, { backgroundColor: accent }]}>
        <Feather name={icon} size={20} color="#FFFFFF" />
      </View>
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionBody}>{body}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  hero: {
    borderRadius: 12,
    overflow: "hidden",
    padding: 22,
    backgroundColor: "#F4F4FA",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 16,
  },
  heroEyebrow: {
    fontSize: 11,
    letterSpacing: 2.4,
    fontWeight: "800",
    color: "#002FA7",
  },
  heroTitle: {
    fontSize: 36,
    lineHeight: 38,
    color: "#0A0A0A",
    fontWeight: "900",
    letterSpacing: -1.4,
    marginTop: 4,
  },
  heroSub: {
    marginTop: 10,
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 18,
    maxWidth: 340,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  statTile: {
    width: "47.7%",
    backgroundColor: "#F8F9FA",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderTopWidth: 3,
    padding: 14,
  },
  statHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  statLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  statValue: {
    marginTop: 6,
    fontSize: 26,
    fontWeight: "900",
    color: "#0A0A0A",
    letterSpacing: -0.8,
  },
  bestCard: {
    flexDirection: "row",
    backgroundColor: "#0A0A0A",
    borderRadius: 10,
    padding: 16,
    gap: 12,
    marginBottom: 18,
    overflow: "hidden",
  },
  bestAccent: {
    width: 4,
    backgroundColor: "#22C55E",
    borderRadius: 2,
  },
  bestLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    color: "#22C55E",
  },
  bestName: {
    fontSize: 18,
    color: "#FFFFFF",
    fontWeight: "800",
    marginTop: 4,
    marginBottom: 10,
  },
  bestStatsRow: { flexDirection: "row", gap: 10 },
  bestStatLabel: {
    fontSize: 9,
    color: "#9CA3AF",
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  bestStatValue: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "900",
    marginTop: 2,
  },
  setupCard: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: "#EEF2FF",
    borderColor: "#C7D2FE",
    borderWidth: 1,
    padding: 14,
    borderRadius: 10,
    marginBottom: 18,
  },
  setupTitle: {
    fontSize: 11,
    color: "#002FA7",
    fontWeight: "800",
    letterSpacing: 1.8,
  },
  setupBody: {
    marginTop: 4,
    fontSize: 12,
    color: "#0A0A0A",
    lineHeight: 17,
  },
  sectionLabel: {
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "800",
    letterSpacing: 2.2,
    marginTop: 6,
    marginBottom: 10,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 8,
  },
  actionCard: {
    width: "47.7%",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 14,
    minHeight: 120,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0A0A0A",
    letterSpacing: -0.3,
  },
  actionBody: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 3,
    lineHeight: 16,
  },
  predRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F8F9FA",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  predDot: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  predValue: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0A0A0A",
    letterSpacing: -0.5,
  },
  predMeta: { fontSize: 12, color: "#6B7280", marginTop: 1 },
  predR2: {
    fontSize: 11,
    fontWeight: "800",
    color: "#002FA7",
    letterSpacing: 1,
  },
  footer: {
    marginTop: 24,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  footerDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    alignSelf: "stretch",
    marginBottom: 18,
  },
  footerLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    color: "#9CA3AF",
    marginBottom: 6,
  },
  footerNames: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0A0A0A",
    textAlign: "center",
    lineHeight: 18,
  },
  footerCollegeLabel: {
    marginTop: 14,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    color: "#9CA3AF",
    marginBottom: 6,
  },
  footerCollege: {
    fontSize: 12,
    color: "#4B5563",
    textAlign: "center",
    lineHeight: 17,
    fontWeight: "600",
  },
  footerCopyright: {
    marginTop: 18,
    fontSize: 10.5,
    color: "#9CA3AF",
    textAlign: "center",
    fontWeight: "600",
  },
});
