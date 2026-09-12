# Final Review Fix Report

## Status

Complete. The final review findings were implemented locally on `codex/dark-site-redesign`; nothing was pushed or published.

Implementation commit: `a096d02` (`fix: address final orbit and IPO review findings`).

## Changes

- Reworked orbit animation state so only the hovered sphere slows, while every sphere keeps an independent phase. Normal sphere diameters are constrained to 56–70 px; hover growth, opacity, depth shadows, and halo treatment are eased and depth-aware.
- Centralized and displayed the current strategy batch as `QS-260803-CLOSE`, with regression coverage excluding `260731` from rendered output.
- Split IPO allocation facts into explicit quantity/unit rows, added actual/reference qualifiers, and corrected Longxin and Unitree values and labels.
- Added forward-navigation scroll reset and destination-heading focus while preserving native back/forward behavior.
- Restored the third mobile candidate tile.
- Invalidated pending redemption validation when the code changes or purchase/redeem mode changes, preventing stale success messages.
- Hardened rendered-output assertions for the four product entries and the commercial-space company/event copy.

## TDD Evidence

- Orbit RED: `node --test tests/orbit-model.test.mjs` failed because `advanceOrbitMotion` was not exported. GREEN: 11/11 passed after implementing per-orbit motion and visual helpers.
- Current-batch RED: the focused model/render suite failed on the missing `strategyBatchId`; a browser mutation back to `QS-260731-CLOSE` also failed the expected visible-batch assertion. GREEN: the focused model/render suite passed 19/19 and the restored browser smoke passed.
- IPO RED: `node --test tests/prototype-model.test.mjs tests/prototype-source.test.mjs` failed on the old combined allocation copy. GREEN: 19/19 passed with separated rows, units, and qualifiers.
- SPA navigation RED: browser smoke timed out waiting for the destination heading to receive focus; the first scroll-reset implementation also exposed CSS smooth-scroll interference. GREEN: instant forward reset plus heading focus passed, while back/forward produced no app-forced `scrollTo` calls.
- Mobile tile RED: browser smoke observed two visible candidates at 390 px. GREEN: three were visible after removing the hiding rule.
- Redemption RED: editing during the validation delay still produced a stale success state. GREEN: edit and mode-switch race cases both passed after generation invalidation.

## Final Verification

| Check | Result |
| --- | --- |
| `npm run test:unit` | 30/30 passed |
| `npm test` | 30 unit/contract tests passed; all five Vinext build environments succeeded; 3/3 SSR/rendered tests passed |
| `npm run lint` | Passed after the final full test run |
| `node tests/browser-smoke.mjs` at `http://localhost:5174` | 10/10 flows passed, 12 screenshots captured, `browserErrors: []` |
| `git diff --check` | Passed; only line-ending conversion notices were emitted |
| Forbidden-copy scan in `app/` and `lib/` | No stale current-batch or retired-copy matches |

The independent in-app browser pass at 1440×1000 confirmed the four product entries, zero horizontal overflow, accessible orbit canvas, and a visually clean orbit composition with differentiated sphere sizes/glows. The temporary viewport was reset and the verification tab was finalized.

## Concerns

- The automated browser suite covers desktop/mobile navigation, 390 px candidate visibility, IPO rows, and both redemption races. During the separate in-app browser pass, an additional desktop navigation click using a CSS selector hit a selector deadline, so the in-app 390 px, IPO, and redemption spot checks were not repeated before the timebox ended.
- No remote action was taken. The implementation is local-only and ready for parent review.
