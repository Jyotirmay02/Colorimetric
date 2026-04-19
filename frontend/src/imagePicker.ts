// Unified image-picker helper used by Calibrate & Predict flows.
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";

export type PickedImage = {
  uri: string;
  base64: string;
};

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

export async function takePhoto(): Promise<PickedImage | null> {
  if (!(await ensureCameraPerm())) return null;
  const res = await ImagePicker.launchCameraAsync({
    quality: 0.85,
    base64: true,
    allowsEditing: false,
  });
  if (res.canceled || !res.assets?.[0]?.base64) return null;
  return { uri: res.assets[0].uri, base64: res.assets[0].base64 };
}
