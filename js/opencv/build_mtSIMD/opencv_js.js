
var cv = (function() {
  var _scriptDir = typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : undefined;
  if (typeof __filename !== 'undefined') _scriptDir = _scriptDir || __filename;
  return (
function(cv) {
  cv = cv || {};



  return cv.ready
}
);
})();
if (typeof exports === 'object' && typeof module === 'object')
  module.exports = cv;
else if (typeof define === 'function' && define['amd'])
  define([], function() { return cv; });
else if (typeof exports === 'object')
  exports["cv"] = cv;