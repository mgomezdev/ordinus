# Ordinus workspace design

The application uses a light, restrained product interface. Preserve existing tokens in app/src/index.css: blue accent, pale neutral surfaces, subtle full borders, Inter/system sans typography, and semantic valid/invalid colors. Use the existing radius and spacing vocabulary.

The workspace has drawer controls on the left, a central grid, and a component library on the right. Mobile panels collapse behind explicit controls. New library authoring and preset controls should use labeled native inputs and inline progressive disclosure; avoid an extra modal layer.

Simple mode reduces configuration choices and uses a live rectangle preview. Width and depth describe the footprint, while Height names the vertical option. Keep empty, loading, invalid, pending, and error states readable. Use explicit Draw bin, Cancel, and Place bin actions. Drawing is transient and changes the layout only when placement succeeds.

Source: existing app/src/index.css, App.css, WorkspacePage.tsx, and GridPreview.tsx. This is a record of the existing system, not a new visual identity.
