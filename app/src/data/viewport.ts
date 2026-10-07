export type LabelledPoint = {
  x: number;
  y: number;
  radius: number;
  labelWidth: number;
  subtitleWidth: number;
  lines: number;
};

// Find the largest zoom that fits the actual painted bounds. Labels stay in
// screen pixels while node radii grow with the square root of camera zoom.
export function fitLabelledPoints(
  points: LabelledPoint[],
  width: number,
  height: number,
  currentRatio: number,
  minRatio: number,
  maxRatio: number,
) {
  // Labels stay in screen pixels. With an inspector and filter drawer open,
  // some are wider than the canvas at every zoom. Fit node geometry in that
  // case instead of collapsing to the minimum zoom for an impossible fit.
  const fitTextWidth = points.every(
    (p) => Math.max(p.labelWidth, p.subtitleWidth) + 8 <= width - 48,
  );
  const bounds = (factor: number) => {
    const boxes = points.map((p) => {
      const x = (p.x - width / 2) * factor;
      const y = (p.y - height / 2) * factor;
      const radius = p.radius * Math.sqrt(factor);
      const halfWidth = Math.max(
        radius + 7,
        fitTextWidth ? p.labelWidth / 2 + 4 : 0,
        fitTextWidth ? p.subtitleWidth / 2 + 4 : 0,
      );
      return {
        left: x - halfWidth,
        right: x + halfWidth,
        top: y - radius - 7,
        bottom: y + radius + 17 + p.lines * 16 + 7,
      };
    });
    return {
      left: Math.min(...boxes.map((b) => b.left)),
      right: Math.max(...boxes.map((b) => b.right)),
      top: Math.min(...boxes.map((b) => b.top)),
      bottom: Math.max(...boxes.map((b) => b.bottom)),
    };
  };
  let low = currentRatio / maxRatio,
    high = currentRatio / minRatio;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    const b = bounds(mid);
    if (b.right - b.left <= width - 48 && b.bottom - b.top <= height - 104)
      low = mid;
    else high = mid;
  }
  const b = bounds(low);
  return {
    ratio: currentRatio / low,
    // Camera coordinates use node positions, so account for the asymmetric
    // space occupied by labels below each node when centering the view.
    center: {
      x: width / 2 + (b.left + b.right) / (2 * low),
      y: height / 2 + ((b.top + b.bottom) / 2 + 28) / low,
    },
  };
}
