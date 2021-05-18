var NafInterface = require('../NafInterface');
const awsChime = require('amazon-chime-sdk-js');
const io = require("socket.io-client");

class AwsChimeAdapter extends NafInterface {
  constructor(){
    super();
    this.ackedTypes = ['u'];
    this.logsEnabled = false;
    this.forceEndMeeting = false;
    this.waitingAttendeesForOpenListener = {};
    this.audioVideoDidStartVariable = false;
    this.sentMessagesCounter = 0;
    this.totalReceivedMessagesCounter = 0
    this.receivedUMessagesCounter = 0;
    this.receivedUMMessagesCounter = 0;
    this.receivedSignalingMessagesCounter = 0;
    this.receivedRMessagesCounter = 0;
    this.receivedPersonalMessagesCounter = 0;
    this.receivedEntitiesCountMessagesCounter = 0;
    this.isMuted = false;
    this.isReceiveUMEnabled = false;
    this.isReceiveUEnabled = false;
    this.isSendUMEnabled = false;
    this.receivedAcceptClientEntitiesAlready = false;
  }
  /* Pre-Connect setup methods - Call before `connect` */
  setServerUrl(wsUrl) { 
    this.wsUrl = wsUrl;
    this.logsEnabled && console.log(new Date().toISOString(),  '1234: AwsChimeAdapter -> setServerUrl -> wsUrl', wsUrl);
  }
  setSignalingServerUrl(ssUrl) { 
    this.ssUrl = ssUrl;
    this.logsEnabled && console.log(new Date().toISOString(),  '1234: AwsChimeAdapter -> setSignalingServerUrl -> ssUrl', ssUrl);
  }
  setApp(app) {
    this.app = app;
    this.logsEnabled && console.log(new Date().toISOString(),  '1234: AwsChimeAdapter -> setApp -> appName', app);
  
  }
  setRoom(roomName) {
    this.room = roomName; 
    // this.room = "test"+Math.random()*1000;
    // this.room = "testfinalsupergreatroom";
    this.logsEnabled && console.log(new Date().toISOString(),  '1234: AwsChimeAdapter -> setRoom -> roomName', this.room);
    
  }
  setName(name){
    this.name = name;
  }
  setWebRtcOptions() {
    this.sendAudio = true;
  }

  setServerConnectListeners(successListener, failureListener) {
    this.connectSuccess = successListener;
    this.connectFailure = failureListener;
  }
  setRoomOccupantListener(occupantListener) {
    this.occupantListener = occupantListener;
  }

  setDataChannelListeners(openListener, closedListener, messageListener) {
    this.openListener = openListener;
    this.closedListener = closedListener;
    this.messageListener = messageListener;
  }

  async getRegion() {
    try {
      const region = await fetch('https://nearest-media-region.l.chime.aws',
        {
          method: 'GET',
        }
      );
      const res_json = await region.json();
      return res_json.region;
    } catch (error) {
        NAF.log.error(error, error.message)
        // alert(error.message);
        return "us-east-1";
    }
  };

  connectSignaling() {
    this.logsEnabled && console.log(new Date().toISOString(),  '1234  - CONNECTING SIGNALING ');
    const socket = this.socket = io(this.ssUrl, {'transports': ['websocket']});
    socket.on("connect", (response) => {
      NAF.log.write("User connected", socket.id);
      this.myId = socket.id;
      this.socket.emit("joinRoom", 
      {  
        room: this.room, 
        wsUrl: this.wsUrl,
      });
      socket.emit('handshake', (response)=>{
        console.log('1234 RESPONSE', response)
        document.body.addEventListener('handshakeReady', ()=>{
          console.log('1234 triggering handshakeReady', response)
          // send number of total entities
          const packet = {
            from: this.myId,
            data: {entitiesCount: Object.keys(NAF.connection.entities.entities).length},
          };
          socket.emit('entitiesCount', packet, (response)=>{
            console.log('1234 entitiesCount', response)
            // BE will keep trace of entities received per each client
            // connectSuccess sends u messages, we will implement acks there
            // such that client resends u if BE did not acknowledged it
            this.connectSuccess(this.myAttendeeId);
            // when BE received all entities from this client
            // it answers with the networked entities
          });
        });
        document.body.dispatchEvent(new CustomEvent(`signalingConnected`, {detail: {isFirst: response.isFirst}}));
        // setTimeout(() => {
        //   console.log('1234 emitting handshakeReady')
        //   document.body.dispatchEvent(new CustomEvent(`handshakeReady`));
        // }, 1000);
      })
      
    });
    this.enableReceiveDataMessages = this.enableReceiveDataMessages.bind(this);
    
    socket.on("entities", (entities)=>{
      console.log('1234 received entities', entities)
      
      document.body.addEventListener('localEntitiesDeleted', ()=>{
        this.parseReceivedEntities(entities);
        this.enableReceiveDataMessages();
      }, {once:true});
      document.body.dispatchEvent(new CustomEvent(`handshakeEntitiesReceived`));
      
      // setTimeout(() => {
      //   console.log('1234 emitting localEntitiesDeleted')
      //   document.body.dispatchEvent(new CustomEvent(`localEntitiesDeleted`));
      // }, 1000);
    });
  };

