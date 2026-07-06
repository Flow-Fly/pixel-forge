# Issue 58 Browser Regression Evidence

Date: 2026-07-06

## Fix Applied

The narrow viewport pass exposed a directly related menu regression: the
nonessential menu-bar labels could keep the File/Edit/View/Image controls from
fitting in a 390px viewport. The CSS now lets the brand area shrink and hides
nonessential labels below 520px, keeping all menu buttons reachable.

## Browser Pass

Ran against the Vite dev server in Chrome through the Chrome DevTools Protocol.

Desktop viewport: 1280x720

- File, Edit, View, and Image menu buttons were all inside the viewport.
- File opened at `1047.977..1233.977`, then hover switched to Edit, View, and
  Image without leaving the previous menu open.
- The Image menu opened at `1076..1262`, inside the 1280px viewport.
- The grouped Marquee tool menu opened above the workspace at `51.5..207.344`
  with `z-index: 10000`.
- The grouped menu rendered Marquee, Lasso, Polygonal Lasso, and Magic Wand.
- Selecting Lasso from the grouped menu changed the active tool to `lasso`.
- Transparency checker settings persisted:
  - light color: `#334455`
  - dark color: `#050607`
  - tile size: `18px`
- The main canvas used the persisted checker values, including `36px 36px`
  background tiles.
- Preview background sequence passed: white, black, checker.
- `localStorage["pf-preview-bg"]` ended as `checker`.

Narrow viewport: 390x720

- File button: `173.977..215.32`
- Edit button: `219.32..262.656`
- View button: `266.656..313.328`
- Image button: `317.328..372`
- Image menu opened at `186..372`, inside the 390px viewport.
- The grouped Marquee tool menu still opened inside the viewport and rendered
  Lasso.

Local scratch screenshots were captured under the ignored
`docs/verification/issue-58/` directory.

## Command Verification

- `npm run test:run`
- `npm run build`
- `git diff --check`
