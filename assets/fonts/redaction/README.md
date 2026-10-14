# Threadpilot Redaction fonts

The page uses `_includes/threadpilot_wordmark_thread.svg` and `_includes/threadpilot_wordmark_pilot.svg`, generated from the OFL italic wordmark subset. Glyph advances and GPOS kerning are preserved, with -0.055em tracking. Each view box is cropped to its word's outline bounds. No italic font is loaded by the page. Regenerate the outlines from the archived subset:

```sh
git show 35f0ad0cd4a30f3ec4e5a2ac8d14da988c2a05b7:assets/fonts/redaction/Redaction70-Wordmark-Subset.woff2 > tmp/threadpilot-wordmark-source.woff2
uv run --with fonttools --with brotli python _scripts/build_threadpilot_wordmark.py tmp/threadpilot-wordmark-source.woff2
rm tmp/threadpilot-wordmark-source.woff2
```

`Redaction35-ASCII-Subset.woff2` contains the printable ASCII characters available in Redaction 35 Regular (U+0020–U+007E). The original font has no `<` or `>` glyphs. This subset covers all current Threadpilot headings and allows ordinary ASCII copy edits without regeneration. Non-ASCII heading characters require expanding the subset or will fall back to Georgia.

It was generated with FontTools 4.62.0 and Brotli 1.2.0:

```sh
git show e05aa2276706716c6690e2b9745f870ad9144f0a:assets/fonts/redaction/Redaction35-Regular.woff2 > /tmp/Redaction35-Regular.woff2
pyftsubset /tmp/Redaction35-Regular.woff2 \
  --unicodes='U+0020-007E' \
  --flavor=woff2 \
  --layout-features='*' \
  --output-file=assets/fonts/redaction/Redaction35-ASCII-Subset.woff2
```

The font license is in `LICENSE.txt`.