  sendDataGuaranteed(to, type, data) {this.sendData(to, type, data)};
  sendData(to, type, data) {
    // console.log('1234 sendData', to, type, data);

    const packet = {
      from: this.myId,
      to,
      type,
      data,
      sending: true,
    };
    
    if (this.socket) {
      if(this.ackedTypes.includes(type)){
        const timedCallback = this.withTimer(
          //onSuccess
          (response)=>{
            console.log('1234  - acked ', type, 'OK', response);
          },
          //onTimeout
          ()=> {
            console.log('1234  - ', type, 'not acked yet. resending', packet);
            this.socket.emit(type, packet, timedCallback );
          }, 5000)
        this.socket.emit(type, packet, timedCallback);
      } else {
        this.socket.emit(type, packet);
      }
    } else {
      NAF.log.warn('SocketIO socket not created yet');
    }
  }
  broadcastDataGuaranteed(type, data){this.broadcastData(type, data)}
  broadcastData(type, data) { 
    const packet = {
      from: this.myId,
      type,
      data,
      broadcasting: true
    };

    if (this.socket) {
      if(this.ackedTypes.includes(type)){
        const timedCallback = this.withTimer(
          //onSuccess
          (response)=>{
            console.log('1234  - acked ', type, 'OK', response);
          },
          //onTimeout
          ()=> {
            console.log('1234  - ', type, 'not acked yet. resending', packet);
            this.socket.emit(type, packet, timedCallback );
          }, 5000)
        this.socket.emit(type, packet, timedCallback);
      } else {
        this.socket.emit(type, packet);
      }
    } else {
      NAF.log.warn('SocketIO socket not created yet');
    }
}

enableReceiveDataMessages(){
  function receiveData(packet) {
    const from = packet.from;
    const type = packet.type;
    const data = packet.data;
    this.messageListener(from, type, data);
    // console.log('1234 received data', packet)
  }
  receiveData = receiveData.bind(this);
  
  this.socket.on("u", receiveData);
  this.socket.on("um", receiveData);
  this.socket.on("r", receiveData);
  this.socket.on("broadcast", receiveData);
}

parseReceivedEntities (entities) {
  console.log('1234  - parseReceivedEntities  - entities', entities);
  Object.keys(entities).forEach(entity => {
    console.log('1234  - parseReceivedEntities  - entity', entities[entity]);
    if(
      NAF.connection.entities.hasEntity(entities[entity].networkId)
      && NAF.utils.isMine(NAF.connection.entities.entities[entities[entity].networkId])){
        return
      }
    console.log('1234  - parseReceivedEntities  - calling messageListener for', entities[entity].networkId);
    this.messageListener(undefined, 'u', entities[entity]);
  });
}

// gatherMUEntities(){
//   const entities = NAF.entities.entities;
//   // if syncdata is empty, we need to call createSyncData once 
//   return Object.keys(entities).map( el => entities[el].components.networked.syncData )
// }

