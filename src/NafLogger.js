/*eslint no-console: "off" */

class NafLogger {

  constructor() {
    this.debug = false;
  }

  setDebug(debug) {
    this.debug = debug;
  }

  write() {
    if (this.debug) {
      console.log.apply(this, arguments);
    }
  }

  warn() {
    console.warn.apply(this, arguments);
  }

  error() {
    if (this.errorCallback) {
      this.errorCallback(arguments);
    }
    console.error.apply(this, arguments);
  }

  setOnError(callback) {
    this.errorCallback = callback;
  }
}

module.exports = NafLogger;