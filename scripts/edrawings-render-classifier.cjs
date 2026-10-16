/* global module */

function classifyRenderedVisual(visual) {
  if (!visual.available) return 'unavailable'
  // A mostly black viewport stays black even when a small menu, thumbnail, or
  // other bright region raises the aggregate variance.
  if (visual.nearBlackRatio >= 0.8) return 'black'
  // The probe takes 108 desktop samples. A loaded model observed in the
  // integration smoke has variance in the thousands; 150 leaves room for
  // capture noise while treating a nearly uniform viewport as non-model.
  const flat = visual.luminanceVariance < 150
  if (!flat) return 'model-or-mixed'
  if (visual.averageLuminance < 30) return 'black'
  if (visual.averageLuminance >= 230) return 'flat-white'
  return 'flat-gray'
}

module.exports = { classifyRenderedVisual }
