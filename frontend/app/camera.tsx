// In-app camera screen with locked capture parameters for cross-device RGB consistency.
// Path 1 implementation: lock flash=off, autofocus=on, fixed quality, fixed pictureSize.
import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { _resolvePendingCamera } from "../src/imagePicker";

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [focusing, setFocusing] = useState(false);
  const resolvedRef = useRef(false);

  // Ensure resolver is called on unmount if user backs out via OS gesture
  useEffect(() => {
    return () => {
      if (!resolvedRef.current) {
        _resolvePendingCamera(null);
        resolvedRef.current = true;
      }
    };
  }, []);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const closeWith = (result: { uri: string; base64: string } | null) => {
    if (!resolvedRef.current) {
      _resolvePendingCamera(result);
      resolvedRef.current = true;
    }
    router.back();
  };

  const onCapture = async () => {
    if (!cameraRef.current || busy || !ready) return;
    setBusy(true);
    try {
      // Brief settle delay so AF/AE can stabilize after framing
      await new Promise((r) => setTimeout(r, 350));
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1.0,        // no JPEG variance from quality
        base64: true,
        exif: false,
        skipProcessing: false, // keep deterministic ISP output
      });
      if (!photo?.base64) {
        closeWith(null);
        return;
      }
      closeWith({ uri: photo.uri, base64: photo.base64 });
    } catch (e) {
      closeWith(null);
    } finally {
      setBusy(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Feather name="camera-off" size={36} color="#FFFFFF" />
        <Text style={styles.permTitle}>CAMERA PERMISSION REQUIRED</Text>
        <Text style={styles.permSub}>
          Enable camera access in settings to capture solution photos.
        </Text>
        <TouchableOpacity onPress={() => closeWith(null)} style={styles.permBtn}>
          <Text style={styles.permBtnText}>CLOSE</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        flash="off"
        autofocus="on"
        mute
        onCameraReady={() => setReady(true)}
        {...(Platform.OS === "android" ? { pictureSize: "1920x1080" } : {})}
      />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => closeWith(null)}
          style={styles.closeBtn}
          testID="cam-cancel"
        >
          <Feather name="x" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.lockBadgeRow}>
          <View style={styles.lockBadge}>
            <Feather name="lock" size={11} color="#FFFFFF" />
            <Text style={styles.lockBadgeText}>FLASH OFF</Text>
          </View>
          <View style={styles.lockBadge}>
            <Feather name="lock" size={11} color="#FFFFFF" />
            <Text style={styles.lockBadgeText}>AF ON</Text>
          </View>
          <View style={styles.lockBadge}>
            <Feather name="lock" size={11} color="#FFFFFF" />
            <Text style={styles.lockBadgeText}>Q · 1.0</Text>
          </View>
        </View>
      </View>

      {/* Center framing guide */}
      <View pointerEvents="none" style={styles.frameOverlay}>
        <View style={styles.frameCornerTL} />
        <View style={styles.frameCornerTR} />
        <View style={styles.frameCornerBL} />
        <View style={styles.frameCornerBR} />
        <View style={styles.centerDot} />
      </View>

      {/* Guidance strip */}
      <View style={styles.guideStrip} pointerEvents="none">
        <Text style={styles.guideText}>
          Hold steady · neutral lighting · fill the frame · 20–30 cm
        </Text>
      </View>

      {/* Bottom bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 18 }]}>
        <View style={{ width: 56 }} />
        <TouchableOpacity
          onPress={onCapture}
          activeOpacity={0.85}
          style={[styles.shutter, (!ready || busy) && styles.shutterDisabled]}
          disabled={!ready || busy}
          testID="cam-shutter"
        >
          {busy ? (
            <ActivityIndicator color="#0A0A0A" />
          ) : (
            <View style={styles.shutterInner} />
          )}
        </TouchableOpacity>
        <View style={{ width: 56 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: {
    flex: 1,
    backgroundColor: "#0A0A0A",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  lockBadgeRow: { flexDirection: "row", gap: 6 },
  lockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(34,197,94,0.85)",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 4,
  },
  lockBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  frameOverlay: {
    position: "absolute",
    top: "22%",
    left: "12%",
    right: "12%",
    bottom: "30%",
  },
  frameCornerTL: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 26,
    height: 26,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: "#FFFFFF",
  },
  frameCornerTR: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 26,
    height: 26,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: "#FFFFFF",
  },
  frameCornerBL: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: 26,
    height: 26,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: "#FFFFFF",
  },
  frameCornerBR: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: "#FFFFFF",
  },
  centerDot: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: -3,
    marginTop: -3,
    backgroundColor: "#FFFFFF",
  },
  guideStrip: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 130,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
  },
  guideText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.4,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 14,
    backgroundColor: "rgba(0,0,0,0.35)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 30,
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.5)",
  },
  shutterDisabled: { opacity: 0.5 },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#0A0A0A",
  },
  permTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 6,
  },
  permSub: {
    color: "#9CA3AF",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 300,
  },
  permBtn: {
    marginTop: 14,
    backgroundColor: "#002FA7",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 6,
  },
  permBtnText: {
    color: "#FFFFFF",
    fontWeight: "900",
    letterSpacing: 1.4,
    fontSize: 12,
  },
});
