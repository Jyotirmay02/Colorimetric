// Unified image-picker helper used by Calibrate & Predict flows.
// - Gallery: uses expo-image-picker as before.
// - Camera: on native, routes through an in-app CameraView screen (/camera) so we can lock
//   capture parameters (flash off, autofocus on, fixed quality, fixed Android pictureSize) for
//   more consistent cross-device RGB. On web, falls back to gallery (no native camera launcher).
import * as ImagePicker from "expo-image-picker";
import { Alert, Platform } from "react-native";

export type PickedImage = {
  uri: string;
  base64: string;
};

// ---- Pending camera resolver (set by takePhoto, consumed by /camera screen) ----
let _pendingResolve: ((p: PickedImage | null) => void) | null = null;

/** Called by the in-app CameraView screen when the user captures or cancels. */
export function _resolvePendingCamera(p: PickedImage | null) {
  if (_pendingResolve) {
    const fn = _pendingResolve;
    _pendingResolve = null;
    fn(p);
  }
}

async function ensureLibraryPerm(): Promise<boolean> {
  const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!p.granted) {
    Alert.alert("Permission needed", "Gallery access is required.");
    return false;
  }
  return true;
}
async function ensureCameraPerm(): Promise<boolean> {
  const p = await ImagePicker.requestCameraPermissionsAsync();
  if (!p.granted) {
    Alert.alert("Permission needed", "Camera access is required.");
    return false;
  }
  return true;
}

export async function pickFromGallery(): Promise<PickedImage | null> {
  if (!(await ensureLibraryPerm())) return null;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 0.85,
    base64: true,
  });
  if (res.canceled || !res.assets?.[0]?.base64) return null;
  return { uri: res.assets[0].uri, base64: res.assets[0].base64 };
}

/**
 * Capture a photo with locked parameters (native) or fall back to system camera (web).
 * @param router expo-router useRouter() instance from the caller
 */
export async function takePhoto(router: { push: (href: any) => void }): Promise<PickedImage | null> {
  // Web has no in-app CameraView reliability — use the OS gallery as a substitute.
  if (Platform.OS === "web") {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.85,
      base64: true,
    });
    if (res.canceled || !res.assets?.[0]?.base64) return null;
    return { uri: res.assets[0].uri, base64: res.assets[0].base64 };
  }

  if (!(await ensureCameraPerm())) return null;

  // If a previous capture was somehow left pending, resolve it as cancelled first.
  if (_pendingResolve) {
    const stale = _pendingResolve;
    _pendingResolve = null;
    stale(null);
  }

  return new Promise<PickedImage | null>((resolve) => {
    _pendingResolve = resolve;
    try {
      router.push("/camera");
    } catch (e) {
      _pendingResolve = null;
      resolve(null);
    }
  });
}
