/* global AFRAME, NAF */

AFRAME.registerComponent('networked-scene', {
  schema: {
    serverURL: {default: '/'},
    signalingServerURL: {default: '/'},
    app: {default: 'default'},
    room: {default: 'default'},
    connectOnLoad: {default: true},
    onConnect: {default: 'onConnect'},
    adapter: {default: 'socketio'}, // See https://github.com/networked-aframe/networked-aframe#adapters for list of adapters
    audio: {default: false}, // Only if adapter supports audio
    debug: {default: false},
    // HACK
    name: {default: 'Hegias User'},
  },

  init: function() {
    var el = this.el;
    this.connect = this.connect.bind(this);
    el.addEventListener('connect', this.connect);
    if (this.data.connectOnLoad) {
      el.emit('connect', null, false);
    }
  },

  /**
   * Connect to signalling server and begin connecting to other clients
   */
  connect: function () {
    NAF.log.setDebug(this.data.debug);
    NAF.log.write('Networked-Aframe Connecting...');

    this.checkDeprecatedProperties();
    this.setupNetworkAdapter();

    if (this.hasOnConnectFunction()) {
      this.callOnConnect();
    }
    // HACK
    return NAF.connection.connect(this.data.serverURL, this.data.signalingServerURL, this.data.app, this.data.room, this.data.audio, this.data.name);
  },

  checkDeprecatedProperties: function() {
    // No current
  },

  setupNetworkAdapter: function() {
    var adapterName = this.data.adapter;
    var adapter = NAF.adapters.make(adapterName);
    NAF.connection.setNetworkAdapter(adapter);
    this.el.emit('adapter-ready', adapter, false);
  },

  hasOnConnectFunction: function() {
    return this.data.onConnect != '' && window[this.data.onConnect];
  },

  callOnConnect: function() {
    NAF.connection.onConnect(window[this.data.onConnect]);
  },

  remove: function() {
  console.log('1234  - NETWORKED-SCENE REMOVE');
    NAF.log.write('networked-scene disconnected');
    this.el.removeEventListener('connect', this.connect);
    // HACK
		if (NAF.connection.isConnected() === true) {
      console.log('AFRAME DISCONNECTING from NAF')
      NAF.connection.disconnect();
    } 
    // END HACK
    // NAF.connection.disconnect();
  }
});
