// Entry point for the Remotion Lambda site bundle (see scripts/deploy-remotion.ts).
// The <Player> in the app renders RunVideo directly and never loads this file.
import { registerRoot } from "remotion";
// The composition sets "Inter Variable" on its root; the app gets it from
// styles.css, the Lambda bundle has to ship it itself.
import "@fontsource-variable/inter/opsz.css";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
