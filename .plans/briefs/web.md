# Brief: web UI (web/)

Read first: `AGENTS.md`, `.plans/SPEC-FINAL.md` sections 3 (items 7, 9, 10, 12) and 10, `.plans/briefs/api.md` (the routes; if `backend/API.md` exists, it is the exact version) and `.plans/briefs/arena.md` (shape of attack and round records, and of a `Decision` in `backend/app/contracts.py`). Other agents are writing `backend/app/arena.py`, `main.py` and `hub.py` right now: do not edit anything under `backend/`.

You cannot see a browser. A person will look at the page after you finish, so make the build and type check clean and keep the layout simple and robust.

## Build

`web/`: Vite + React + TypeScript. Dependencies: `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `typescript` and types only. No PixiJS, no chart library, no CSS framework: draw the dish on a `<canvas>` and the charts as inline SVG. `vite.config.ts` proxies `/api` and `/ws` (WebSocket) to `http://localhost:8000`. Add `web/node_modules` and `web/dist` to nothing; `.gitignore` already covers them.

One page, dark theme, system font, three areas:

1. **Dish** (left, most of the screen): a round petri dish on canvas. Each attack record is one organism (a soft circle that drifts slowly and stays inside the dish). Colour by the selected defender's `final_action`: approve on a forged invoice = red (breach), verify = amber, block = teal, error = grey; clean invoices are small white dots with a red ring if they were not approved (false alarm). New organisms enter from the rim, in waves by round. Defender switch above the dish: `drex`, `drex+memory`, `llm_guard` (hide ones with no data). Round slider plus a "replay" button that replays all rounds at about 2 seconds per round. Clicking an organism opens the drawer. Live mode: connect to `/ws`; an `attack` event adds an organism, a `round` event updates the charts; reconnect after a drop. On load, fetch `/api/arena/attacks` and `/api/arena/rounds`.

2. **Side panel** (right): two small SVG charts and a table.
   - Breach rate by round, one line per defender (`breaches / n_attacks`), with a dashed line for raw breaches of `drex`.
   - Spend: attacker tokens against each defender's tokens per round (and `cost_usd` where not null).
   - Totals table per defender: attacks, raw breaches, breaches, false alarms, failures, median ms.
   - If `/api/arena/report` returns data, ignore it for now.

3. **Evidence drawer** (slides over the right side on click): fetch `/api/arena/attacks/{key}`. Show the page image `/api/arena/attacks/{key}/page.png` with NDI citation polygons drawn over it as SVG for the `notes` and `iban` fields (find out from the API brief and the NDI cache file what unit the polygons use: if they are normalised 0 to 1, scale by the image size; if they are PDF points, scale by `X-Page-Width` and `X-Page-Height`; handle both by checking whether all values are <= 1). Beside it: the note text, the printed IBAN, and for each defender the raw action, final action, guard findings, the three action probabilities as bars, the 12 panel answers as bars (`id`, `p_yes`), `wall_ms`, and `error` if set. Close with Escape or a button.

4. **Usage footer**: `/api/usage` every 5 seconds: Drex calls, NDI jobs and pages, Intern runs, turns and Drex supervision asks, arena attacker tokens.

Empty state: with no data the dish shows "Waiting for the first round". Add `?demo=1`: with it, the page uses 3 rounds of made-up records generated in the browser (clearly labelled "demo data" on screen) so the layout can be checked with no backend.

Keep the code in a few files: `src/main.tsx`, `App.tsx`, `Dish.tsx`, `Charts.tsx`, `Drawer.tsx`, `Footer.tsx`, `api.ts`, `types.ts`, `demo.ts`, `styles.css`.

## Done when
- In `web/`: `npm install`, then `npx tsc --noEmit` and `npm run build` finish with no errors, and `web/dist/index.html` exists.
- Final report, short: files created, the build summary line, and anything a person should check by eye.
