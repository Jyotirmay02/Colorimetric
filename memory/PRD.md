# Product Requirements Document — Chemistry RGB Analyzer

## Overview
A mobile Expo React Native app for chemistry research scholars to identify RGB values from solution images, apply custom computation formulas (e.g., Beer–Lambert absorbance), and visualize results over time.

## Users
- Single-user chemistry researcher (no auth).

## Core Features
1. **Capture / Upload**
   - Camera photo (expo-image-picker launchCameraAsync with base64)
   - Gallery upload (expo-image-picker launchImageLibraryAsync)
   - Permission prompts for camera + media library.

2. **RGB Extraction** (backend `/api/extract-rgb` using Pillow)
   - Mode A: Full image average RGB
   - Mode B: Tap-to-sample — user taps a point, backend averages small region around that point (region_size default 0.08).
   - Returns R, G, B (0–255), hex, optional sampled region bounds.

3. **Editable Computation Formula**
   - Default: `-log10(R01)` (Beer–Lambert style)
   - Variables: R, G, B (0–255), R01, G01, B01 (0–1)
   - Functions: log10, ln, sqrt, exp, abs, min, max, pow, sin, cos, tan; ^ for power
   - Safe evaluator in `frontend/src/formula.ts` (whitelisted identifiers, no Function escapes).

4. **Persistence**
   - Samples stored on device via AsyncStorage (`chem_rgb_samples_v1`). MongoDB not used for samples (per user choice).
   - Fields: id, createdAt, name, uri, r, g, b, hex, formula, computed.

5. **Visualization** (History tab)
   - Line chart (react-native-chart-kit): computed values across last 12 samples
   - Bar chart: selected sample's R/G/B
   - Scrollable list with color swatches; tap to select; delete/clear all

## Design
Swiss / High-contrast light theme (from `design_guidelines.json`): #FFFFFF background, #002FA7 primary, sharp borders, rounded-md (6px), bold monospace-style numeric data.

## Tech Stack
- Frontend: Expo SDK 54, expo-router (tabs + stack), react-native-chart-kit, expo-image-picker, AsyncStorage.
- Backend: FastAPI + Pillow for RGB averaging.
- All backend routes prefixed with `/api`.

## Future Enhancements
- Calibration curve fit (linear regression over concentration vs absorbance)
- CSV export of sample history
- Multiple chromophore tracking per experiment
