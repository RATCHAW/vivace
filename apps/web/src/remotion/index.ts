// Entry point for the Remotion Lambda site bundle (see scripts/deploy-remotion.ts).
// The <Player> in the app renders RunVideo directly and never loads this file.
import { registerRoot } from "remotion";
// The composition sets "Inter Variable" on its root and "JetBrains Mono
// Variable" on its instrument labels; the app gets both from styles.css, the
// Lambda bundle has to ship them itself or the render falls back to defaults.
import "@fontsource-variable/inter/opsz.css";
import "@fontsource-variable/jetbrains-mono";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
