# Cosmetics backlog

Deferred on purpose. None of these affect whether the product works; all of them
affect how it reads. Ordered by how likely a judge is to notice.

## 1. The mushroom

`web/src/app/page.tsx` — the "Savings that bloom" card uses an illustration
hotlinked from the template this design came from. It is a purple mushroom and a
coin. It has nothing to do with XRP, Flare, or scheduling, and it is the first
thing on the page that invites the question "why is that there?".

Replace with something we own. A still frame of the order pipeline, a chart, or
plain type on a colour would all beat it.

## 2. Assets we do not own

The two hero/use-case videos and the card image are hotlinked from a CloudFront
bucket belonging to whoever generated them. They resolve today and carry no
expiry, but the bandwidth is someone else's and the licence is nobody's.

Every one sits over a solid background colour, so nothing breaks if they vanish
— but they should be replaced with owned assets before submission. Drop a file
at `web/public/cta-background.mp4` and the closing section prefers it
automatically.

## 3. The font

Manrope stands in for TT Norms Pro, which is a commercial licence not present in
this repo. If the licence is bought, put the woff2 files in `web/public/fonts`
and change the family in `web/src/app/globals.css`. Nothing else needs touching.

## 4. Video playback is unverified

Media never loaded in the automated browser used during development — every
video reported `readyState 0` with no error, while images on the same page
loaded fine. That points at the automation environment rather than the assets,
but it means nobody has actually watched these play. Check in a real browser
before recording anything.

## 5. Smaller things

- The hero marquee is clipped mid-word at narrow widths; it reads as motion
  rather than a list, which is the intent, but it could start from a cleaner
  offset.
- Contrast of black body text over the hero video is untested, since the video
  has never rendered. If it turns out light, the copy needs a scrim.