  async connect() {
    this.encoder = new TextEncoder();
    this.awsChime = awsChime;
    this.roster = {};
    this.shouldLeaveWhenDisconnect = true;
    this.topic = 'chat';
    this.logger = {
      info: (data)=>{this.logsEnabled && console.log('log info '+data)},
      warn: (data)=>{this.logsEnabled && console.log('log warn '+data)},
      error: (data)=>{this.logsEnabled && console.log('log error '+data)},
      debug: (data)=>{/* this.logsEnabled && console.log(new Date().toISOString(),  '1234 debug '+data()) */},
    }
    this.textDecoder = new TextDecoder();

    this.logsEnabled && console.log(new Date().toISOString(),  '1234: awsChime', this.awsChime);

    // Fetch Region
    this.region = await this.getRegion();
    this.logsEnabled && console.log(new Date().toISOString(),  '1234 Using region: ', this.region);
    // Start connection
    new this.awsChime.AsyncScheduler().start( async () => {      
      try {
        const response = await fetch(
          `${this.wsUrl}join?title=${encodeURIComponent(this.room)}&name=${encodeURIComponent(this.name)}&region=${encodeURIComponent(this.region)}`,
          {
            method: 'POST',
          }
        );
      
        this.json = await response.json();
        this.logsEnabled && console.log(new Date().toISOString(),  '1234: AwsChimeAdapter -> connect -> json', this.json);
        this.joinToken = this.json.JoinInfo.Attendee.Attendee.JoinToken;
        this.logsEnabled && console.log(new Date().toISOString(),  '1234: AwsChimeAdapter -> connect -> joinToken', this.joinToken);
        this.chimeMeetingId = this.json.JoinInfo.Meeting.Meeting.MeetingId;
        this.externalMeetingId = this.json.JoinInfo.Meeting.Meeting.ExternalMeetingId;
        this.logsEnabled && console.log(new Date().toISOString(),  '1234: AwsChimeAdapter -> connect -> chimeMeetingId', this.chimeMeetingId, 'externalMeetingId', this.externalMeetingId);
        this.joinInfo = this.json.JoinInfo;
        this.logsEnabled && console.log(new Date().toISOString(),  '1234: AwsChimeAdapter -> connect -> joinInfo', this.joinInfo);
        this.configuration = new this.awsChime.MeetingSessionConfiguration(this.joinInfo.Meeting, this.joinInfo.Attendee);
        this.logsEnabled && console.log(new Date().toISOString(),  '1234: AwsChimeAdapter -> connect -> configuration', this.configuration);
        this.myAttendeeId = this.joinInfo.Attendee.Attendee.AttendeeId;
        this.externalUserId = this.joinInfo.Attendee.Attendee.ExternalUserId;
        this.logsEnabled && console.log(new Date().toISOString(),  '1234: AwsChimeAdapter -> connect -> this.myAttendeeId', this.myAttendeeId, 'externalUserId', this.externalUserId);
        
        // Initialize Meeting - Device and AudioVideo stuff
        this.deviceController = new this.awsChime.DefaultDeviceController(this.logger);
        this.logsEnabled && console.log(new Date().toISOString(),  '1234: AwsChimeAdapter -> connect -> deviceController', this.deviceController);
        await this.initializeMeetingSession(this.configuration);
        this.logsEnabled && console.log(new Date().toISOString(),  '1234: AwsChimeAdapter -> connect -> initializeMeetingSession done');
        
        this.onConnectResult = await this.onConnect();

        this.setupSubscribeToAttendeeIdPresenceHandler();
        await this.join();
      } catch (error) {
        NAF.log.error(error, error.message)
        // alert(error.message);
        return;
      }    
    });
  }

  async initializeMeetingSession(configuration) {
    this.logsEnabled && console.log(new Date().toISOString(),  '1234: AwsChimeAdapter -> initializeMeetingSession -> initializeMeetingSession');
    
    configuration.enableWebAudio = true;
    configuration.enableUnifiedPlanForChromiumBasedBrowsers = false;
    configuration.attendeePresenceTimeoutMs = 5000;
    configuration.enableSimulcastForUnifiedPlanChromiumBasedBrowsers = false;
    this.meetingSession = new this.awsChime.DefaultMeetingSession(configuration, this.logger, this.deviceController);
    this.audioVideo = this.meetingSession.audioVideo;
    this.audioVideo.addObserver(this);
    this.logsEnabled && console.log(new Date().toISOString(),  '1234 meeting session', this.meetingSession)
    this.logsEnabled && console.log(new Date().toISOString(),  '1234 audioVideo', this.audioVideo)
  }

