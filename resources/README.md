# mxwl brand assets

`icon.png` is the generated emerald M symbol with transparency. `logo.png` is the
horizontal mxwl wordmark on charcoal, used in the README. Both were created with
the built-in image generation tool; no API key or image service is needed to use
or package the checked-in artwork.

Run `npm run icons` to export `icon.icns`, `icon.ico`, and the Linux PNG sizes in
`icons/`. The export uses electron-builder's bundled converter and preserves the
source PNG. Commit the exports alongside any updated source artwork.

electron-builder uses these assets for the platform app icons and bundles the PNG
mark and Linux icon set under `resources/branding/`. The release installer extracts
that exact set from the verified AppImage and registers `mxwl-editor` in the user's
hicolor icon theme. The desktop entry remains `mxwl-editor.desktop` so it overrides
older system installations, while the displayed app name is `mxwl`.
`StartupWMClass=mxwl-editor` matches Electron's native Linux window class, keeping
the launcher and running window under one dock icon.

## Generation prompts

Icon:

> Use case: logo-brand. Asset type: production desktop application icon and brand symbol for mxwl, a developer workspace app that brings a browser, code review, terminals and AI agents together in a four-pane cockpit. Create ONE original centered icon symbol, not a sheet of options. Subject: a bold geometric capital M cleverly constructed from interlocking workspace/window panes with strong negative space. Flat vector-like polished design, emerald green matching the app's emerald accents with a restrained deeper green secondary facet if useful. Strong distinctive silhouette and very simple geometry, readable at 16 and 32 pixels. The mark fills roughly 80 percent of a square canvas with even padding. Genuinely transparent background, crisp antialiased edges. No wordmark, no small text, no captions, no border, no background tile, no mockup, no shadow, no perspective, no glow, no watermark. Deliver a clean high-resolution square PNG with alpha suitable for desktop launcher icons.

Final wordmark (`icon.png` supplied as the symbol reference):

> Create a pristine professional horizontal mxwl software wordmark. Input image is a reference for the established emerald four-pane M symbol; preserve that symbol's shape and color. Solid perfectly uniform dark charcoal background #0a0a0a filling the entire image, NOT transparent. Place the emerald M symbol beside lowercase "mxwl" exactly in bold smooth clean geometric sans-serif type, solid off-white #f5f5f5. Balanced horizontal layout, symbol about the same height as the text, generous clear space at edges. The letters are smooth solid uninterrupted shapes, crisp printed-vector styling. No noise or speckles, no paint effects, no distressing, no texture, no shadows, no glow. Only the emerald symbol and the exact four letters mxwl on the uniform charcoal background. Wide landscape brand logo.
