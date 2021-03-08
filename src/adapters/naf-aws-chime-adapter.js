var NafInterface = require('../NafInterface');
const awsChime = require('amazon-chime-sdk-js');

class AwsChimeAdapter extends NafInterface {
  constructor(){
    super();
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
  }
  /* Pre-Connect setup methods - Call before `connect` */
  setServerUrl(wsUrl) { 
    this.wsUrl = wsUrl;
    this.logsEnabled && console.log(new Date().toISOString(),  '1234: AwsChimeAdapter -> setServerUrl -> wsUrl', wsUrl);
  
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
        this.isMaster = this.onConnectResult.IsMaster;
        this.masterId = this.onConnectResult.MasterAttendeeId;

        this.setupDataMessage();
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
    
    this.onConnectedFinished = this.onConnectedFinished.bind(this);
    document.body.addEventListener('onConnectedFinished', this.onConnectedFinished, {once:true});
    if(!this.isMaster){
      this.logsEnabled && console.log(new Date().toISOString(),  '1234 client going to send ', Object.keys(NAF.connection.entities.entities).length)
      const incomingSignal = {
        attendeeId: this.myAttendeeId,
        subDataType: "incomingClientEntities",
        entities: Object.keys(NAF.connection.entities.entities)
      }
      this.sendData('signaling', incomingSignal);
    }
    this.connectSuccess(this.myAttendeeId);
  }
  
  onConnectedFinished(){
    this.setupCustomSignaling();
    // if(!this.isMaster){
    //   this.isReady = true;

    // }
  }
  
