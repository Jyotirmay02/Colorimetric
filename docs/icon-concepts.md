# App Icon Design Concepts — Spectral Solution Lab

Pick one of the three concepts below. Each is described in detail so it can be created in **Figma, Canva, Illustrator, or any design tool**. For automatic icon generation across all required sizes (1024×1024 master, 512×512 Play Store, 192×192 launcher, adaptive icon foreground/background), use [icon.kitchen](https://icon.kitchen/) — it takes a single 1024 master PNG and generates everything Expo + Play Store need.

---

## Concept 1 — "Liquid Drop with Spectrum"  ⭐ recommended

A stylised vial-shape rendered as a single droplet, with a rainbow gradient sweep across it — instantly says "color + chemistry."

**Layout (1024 × 1024 canvas):**
- Background: solid `#002FA7` (Klein blue — matches your app accent) OR pure white `#FFFFFF`
- A centred chemistry test tube / round-bottom vial silhouette in white, occupying ~60% of the height
- Inside the vial: a vertical gradient from red → orange → yellow → green → blue → violet (full spectrum)
- A small white highlight on the top-left edge of the vial (gives 3D feel)
- No text on the icon — Android/iOS launchers display the app name underneath

**Why it works:**
- Communicates "color from solution" in one glance
- Reads clearly at 48×48 px (Android home screen)
- Spectrum gradient is unique and memorable

---

## Concept 2 — "RGB Color Pickr"

Three overlapping circles in pure R/G/B colours overlapping in the centre to form a chemistry-flask outline.

**Layout (1024 × 1024 canvas):**
- Background: dark navy `#0A0A0A` or pure white
- Three filled circles, each `~ 400 px diameter`, in pure RGB:
  - Red `#EF4444` top-centre
  - Green `#22C55E` bottom-left
  - Blue `#3B82F6` bottom-right
- 30% opacity on each circle so overlaps create mixed colours (CMY at intersections)
- In the central triangle of overlap, render a thin flask-stem icon in white outline

**Why it works:**
- Pure colour theory metaphor — perfect for an RGB app
- Modern, "tech-y" look

---

## Concept 3 — "Beer-Lambert Curve"  (most academic)

A minimalist line-art rising curve representing a calibration plot, on a clean background.

**Layout (1024 × 1024 canvas):**
- Background: solid `#F59E0B` (your orange accent) OR `#002FA7` (blue)
- A 4-point scatter (white filled dots) ascending from bottom-left to top-right
- A thin white best-fit line passing through them
- Below the line, small white "y = mx + c" in monospaced font
- Optional: a tiny solid white test tube in the bottom-left corner

**Why it works:**
- Looks scientific / publication-grade
- Distinguishes the app from generic colour-picker tools
- The equation text is a nice touch for a research audience

---

## Quick path to actually generating the icon

If you want it produced **right now without a designer**, the fastest tools:

1. **[Canva](https://www.canva.com/)** — search "App icon" template, pick a 1024×1024, drag a vial illustration, recolour. ~10 min.
2. **[icon.kitchen](https://icon.kitchen/)** — upload your 1024 master, it auto-generates all required Android adaptive icons + iOS sizes.
3. **AI generator**: Midjourney / DALL-E prompt:  
   > *"App icon for a chemistry colorimetric analysis mobile app, minimalist flat design, test tube with rainbow gradient liquid inside, deep blue background, no text, 1024x1024, vector style"*

---

## Files to replace in the project

Once you have your 1024×1024 master PNG, replace these files (keep the filenames exact):

| File | Size | Notes |
|---|---|---|
| `frontend/assets/images/icon.png` | 1024×1024 | Master app icon |
| `frontend/assets/images/adaptive-icon.png` | 1024×1024 | Android adaptive icon foreground (use a centred design with safe padding — at least 25% margin on each side, since Android crops to circles, rounded squares, etc.) |
| `frontend/assets/images/favicon.png` | 48×48 | Web favicon (downscaled version) |
| `frontend/assets/images/splash-icon.png` | 1024×1024 | Splash screen graphic (can match icon) |

After replacing, run `eas build --platform android --profile production` — the build will pick them up automatically.
