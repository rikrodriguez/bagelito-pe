# Mobile readability candidate — preserved RED

Code `cbf10f7f101742a899f9a681d0a6ddd24dc9e36b`, immutable review-only server3248. Five viewport/full-page pairs were captured and inspected:390×844,1536×1024,320×700,1024×768,1280×800. Thirty-one source/helper/art hashes remained stable; no product or shared QA driver edits by the capture worker.

The capture process ended **exit1** because the focused caption audit found three defects at320px:

1. Blueberry glyph ends at x316.95 while its case ends at310px.
2. Everything/Sesame glyphs overlap8.406×20px.
3. Cinnamon Raisin/Blueberry glyphs overlap0.75×11.203px.

The320 screenshot visibly confirms the first-row label collision and Blueberry overhang. The new audit compares native glyph rectangles pairwise and against case bounds; the unchanged generic geometry helper does not group these placards and reported0 failures. Neither result replaces the other.

The remaining390/1536/1024/1280 caption audits had0 failures. All five contexts have exactly8bagel and5schmear captions matching verified catalog names and actual HTML text nodes. Minimum caption font sizes observed:16px at390/320;14.76px at1024;18px at1536;15px at1280. New white placards improve contrast;320 still requires layout correction rather than a smaller font or weaker assertion.

Five HTML images decoded in each context. Safety/capability/page/console errors0; five known framework initialization reads, one per document. Retired copy remained absent.

A separate390px context verified both visible case label pills through native touchscreen taps at their actual span centers, after fresh navigation before each action. Both pills measured366×44px with15px text; hit-testing returned the label span; callbacks reached pack-size and schmear-size. The focused tap process ended exit0 with no safety/capability failures. It is not a complete purchase journey.

Desktop composition remains anchored like c987; DOM positions and the asset's visible alpha remain distinct. No final fidelity claim is made. Root retains the original/reference comparison from the prior anchored checkpoint; this source change concerns mobile text and visible actions.
