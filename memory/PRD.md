# Product Requirements Document — Chemistry RGB Analyzer

## Overview
Mobile Expo React Native app for chemistry research scholars to identify RGB values from solution images, build calibration curves from known-concentration samples, and predict concentration of new samples using the best-fitting colorimetric equation.

## Users
Single-user chemistry researcher (no auth).

## Core Workflow

### 1. Calibrate (first-run & editable later)
- User adds ~10 samples (target), each: image + known **concentration**.
- User **taps a Region of Interest (ROI)** on each image — backend (Pillow) averages RGB over a small square window.
- User can mark one sample as **Blank (I₀)** (auto-detected if concentration = 0).
- App automatically fits **14 colorimetric equations** linearly vs. concentration; computes R², SE, LoD for each.
- Best-R² equation is highlighted on the Calibrate status card.

### 2. Predict (always available)
- User captures/uploads new image → taps ROI.
- If calibration exists → concentration is computed via the **best-R² equation**; per-equation predictions shown as a table.
- If no calibration → falls back to default equation `log₁₀(255 / I)` with a clear banner.
- Predictions are saved to local history.

### 3. Analysis
- All 14 equations ranked by **R² (desc)** with bars.
- Tap any equation → scatter plot (concentration vs metric value) with fitted line, plus R² / SE / LoD / n stats and the linear equation.

## 14 Colorimetric Equations
R · G · B · (R+G+B)/3 · I = 0.299R+0.587G+0.112B · I₀−I · (R+G+B)/R · (R+G+B)/G · (R+G+B)/B · R/G · G/B · B/R · log₁₀(I₀/I) · √(ΔR²+ΔG²+ΔB²)

Blank-requiring: `I₀−I`, `log₁₀(I₀/I)`, Euclidean-Δ.

## Statistics
- **Linear regression**: `y = slope · x + intercept`
- **R²** = (Σ(x−x̄)(y−ȳ))² / (Σ(x−x̄)² · Σ(y−ȳ)²) — Pearson²
- **SE of regression** = √(SSres / (n − 2))
- **LoD** = 3 · SE / |slope|  (user-specified multiplier)
- **LoQ** = 10 · SE / |slope|

## Tech Stack
- **Frontend**: Expo SDK 54, expo-router (Stack + Tabs), react-native-svg (scatter plot), react-native-chart-kit (in deps, unused now), expo-image-picker, AsyncStorage.
- **Backend**: FastAPI + Pillow for region-averaged RGB extraction.
- All backend routes prefixed with `/api`.

## Persistence (AsyncStorage)
- `chem_rgb_calibration_v2` — calibration samples
- `chem_rgb_predictions_v2` — past predictions

## Navigation
- Tabs: **Calibrate** (default) · **Predict** · **Analysis**
- Modal: **analyze.tsx** (mode=calibrate|predict)

## Design
Swiss high-contrast light theme (`/app/design_guidelines.json`): #FFFFFF background, #002FA7 primary, flat 6px corners, bold numeric data.

## Future Enhancements
- Multi-analyte profiles (Paclitaxel, other analytes) with separate calibration curves
- Additional sensitivity metrics (ΔR+ΔG+ΔB, √(ΔR²+ΔG²+ΔB² + ...) from top of researcher's notes)
- CSV export of calibration & predictions
- Cloud sync of calibration profiles across devices
