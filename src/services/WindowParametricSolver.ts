// Handles the parametric window dimension algorithm
export interface WindowParametricConfig {
  edgeLength: number;     // Total wall length where windows are placed
  windowWidth: number;    // Default reference window width (used to define min/max range)
  windowHeight: number;   // Fixed window height
  windowSpacing: number;  // Reference spacing between windows (used to define min/max range)
  wwr: number;            // Target window-to-wall ratio
}

export interface WindowParametricResult {
  numWindows: number;     // Number of windows along the wall
  windowWidth: number;    // Calculated width of each window
  spacing: number;        // Spacing between windows
  marginStart: number;    // Margin from the wall edge to the first window (centered layout)
}

export function solveWindowParams(config: WindowParametricConfig): WindowParametricResult | null {
  const { edgeLength, windowWidth, windowHeight, wwr } = config;

  console.log(`Solving window params: edgeLength=${edgeLength.toFixed(2)}, target WWR=${(wwr * 100).toFixed(1)}%`);

  // No windows if WWR is zero
  if (wwr <= 0) return null;

  // Calculate total desired window area
  const wallArea = edgeLength * windowHeight;
  const targetWindowArea = wwr * wallArea;

  // Start by guessing number of windows based on default window size
  const estimatedWindowWidth = windowWidth;
  const estimatedWindowArea = estimatedWindowWidth * windowHeight;
  let numWindows = Math.max(1, Math.floor(targetWindowArea / estimatedWindowArea));

  // Ensure we don't exceed what can fit along the edge
  const minSpacing = 0.1;
  const minWindowWidth = 0.5;

  const maxPossibleWindows = Math.floor(edgeLength / (minWindowWidth + minSpacing));
  numWindows = Math.min(numWindows, maxPossibleWindows);

  if (numWindows < 1) return null;

  // Calculate the actual window width needed to hit the WWR target
  const totalWindowWidth = targetWindowArea / windowHeight;
  const windowWidthCandidate = totalWindowWidth / numWindows;

  if (windowWidthCandidate < minWindowWidth) return null;

  const totalWidthUsed = windowWidthCandidate * numWindows;
  const spacing = numWindows > 1 ? (edgeLength - totalWidthUsed) / (numWindows - 1) : 0;

  if (spacing < 0) return null;

  const marginStart = (edgeLength - (totalWidthUsed + spacing * (numWindows - 1))) / 2;

  const actualWWR = (windowWidthCandidate * windowHeight * numWindows) / wallArea;
  console.log(`Best config: ${numWindows} windows, ${windowWidthCandidate.toFixed(2)}m width, actual WWR=${(actualWWR * 100).toFixed(1)}%`);

  return {
    numWindows,
    windowWidth: windowWidthCandidate,
    spacing,
    marginStart: Math.max(0, marginStart)
  };
}