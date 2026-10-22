# Temporary UX reference photography

These public sample images were downloaded from the supplied design HTML on 20 October 2026. They are temporary design artwork, not customer photos or uploaded gallery records. The original `stitch_marriage_suite_ui_design/` files are preserved.

The app serves local assets to avoid third-party image requests on personal invitation pages. Change `client/src/features/website/demo-media.ts` to replace the sample collection. Customer uploads will require the planned media storage/approval/access lifecycle; never put private customer photographs or signed URLs into this public directory. Remove the sample labels only when approved real media is integrated.

| Local file                | Original reference                                                                             | Image index (zero-based) |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------ |
| couple-traditional.jpg    | stitch_marriage_suite_ui_design/guest_wedding_home_desktop/code.html                           | 0                        |
| couple-floral.jpg         | stitch_marriage_suite_ui_design/guest_wedding_home_mobile/code.html                            | 0                        |
| couple-champagne.jpg      | stitch_marriage_suite_ui_design/guest_wedding_home_desktop_theme_b_champagne_atelier/code.html | 0                        |
| palace-courtyard.jpg      | stitch_marriage_suite_ui_design/planning_home_desktop/code.html                                | 0                        |
| mehendi-canopy.jpg        | stitch_marriage_suite_ui_design/guest_wedding_home_desktop/code.html                           | 1                        |
| palace-evening.jpg        | stitch_marriage_suite_ui_design/guest_wedding_home_desktop/code.html                           | 3                        |
| wedding-mandap.jpg        | stitch_marriage_suite_ui_design/guest_wedding_home_desktop_theme_b_champagne_atelier/code.html | 1                        |
| henna-detail.jpg          | stitch_marriage_suite_ui_design/guest_wedding_home_desktop_theme_b_champagne_atelier/code.html | 2                        |
| celebration-dancing.jpg   | stitch_marriage_suite_ui_design/guest_wedding_home_desktop_theme_b_champagne_atelier/code.html | 4                        |
| invitation-stationery.jpg | stitch_marriage_suite_ui_design/family_invitations_desktop/code.html                           | 0                        |

The reference assets are small originals (253–512 pixels wide); larger customer originals will improve large-screen sharpness. Hero covers load eagerly; secondary guest images load lazily. Theme/ceremony/preview images are decorative samples and never claim a real venue or family identity. No upload, moderation, storage, retention or permission behaviour is introduced by these placeholders.