  audioVideoDidStart(){
    this.logsEnabled && console.log(new Date().toISOString(),  '1234 AUDIO VIDEO DID START !')
    
    this.setupCustomErrors();
    this.connectSignaling();
  
  }
  
  
  setupCustomErrors() {
    // TODO: refactor errors
    this.signalingClient = this.audioVideo.audioVideoController.meetingSessionContext.signalingClient;
    this.logsEnabled && console.log(new Date().toISOString(),  '1234  - AwsChimeAdapter  - setupCustomErrors  - this.signalingClient', this.signalingClient);
    const customObserver = {
      async handleSignalingClientEvent(e) {
        switch(e.type) {
          case awsChime.SignalingClientEventType.WebSocketClosed:
            this.logsEnabled && console.log(new Date().toISOString(),  '1234 WebSocketClosed, disconnecting', this.isDisconnecting);
            if(!this.isDisconnecting){
              NAF.log.error(e);
              if(e.closeCode === 1006){
                // meeting ended while this client was still connected
                // Set flag to avoid leave
                this.shouldLeaveWhenDisconnect = false;
                // call naf disconnection which will clean naf stuff
                // and then call this adapter's disconnect
                // where we will avoid the leave due to previous flag
                NAF.connection.disconnect();
              } else {
                // meeting left unexpectedly, with f5 or close tab
                // we don't need to call naf, but we need to disconnect from chime
                await this.disconnect();
              }
              // TODO anything after this does not work
              // NAF.isDisconnecting = null;
            }
            break;
          case awsChime.SignalingClientEventType.WebSocketError:
          case awsChime.SignalingClientEventType.WebSocketFailed:
              NAF.log.error(e);
              await this.disconnect();
            break;
            case awsChime.SignalingClientEventType.WebSocketSkippedMessage:
              NAF.log.error(e);
              this.logsEnabled && console.log(new Date().toISOString(),  '1234 WebSocketSkipped');
            break;
          default:
            // this.logsEnabled && console.log(new Date().toISOString(),  '1234 default', e.type);
            // do nothing
            break;
        }
      }
    };
    customObserver.handleSignalingClientEvent = customObserver.handleSignalingClientEvent.bind(this);
    this.signalingClient.registerObserver(customObserver);
  }

  async join() {
    this.logsEnabled && console.log(new Date().toISOString(),  '1234: AwsChimeAdapter -> join -> join');
    try {
      await this.openAudioInputFromSelection();
      await this.openAudioOutputFromSelection();
      this.audioVideo.start();
      // add keyshortcuts for debugging
      this.logsEnabled && this.enableKeyDown();
    } catch (error) {
      this.logsEnabled && console.log(new Date().toISOString(),  '1234: AwsChimeAdapter -> join -> error while fetching audio input or audio output', error);
      NAF.log.error(error)
      NAF.connection.disconnect();
    }
  }
  
  async openAudioInputFromSelection() {
    this.audioInput = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.logsEnabled && console.log(new Date().toISOString(),  '1234: AwsChimeAdapter -> openAudioInputFromSelection -> audioInput', this.audioInput);
    await this.audioVideo.chooseAudioInputDevice(this.audioInput);
  }
  
  async openAudioOutputFromSelection() {
    this.logsEnabled && console.log(new Date().toISOString(),  '1234: AwsChimeAdapter -> openAudioOutputFromSelection');
    await this.audioVideo.chooseAudioOutputDevice(this.audioInput);
    const audioMix = document.getElementById('meeting-audio');
    await this.audioVideo.bindAudioElement(audioMix);
  }
  async onConnect() {
    try {
      const response = await fetch(
        `${this.wsUrl}onconnect?externalMeetingId=${encodeURIComponent(this.externalMeetingId)}&attendeeid=${encodeURIComponent(this.myAttendeeId)}&externalUserId=${encodeURIComponent(this.externalUserId)}`,
        {
          method: 'POST',
        }
      );
      const res_json = await response.json();
      return res_json;
    } catch (error) {
        NA.log.error(error, error.message)
        // alert(error.message);
      return;
    }  
  }

  withTimer(onSuccess, onTimeout, timeout) {
    let called = false;
  
    const timer = setInterval(() => {
      onTimeout();
    }, timeout);
  
    return (...args) => {
      if (called) return;
      called = true;
      clearInterval(timer);
      onSuccess.apply(this, args);
    }
  }

  //USAGE
  // const myFunction = withTimer(
	// (message)=>{
  // 	console.log('SUCCESS ', message)
  // },
  // ()=>{
  // 	console.log('timeout...');
  // },
  // 1000);
  
