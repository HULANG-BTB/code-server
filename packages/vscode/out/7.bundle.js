exports.ids = [7];
exports.modules = {

/***/ "./lib/vscode/node_modules/native-is-elevated/index.js":
/*!*************************************************************!*\
  !*** ./lib/vscode/node_modules/native-is-elevated/index.js ***!
  \*************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var lib = null;
var tried = false;
var returned = false;
var retValue = false;

module.exports = function() {
  if (returned) {
    return retValue;
  }

  if (!tried) {
    // Prevent multiple failed require attempts
    tried = true;
    try {
      lib = __webpack_require__(!(function webpackMissingModule() { var e = new Error("Cannot find module './build/Release/is-elevated'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));
    } catch (err) {
      console.error(err);
    }
  }

  if (!lib) {
    return false;
  }

  try {
    // Cache the result for subsequent calls
    returned = true;
    retValue = lib.isElevated();
  } catch (err) {
    console.error(err);
  }

  return retValue;
};


/***/ })

};;