# CTA background video

Drop an MP4 here named `cta-background.mp4` and the CTA section plays it. No
configuration, no build step, nothing that expires.

The component prefers this file and falls back to an HLS stream only if it is
absent. Behind both sits `.cinematic-bg`, which is what the section actually
looks like when neither loads — so a missing video is never a broken layout.

Keep it short, silent and dark; it sits behind white text with a black gradient
over the top and bottom 200px.