  setupCustomSignaling() {
    this.signalingClient = this.audioVideo.audioVideoController.meetingSessionContext.signalingClient;
    this.logsEnabled && console.log(new Date().toISOString(),  '1234  - AwsChimeAdapter  - setupCustomSignaling  - this.signalingClient', this.signalingClient);
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
  setupDataMessage() {
    this.logsEnabled && console.log(new Date().toISOString(),  '1234: AwsChimeAdapter -> setupDataMessage');
    // declare an handler for each topic naf uses
    this.audioVideo.realtimeSubscribeToReceiveDataMessage('u', (dataMessage) => {
      this.totalReceivedMessagesCounter ++;
      this.receivedUMessagesCounter ++;
      const parsedPayload = JSON.parse(dataMessage.text());
      this.messageListener(this.name, 'u', parsedPayload)
      this.logsEnabled && this.dataMessageHandler(`RECEIVED u -${this.receivedUMessagesCounter} out of ${this.totalReceivedMessagesCounter}`, dataMessage, parsedPayload);
    });
    this.audioVideo.realtimeSubscribeToReceiveDataMessage('um', (dataMessage) => {
      this.totalReceivedMessagesCounter ++;
      this.receivedUMMessagesCounter ++;
      const parsedPayload = JSON.parse(dataMessage.text());
      this.messageListener(this.name, 'um', parsedPayload)
      this.logsEnabled && this.dataMessageHandler(`RECEIVED um -${this.receivedUMMessagesCounter} out of ${this.totalReceivedMessagesCounter}`, dataMessage, parsedPayload);
    });
    this.audioVideo.realtimeSubscribeToReceiveDataMessage('r', (dataMessage) => {
      this.totalReceivedMessagesCounter ++;
      this.receivedRMessagesCounter ++;
      const parsedPayload = JSON.parse(dataMessage.text());
      this.messageListener(this.name, 'r', parsedPayload)
      this.logsEnabled && this.dataMessageHandler(`RECEIVED r -${this.receivedRMessagesCounter} out of ${this.totalReceivedMessagesCounter}`, dataMessage, parsedPayload);
    });
    this.audioVideo.realtimeSubscribeToReceiveDataMessage(this.myAttendeeId, (dataMessage) => {
      this.totalReceivedMessagesCounter ++;
      this.receivedPersonalMessagesCounter ++;
      const parsedPayload = JSON.parse(dataMessage.text());
      this.handlePersonalMessage(this.name, parsedPayload);
      this.logsEnabled && this.dataMessageHandler(`RECEIVED Personal ${parsedPayload.subDataType} /${this.receivedPersonalMessagesCounter} out of ${this.totalReceivedMessagesCounter}`, dataMessage, parsedPayload);
    });
    if(this.isMaster){
      this.audioVideo.realtimeSubscribeToReceiveDataMessage('signaling', (dataMessage) => {
        this.totalReceivedMessagesCounter ++;
        this.receivedSignalingMessagesCounter ++;
        const parsedPayload = JSON.parse(dataMessage.text());
        this.logsEnabled && this.dataMessageHandler(`RECEIVED signaling -${this.receivedSignalingMessagesCounter} out of ${this.totalReceivedMessagesCounter}`, dataMessage, parsedPayload);
        this.handleSignal(parsedPayload);
      });
    } else {
      this.audioVideo.realtimeSubscribeToReceiveDataMessage('entitiesCount', (dataMessage) => {
        this.totalReceivedMessagesCounter ++;
        this.receivedEntitiesCountMessagesCounter ++;
        const parsedPayload = JSON.parse(dataMessage.text());
        this.handleEntitiesCountMessage(parsedPayload);
        this.logsEnabled && this.dataMessageHandler(`RECEIVED EntitiesCount /${this.receivedEntitiesCountMessagesCounter} out of ${this.totalReceivedMessagesCounter}`, dataMessage, parsedPayload);
      });
    }
  }

  checkMessageSize(data){
    this.encodedMessage = this.encoder.encode(JSON.stringify(data))
    this.logsEnabled && console.log(new Date().toISOString(),  '1234  - checkMessageSize ', this.encodedMessage.length);
    if (this.encodedMessage.length > 2000) {
      return false;
    }
    return true;
  }

  splitMessage(dataType, message) {
    this.messages = [];
    // we need to split
    if (dataType === 'um') {
      // um messages are in a d : [] structure
      if(message.d) {
        message.d.forEach((el)=> {
          this.finalMessage = { d : [] };
          this.finalMessage.d.push(el);
          this.messages.push(this.finalMessage);
        })
      }
    } else if (dataType === 'u'){
      // TODO split by single component
    }

    this.logsEnabled && console.log('SPLITTED this.messages', this.messages)
    return this.messages;
  }

  handlePersonalMessage(name, parsedPayload){
    this.logsEnabled && console.log('Received personal message,', parsedPayload.subDataType, 'from', name, 'payload', parsedPayload)
    switch(parsedPayload.subDataType){
      case "receivedAll": 
        const readySignal = {
          attendeeId: this.myAttendeeId,
          subDataType: "ready"
        }
        this.logsEnabled && console.log(new Date().toISOString(),  '1234 answering receivedAll with sending READY signal !', readySignal)
        this.sendData('signaling', readySignal);
        break;
        case "entitiesCountPersonal":
        this.logsEnabled && console.log(new Date().toISOString(),  '1234 handling entitiesCountPersonal')
        this.handleEntitiesCountMessage(parsedPayload)
        break;
        case "u":
        case "um":
        case "r":
          this.messageListener(this.name, parsedPayload.subDataType, parsedPayload)
          break;
      default:
        // do stuff 
        break;
    }
  }
  handleEntitiesCountMessage(parsedPayload){
    this.logsEnabled && console.log('Received entitiesCount message, Master has', parsedPayload.numberOfEntities, 'Local has', Object.keys(NAF.connection.entities.entities).length)
    if(parsedPayload.numberOfEntities > Object.keys(NAF.connection.entities.entities).length){
      this.logsEnabled && console.log('entitiesCount Master', parsedPayload.numberOfEntities, 'is different from local', Object.keys(NAF.connection.entities.entities).length)
      const syncAllSignal = {
        attendeeId: this.myAttendeeId,
        subDataType: "syncAll"
      }
      this.logsEnabled && console.log(new Date().toISOString(),  '1234 sending request syncAll signal !', syncAllSignal)
      this.sendData('signaling', syncAllSignal);
    } else {
      this.logsEnabled && console.log('entitiesCount Master', parsedPayload.numberOfEntities, ' === ', Object.keys(NAF.connection.entities.entities).length, ' Local')
      const countOkSignal = {
        attendeeId: this.myAttendeeId,
        subDataType: "countOk"
      }
      this.logsEnabled && console.log(new Date().toISOString(),  '1234 sending countOk signal !', countOkSignal)
      this.sendData('signaling', countOkSignal);
    }
  }

  handleSignal(parsedPayload){
    if (!parsedPayload.subDataType){
      return;
    }

    switch (parsedPayload.subDataType){
      case "ready":
        // do stuff
        this.logsEnabled && console.log(new Date().toISOString(), '1234 received ready signal from', parsedPayload.attendeeId)
        const attendeeStatus = this.waitingAttendeesForOpenListener[parsedPayload.attendeeId].status;
        if(attendeeStatus && attendeeStatus==="waiting" && parsedPayload.attendeeId !== this.myAttendeeId){
          this.logsEnabled && console.log(new Date().toISOString(), '1234 received ready signal from', parsedPayload.attendeeId, 'he was waiting. Proceed to send him updates')
          this.openListener(parsedPayload.attendeeId);
          this.waitingAttendeesForOpenListener[parsedPayload.attendeeId].status = "ready"
          this.logsEnabled && console.log(new Date().toISOString(), '1234 all updates sent to', parsedPayload.attendeeId, 'transitioning to ready now')
          // sending entitiesCount to all clients
          const entitiesCountMessage = {}
          entitiesCountMessage.numberOfEntities = Object.keys(NAF.connection.entities.entities).length;
          this.sendData('entitiesCount', entitiesCountMessage);
          // start timers to check for answer from each client
          this.startAllTimers();
        } else {
          this.logsEnabled && console.log(new Date().toISOString(), '1234 received ready signal from', parsedPayload.attendeeId, 'but he was not waiting, he was', attendeeStatus  )
        }
        break;
      case "syncAll"  :
        this.logsEnabled && console.log(new Date().toISOString(), '1234 syncAll received from', parsedPayload.attendeeId)
        // stop timer cause we received an answer to entitiesCount
        this.stopTimer(parsedPayload.attendeeId);
        // send all entities again
        this.openListener(parsedPayload.attendeeId);
        // sending personal entitiesCount to client requesting syncAll
        const countMessage = {
          subDataType : "entitiesCountPersonal",
          numberOfEntities : Object.keys(NAF.connection.entities.entities).length
        }
        this.logsEnabled && console.log(new Date().toISOString(), '1234 sending personal countMessage after syncAll request', countMessage )
        // sending a new request for entitiesCount but in private to only the non answering client
        this.sendData(parsedPayload.attendeeId, countMessage);
        // start timer to check for answer from this client
        this.startTimer(parsedPayload.attendeeId);
        break;
      case "countOk"  :
        this.logsEnabled && console.log(new Date().toISOString(), '1234 countOk received from', parsedPayload.attendeeId)
        this.stopTimer(parsedPayload.attendeeId);
        break;
      case "incomingClientEntities"  :
        this.logsEnabled && console.log(new Date().toISOString(), '1234 Incoming Entities', parsedPayload.entities, 'FROM ', parsedPayload.attendeeId )
        // store info for client's entity into an object
        const entitiesFromClient = {}
        parsedPayload.entities.forEach( (entity)=> {
          // false means not instantiated yet
          entitiesFromClient[entity] = false;
          // when entity is created, come back here and set to true.
          // also decrease counter, and if it's the last entity we are 
          // waiting for, send the receivedAll to client
          document.body.addEventListener(`entityCreated-naf-${entity}`, ()=>{
            if(this.waitingAttendeesForOpenListener[parsedPayload.attendeeId]){
              this.waitingAttendeesForOpenListener[parsedPayload.attendeeId]['incomingEntities'][entity] = true;
              this.waitingAttendeesForOpenListener[parsedPayload.attendeeId]['count'] -= 1;
              this.logsEnabled && console.log(new Date().toISOString(), '1234 received', `entityCreated-naf-${entity}`, 'remaining ', this.waitingAttendeesForOpenListener[parsedPayload.attendeeId]['count'])
              if(this.waitingAttendeesForOpenListener[parsedPayload.attendeeId]['count'] === 0){
                this.logsEnabled && console.log(new Date().toISOString(), '1234 reached 0 remaining entities for ', parsedPayload.attendeeId)
                // send receivedAll to client
                const receivedAllPersonalMessage = {
                  attendeeId: this.myAttendeeId,
                  subDataType: "receivedAll",
                }
                this.logsEnabled && console.log(new Date().toISOString(), '1234 sending personal receivedAll to', parsedPayload.attendeeId )
                this.sendData(parsedPayload.attendeeId, receivedAllPersonalMessage);
              }
            }
          }, {once:true})
        })     
        // store object in structure for waiting attendees, in the incomingEntities field
        this.waitingAttendeesForOpenListener[parsedPayload.attendeeId]['incomingEntities'] = entitiesFromClient;
        this.waitingAttendeesForOpenListener[parsedPayload.attendeeId]['count'] = parsedPayload.entities.length;        
        break;
      default:
        this.logsEnabled && console.log(new Date().toISOString(), '1234 received', parsedPayload.subDataType, 'signal from', parsedPayload.attendeeId, '. Signal is not handled')
          //do stuff
    }
  }

  startAllTimers(){
    for (const attendeeId in this.waitingAttendeesForOpenListener){
      // stop previous timer if any
      this.stopTimer(attendeeId);
      // setup new one
      this.logsEnabled && console.log(new Date().toISOString(), '1234 starting timer for', attendeeId)
      const timer = setInterval( ()=>{
        const countMessage = {
          subDataType : "entitiesCountPersonal",
          numberOfEntities : Object.keys(NAF.connection.entities.entities).length
        }
        this.logsEnabled && console.log(new Date().toISOString(), '1234 sending TIMED countMessage - in private', countMessage )
        // sending a new request for entitiesCount but in private to only the non answering client
        this.sendData(attendeeId, countMessage);
      }, 10000)
      this.waitingAttendeesForOpenListener[attendeeId]['timer'] = timer;
    }
  }

  startTimer(attendeeId){
    // stop previous timer if any
    this.stopTimer(attendeeId);
    // setup new one
    this.logsEnabled && console.log(new Date().toISOString(), '1234 starting timer for', attendeeId)
    if(this.waitingAttendeesForOpenListener[attendeeId]){
      const timer = setInterval( ()=>{
        const countMessage = {
          subDataType : "entitiesCountPersonal",
          numberOfEntities : Object.keys(NAF.connection.entities.entities).length
        }
        this.logsEnabled && console.log(new Date().toISOString(), '1234 sending TIMED countMessage - in private', countMessage )
        // sending a new request for entitiesCount but in private to only the non answering client
        this.sendData(attendeeId, countMessage);
      }, 10000)
      this.waitingAttendeesForOpenListener[attendeeId]['timer'] = timer;
    } else {
      this.logsEnabled && console.log(new Date().toISOString(), '1234 tried to start timer for', attendeeId, 'but he was not in waiting list');
    }
  }
  
  stopTimer(attendeeId){
    this.logsEnabled && console.log(new Date().toISOString(), '1234 stopping timer for', attendeeId)
    if(this.waitingAttendeesForOpenListener[attendeeId]){
      let timer = this.waitingAttendeesForOpenListener[attendeeId].timer;
      clearInterval(timer);
      timer = null;
    }
  }

  sendData(dataType, data) { 
    // safety check in case audioVideo was not ready yet
    if(!this.audioVideo) {
      return;
    }
    new this.awsChime.AsyncScheduler().start(() => {
      // forward naf dataType as topic of the message
      if (this.checkMessageSize(data)){
        // message size is ok
        if(this.logsEnabled){
          this.sentMessagesCounter ++;
          data.messageNumber = this.sentMessagesCounter
        }
        this.audioVideo.realtimeSendDataMessage(dataType, data, 2000);
        // this.logsEnabled && this.audioVideo.realtimeSendDataMessage('chat', data, 2000);
        // echo the message to the handler
        this.logsEnabled && this.dataMessageHandler(`SENT -${data.messageNumber}`, new this.awsChime.DataMessage(
          Date.now(),
          dataType,
          data,
          this.meetingSession.configuration.credentials.attendeeId,
          this.meetingSession.configuration.credentials.externalUserId
          ), data);
        } else {
          this.logsEnabled && console.log(new Date().toISOString(),  '1234 NEED TO SPLIT!', dataType, data)
          this.splitMessage(dataType, data).forEach( (message, i) => {
          if(this.logsEnabled){
            this.sentMessagesCounter ++;
            message.messageNumber = this.sentMessagesCounter
          }
          this.logsEnabled && console.log(new Date().toISOString(),  '1234 sending split message number ', i, message)
          this.audioVideo.realtimeSendDataMessage(dataType, message, 2000);
          // this.logsEnabled && this.audioVideo.realtimeSendDataMessage('chat', message, 2000);
          // echo the message to the handler
          this.logsEnabled && this.dataMessageHandler(`SENT -${message.messageNumber}`, new this.awsChime.DataMessage(
            Date.now(),
            dataType,
            message,
            this.meetingSession.configuration.credentials.attendeeId,
            this.meetingSession.configuration.credentials.externalUserId
          ), message);
        })
      }
    });
}

dataMessageHandler(mode, dataMessage, parsedMessage) {
  // Handles echoing of messages onto console log
  if (!dataMessage.throttled) {
    const isSelf = dataMessage.senderAttendeeId === this.meetingSession.configuration.credentials.attendeeId;
    if (dataMessage.timestampMs <= this.lastReceivedMessageTimestamp) {
      this.logsEnabled && console.log(new Date().toISOString(),  '1234 ', mode,' : ', dataMessage, parsedMessage, 
      'timestamp anomaly --> current', dataMessage.timestampMs, 'vs lastReceived', this.lastReceivedMessageTimestamp
    );
      return;
    }
    this.lastReceivedMessageTimestamp = dataMessage.timestampMs;

    this.logsEnabled && console.log(new Date().toISOString(),  '1234 ', mode,' : ', dataMessage, parsedMessage);
  
  }
}

  sendDataGuaranteed(clientId, dataType, data) {this.sendData(dataType, data)}
  broadcastData(dataType, data) { 
    // for (let clientId in this.peers) {
    this.sendData(dataType, data);
  // }
}
  broadcastDataGuaranteed(dataType, data) {this.sendData(dataType, data)}

  
  setupSubscribeToAttendeeIdPresenceHandler() {
    this.logsEnabled && console.log(new Date().toISOString(),  '1234: AwsChimeAdapter -> setupSubscribeToAttendeeIdPresenceHandler');
    const handler = async (attendeeId, present, externalUserId, dropped) => {
      // delete myself from list
      // delete this.roster[this.myAttendeeId];
      
      if (!present) {
        delete this.roster[attendeeId];
        this.logsEnabled && console.log(new Date().toISOString(),  '1234 on roster delete', attendeeId, this.roster)
        this.closedListener(attendeeId);
        if(this.isMaster){
              // call endpoint to removeParticipant
              this.logsEnabled && console.log(new Date().toISOString(),  '1234 on roster delete -> master manual leave for', attendeeId);
              this.leaveMeeting(attendeeId);
              this.stopTimer(attendeeId);
              delete this.waitingAttendeesForOpenListener[attendeeId];
        } else if (
          attendeeId === this.masterId 
          && Object.keys(this.roster)[0] === this.myAttendeeId
        ) {
          // have the first of the list to end the meeting since the master dropped
          this.logsEnabled && console.log(new Date().toISOString(),  '1234 on roster delete - ending meeting because master left')
          await this.endMeeting()
        }
        return;
      }
      
      if (!this.roster[attendeeId]) {
        this.roster[attendeeId] = {
          name: (externalUserId.split('#').slice(-1)[0]),
        };
        this.logsEnabled && console.log(new Date().toISOString(),  '1234 on roster add',attendeeId, this.roster)

        if(attendeeId !== this.myAttendeeId && this.isMaster){
          this.logsEnabled && console.log(new Date().toISOString(),  '1234 adding attendee to queue. waiting for ready signal', attendeeId)
          this.waitingAttendeesForOpenListener[attendeeId] = {status: 'waiting'};
        }
      }
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
    this.logsEnabled && console.log('1234  - AwsChimeAdapter  - onKeyDown  - onKeyDown');
    if(!this.logsEnabled){
      return;
    }
    this.logsEnabled && console.log(new Date().toISOString(),  '1234 onkeydown', ev.key)
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
    if(this.isMaster || this.forceEndMeeting){
      await this.endMeeting();
    } else if(this.shouldLeaveWhenDisconnect){
      await this.leaveMeeting(this.myAttendeeId);
    }
    this.close(); 
  }

  async leaveMeeting(leavingAttendeeId) {
    await fetch(`${this.wsUrl}leave?title=${encodeURIComponent(this.room)}&attendeeid=${encodeURIComponent(leavingAttendeeId)}`, {
      method: 'POST',
    });
  }

  async endMeeting() {
    this.logsEnabled && console.log(new Date().toISOString(),  '1234  - AwsChimeAdapter  - endMeeting  - endMeeting');
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
    this.isMaster = null;
    for (const attendeeId in this.waitingAttendeesForOpenListener){
      this.stopTimer(attendeeId);
    }
    this.waitingAttendeesForOpenListener = {};
    this.audioVideoDidStartVariable = false;
    if(this.closedListener){
      this.closedListener(this.myAttendeeId);
    }
    document.body.removeEventListener('keydown', this.onKeyDown);
  }
  getServerTime() {  return new Date().getTime() }
}

module.exports = AwsChimeAdapter;