  // setTimeout( ()=>{myFunction('YEAHHH')}, 10000);

  
  setupSubscribeToAttendeeIdPresenceHandler() {
    this.logsEnabled && console.log(new Date().toISOString(),  '1234: AwsChimeAdapter -> setupSubscribeToAttendeeIdPresenceHandler');
    const handler = async (attendeeId, present, externalUserId, dropped) => {
      // delete myself from list
      // delete this.roster[this.myAttendeeId];
      
      if (!present) {
        delete this.roster[attendeeId];
        this.logsEnabled && console.log(new Date().toISOString(),  '1234 on roster delete', attendeeId, this.roster)
        this.closedListener(attendeeId);
        return;
      }
      
      if (!this.roster[attendeeId]) {
        this.roster[attendeeId] = {
          name: (externalUserId.split('#').slice(-1)[0]),
        };
        this.logsEnabled && console.log(new Date().toISOString(),  '1234 on roster add',attendeeId, this.roster)
      }
      // TODO: do we need it?
      this.occupantListener(this.roster);
    };
    this.audioVideo.realtimeSubscribeToAttendeeIdPresence(handler);
  }
  async getParticipantList() {
    try {
      const response = await fetch(
        `${this.wsUrl}list?title=${encodeURIComponent(this.room)}&attendeeid=${encodeURIComponent(this.myAttendeeId)}`,
        {
          method: 'POST',
        }
      );
      const res_json = await response.json();
      return res_json;
    } catch (error) {
        NAF.log.error(error, error.message)
        // alert(error.message);
      return;
    }  
  }
  enableKeyDown(){
    this.onKeyDown = this.onKeyDown.bind(this)
    document.body.addEventListener('keydown', this.onKeyDown);
  }
  disableKeyDown(){
    document.body.removeEventListener('keydown', this.onKeyDown);
  }

  onKeyDown(ev){
    // this.logsEnabled && console.log('1234  - AwsChimeAdapter  - onKeyDown  - onKeyDown');
    if(!this.logsEnabled){
      return;
    }
    // this.logsEnabled && console.log(new Date().toISOString(),  '1234 onkeydown', ev.key)
    switch (ev.key) {
      case 'm':
        if(this.isMuted){
          this.logsEnabled && console.log(new Date().toISOString(),  '1234 onkeydown M, unmute', )
          this.audioVideo.realtimeUnmuteLocalAudio();
          this.isMuted = false;
        } else {
          this.logsEnabled && console.log(new Date().toISOString(),  '1234 onkeydown M, mute', )
          this.audioVideo.realtimeMuteLocalAudio();
          this.isMuted = true;
        }
        break;
    
      default:
        break;
    }
  }
  
  shouldStartConnectionTo(clientId) {return false}
  startStreamConnection(clientId) {}
  closeStreamConnection(clientId) {}
  getConnectStatus(clientId) {return false}
  
  getMediaStream(clientId) { return Promise.reject("Interface method not implemented: getMediaStream")}
  
  async disconnect() {
    this.isDisconnecting = true
    this.logsEnabled && console.log(new Date().toISOString(),  '1234  - AwsChimeAdapter  - disconnect  - disconnect');
    await this.leaveMeeting(this.myAttendeeId);
    console.log('1234 EMITTING DISCONNECT for socket');
    this.socket.disconnect();
    this.close(); 
  }

  async leaveMeeting(leavingAttendeeId) {
    await fetch(`${this.wsUrl}leave?title=${encodeURIComponent(this.room)}&attendeeid=${encodeURIComponent(leavingAttendeeId)}`, {
      method: 'POST',
    });
  }

  async endMeeting() {
    await fetch(`${this.wsUrl}end?title=${encodeURIComponent(this.room)}`, {
      method: 'POST',
    });
  }

  close() {
    if(this.audioVideo){
      this.audioVideo.stop();
    }
    this.roster = {};
    this.participantList = {}; 
    this.isAccepted = false;
    this.audioVideoDidStartVariable = false;
    if(this.closedListener){
      this.closedListener(this.myAttendeeId);
    }
    document.body.removeEventListener('keydown', this.onKeyDown);
    document.body.removeEventListener('isAccepted', this.onIsAccepted);
  }
  getServerTime() {  return new Date().getTime() }
}

module.exports = AwsChimeAdapter;
