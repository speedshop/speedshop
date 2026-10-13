# Threadpilot Redaction fonts

`Redaction70-Wordmark-Subset.woff2` contains only the uppercase glyphs used by the `THREAD PILOT` hero wordmark. It was generated from the approved italic font at fleet base `6fb1b9d4d5060a2f250ee1b81d096b3eed728777` with FontTools 4.62.0 and Brotli 1.2.0:

```sh
git show 6fb1b9d4d5060a2f250ee1b81d096b3eed728777:assets/fonts/redaction/Redaction70-Italic.woff2 > /tmp/Redaction70-Italic.woff2
pyftsubset /tmp/Redaction70-Italic.woff2 \
  --text='THREADPILOT' \
  --flavor=woff2 \
  --layout-features='*' \
  --output-file=Redaction70-Wordmark-Subset.woff2
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
