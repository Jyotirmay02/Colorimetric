# Feature Graphic Spec — Play Store

The **Feature Graphic** is the big banner image that appears at the top of your Play Store listing and in promotional spots. It's required by Google Play.

## Required dimensions

- **Size:** 1024 × 500 pixels (exactly)
- **Format:** JPG or 24-bit PNG (no transparency)
- **No alpha channel, no text near the edges** (Google may crop on smaller displays)
- **Safe text area:** keep important text within the centre 924 × 400 region

---

## Suggested layout (use Canva, Figma, or any image editor)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│    ┌──┐                                                         │
│    │🧪│  SPECTRAL SOLUTION LAB                                  │
│    │  │  ───────────────────                                    │
│    └──┘  Colorimetric analysis from your phone                  │
│                                                                 │
│          [vial illustration]      [scatter-plot illustration]   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
     1024 × 500
```

## Colour palette (matches the app)

- Primary background: linear gradient from `#002FA7` (Klein blue, left) → `#0A0A0A` (charcoal, right), OR a solid `#002FA7`
- Primary text: `#FFFFFF` white
- Accent: `#F59E0B` (orange) for one underline or decorative element
- Optional spectrum stripe: red `#EF4444` → green `#22C55E` → blue `#3B82F6` (matches the RGB-channel colours used in the app)

## Text content (keep it minimal)

**Title (large, bold):**
```
Chromalyze
```

**Subtitle (smaller, regular):**
```
Colorimetric analysis from your phone
```

**Optional 3rd line (tiny):**
```
50+ equations · IUPAC LoD · Local-only
```

Don't add full sentences or app screenshots inside the feature graphic — it gets cropped on smaller displays. Keep it brand-style, not screenshot-style.

## Fastest way to produce it

1. **Canva** ([canva.com](https://www.canva.com/)) — search "Play Store Feature Graphic" template, pick a clean banner, recolour to the palette above, replace text. ~10 minutes.
2. **Figma** — free, set up a 1024×500 frame, drop a gradient rectangle, two text layers, and a small chemistry vial illustration from the [Icons8](https://icons8.com/icons/set/chemistry) free library.
3. **AI generator (Midjourney/DALL-E)** — prompt:  
   > *"Play Store feature graphic, 1024x500, deep blue gradient background, app title 'Chromalyze' in bold white sans-serif, subtitle 'Colorimetric analysis from your phone', small white test tube illustration with rainbow gradient inside on left, minimalist clean design, no watermark"*

## File to deliver

Save as:
```
/app/docs/feature-graphic-1024x500.png
```
Then upload it directly in **Play Console → Main store listing → Graphics → Feature graphic**.

---

## Bonus — promotional video (optional)

If you want to add a YouTube link later, record a 30-second screen capture of the app in use:
1. Show the home screen
2. Add a calibration sample
3. Tap a vial in an image, see RGB
4. View the best-fit chart
5. Predict an unknown

Upload to YouTube as unlisted, paste the URL into Play Console → "Promo video". Skip for the first release if short on time.
