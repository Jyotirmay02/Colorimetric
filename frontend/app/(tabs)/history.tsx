import { useCallback, useEffect, useState } from "react";
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
import { useFocusEffect } from "expo-router";
import {
  clearPredictions,
  deletePrediction,
  getPredictions,
} from "../../src/storage";
import type { Prediction } from "../../src/storage";

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await getPredictions();
    list.sort((a, b) => b.createdAt - a.createdAt);
    setPreds(list);
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

  const onDelete = (id: string) =>
    Alert.alert("Delete prediction?", "", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deletePrediction(id);
          load();
        },
      },
    ]);

  const onClear = () =>
    Alert.alert("Clear all predictions?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          await clearPredictions();
          load();
        },
      },
    ]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.label}>MEASUREMENT · LOG</Text>
        <View style={styles.headerRow}>
          <Text style={styles.title}>History</Text>
          {preds.length > 0 && (
            <TouchableOpacity onPress={onClear} testID="history-clear-btn">
              <Text style={styles.clearLink}>CLEAR ALL</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.subtitle}>
          Every prediction you save appears here with its RGB, predicted µM,
          and the equation used.
        </Text>

        {loading ? (
          <ActivityIndicator color="#002FA7" style={{ marginVertical: 30 }} />
        ) : preds.length === 0 ? (
          <View style={styles.emptyBox} testID="history-empty">
            <Feather name="inbox" size={32} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>NO PREDICTIONS YET</Text>
            <Text style={styles.emptySub}>
              Head to the Predict tab, take or upload an image, and save the
              measurement.
            </Text>
          </View>
        ) : (
          preds.map((p, idx) => (
            <View
              key={p.id}
              style={styles.row}
              testID={`history-item-${p.id}`}
            >
              <View style={styles.rowLeft}>
                {p.uri ? (
                  <Image source={{ uri: p.uri }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, { backgroundColor: p.hex }]} />
                )}
                <View
                  style={[styles.swatch, { backgroundColor: p.hex }]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.topRow}>
                  <Text style={styles.bigValue}>
                    {Number.isFinite(p.predictedConcentration)
                      ? `${p.predictedConcentration.toFixed(3)} µM`
                      : "—"}
                  </Text>
                  {p.fallback ? (
                    <View style={styles.defTag}>
                      <Text style={styles.defTagText}>DEFAULT</Text>
                    </View>
                  ) : (
                    <View style={styles.r2Tag}>
                      <Text style={styles.r2TagText}>
                        R² {p.bestR2.toFixed(3)}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.meta} numberOfLines={1}>
                  via {p.bestMetricLabel}
                </Text>
                <Text style={styles.meta}>
                  R {p.r} · G {p.g} · B {p.b} · {p.hex}
                </Text>
                <Text style={styles.timestamp}>
                  {new Date(p.createdAt).toLocaleString()}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => onDelete(p.id)}
                hitSlop={10}
                testID={`history-delete-${p.id}`}
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
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 18,
    marginBottom: 18,
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8F9FA",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  rowLeft: { alignItems: "center", gap: 4 },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  swatch: {
    width: 52,
    height: 8,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  bigValue: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0A0A0A",
    letterSpacing: -0.5,
  },
  r2Tag: {
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 3,
  },
  r2TagText: {
    fontSize: 10,
    color: "#1D4ED8",
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  defTag: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 3,
  },
  defTagText: {
    fontSize: 10,
    color: "#92400E",
    fontWeight: "900",
    letterSpacing: 1,
  },
  meta: { fontSize: 12, color: "#4B5563", marginTop: 2 },
  timestamp: { fontSize: 10, color: "#9CA3AF", marginTop: 3 },
});
