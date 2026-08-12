Audit the files I name, or the current diff, against docs/build-protocol.md.

Check specifically:
- P0.2(g): any string literal that is a price, week, count, commodity name or percentage
- P0.3 / P14.1: any path where a figure could reach model output outside a {{block_id}}
- P1.6: week label and collection date present in every price-bearing view
- P2.1: null rendered as — and never as 0 or 0.0%
- P2.8: missing weeks drawn as gaps, never interpolated or zeroed
- P6.1: raw hex codes
- P6.5: --rise or --fall used for severity

Report findings as a list, each citing its protocol number. Fix only what I approve.
