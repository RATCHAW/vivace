// Entry point for the Remotion Lambda site bundle — the file
// apps/web/scripts/deploy-remotion.ts hands to `deploySite`. The <Player> in the
// app imports the compositions directly and never loads this file.
//
// One entry means one bundle holding every template. A template heavy enough to
// deserve its own site gets a sibling of this file registering a subset, deployed
// under its own site name; the API finds it through the template's
// REMOTION_SERVE_URL_<ID> override and nothing else changes.
import { registerRoot } from "remotion";
// The compositions set "Inter Variable" on their root and "JetBrains Mono
// Variable" on their instrument labels; the app gets both from styles.css, the
// Lambda bundle has to ship them itself or the render falls back to defaults.
import "@fontsource-variable/inter/opsz.css";
import "@fontsource-variable/jetbrains-mono";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
