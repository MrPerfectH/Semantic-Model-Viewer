# Model reference design QA

Date: 2026-10-26

final result: passed

## Target and evidence

Selected target: the first generated mockup, reference library with object tabs.
Source: `/home/harry/.codex/generated_images/01a16970-5e0c-7f31-be71-72c5235bc489/exec-1393bcac-ba6d-4d80-9997-d06eed61762d.png`.
Implementation: `/tmp/smv-reference-review/reference.png`, captured by the real
Chrome offline acceptance test at 1440 × 1024. Source is 1488 × 1058, essentially
the same aspect ratio; comparison rendered both at equal width in one HTML image.
Both show Reference / Sales / Overview with Sales in search. The implementation
uses the full synthetic demo model rather than the smaller invented mockup
inventory. The screenshot fixture supplies a synthetic Sales description.

## Findings and corrections

- P2: the initial five-column overview crowded the relationship and source
  summaries below the initial viewport. Changed the preview to three rows and
  made the heading explicitly report the preview/total count.
- P2: full relationship endpoint strings crowded the overview comparison. The
  summary now shows related table, cardinality and active status; the Relationships
  tab retains full endpoints and filter behavior.
- P2: documentation table text was smaller than intended. Increased it to 14px,
  widened the library to 310px and increased the object heading to 32px.
- P2: indirect consumers obscured direct references in the short summary. Direct
  references now sort first, with indirect consumers retained in the full list.

The revised implementation was recaptured and compared side by side with the
source after these corrections. No outstanding P0/P1/P2 layout findings.

## Surface review

- Typography: existing IBM Plex Sans/system fallback, monospace for expressions;
  14px documentation tables, 32px object heading, lower emphasis for metadata.
- Layout: persistent library and independently scrolling reading page, contextual
  tabs, paired relationship/measure summaries, source section, responsive single
  column below 650px. No horizontal workspace overflow at 1440px or 600px.
- Colors: existing cobalt accent, muted blue-gray text, white surfaces and pale
  workspace. New styling uses existing theme tokens. The app's existing brand
  asset is reused; no new decorative raster assets are required.
- Content: source-derived names and counts replace invented mockup values;
  absent descriptions remain explicit. Measure home-table membership is separate
  from detected references. Capture/opening provenance is distinguished from
  snapshot creation.
- Interaction: search/type filter, expression search, tabs, object links, Back,
  measure dependencies, model reset, offline re-export and restoration verified
  by `tests/reference.browser.cjs` and `tests/reference.test.cjs`.
- Safety: model text is rendered as text nodes; hostile description fixture is
  not interpreted as HTML. Snapshot metadata remains allowlisted.

## Minor follow-ups

- P3: object icons from the concept are omitted in favor of explicit type labels.
- P3: query search results can be long for large models; results are paginated
  in batches of 100 rather than virtualized.
- P3: the full demo has more content than the illustrative target; lower sections
  require reading-page scrolling. No data is concealed to mimic mockup counts.

This is a visual and feature QA result, not a claim that every existing repository
regression test passes. The final test-suite result is reported separately.
