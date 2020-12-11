var NafInterface = require('../NafInterface');
const awsChime = require('amazon-chime-sdk-js');

class AwsChimeAdapter extends NafInterface {
  constructor(){
    super();
    this.logsEnabled = false;
  }
  /* Pre-Connect setup methods - Call before `connect` */
  setServerUrl(wsUrl) { 
    this.wsUrl = wsUrl;
    this.logsEnabled && console.log('1234: AwsChimeAdapter -> setServerUrl -> wsUrl', wsUrl);
  
  }
  setApp(app) {
    this.app = app;
    this.logsEnabled && console.log('1234: AwsChimeAdapter -> setApp -> appName', app);
  
  }
  setRoom(roomName) {
    this.room = roomName; 
    // this.room = "test"+Math.random()*1000;
    // this.room = "testfinalsupergreatroom";
    this.logsEnabled && console.log('1234: AwsChimeAdapter -> setRoom -> roomName', this.room);
    
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
      debug: (data)=>{/* this.logsEnabled && console.log('1234 debug '+data()) */},
    }
    this.textDecoder = new TextDecoder();

    this.logsEnabled && console.log('1234: awsChime', this.awsChime);

    // Fetch Region
    this.region = await this.getRegion();
    this.logsEnabled && console.log('1234 Using region: ', this.region);
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
        this.logsEnabled && console.log('1234: AwsChimeAdapter -> connect -> json', this.json);
        this.joinToken = this.json.JoinInfo.Attendee.Attendee.JoinToken;
        this.logsEnabled && console.log('1234: AwsChimeAdapter -> connect -> joinToken', this.joinToken);
        this.chimeMeetingId = this.json.JoinInfo.Meeting.Meeting.MeetingId;
        this.externalMeetingId = this.json.JoinInfo.Meeting.Meeting.ExternalMeetingId;
        this.logsEnabled && console.log('1234: AwsChimeAdapter -> connect -> chimeMeetingId', this.chimeMeetingId, 'externalMeetingId', this.externalMeetingId);
        this.joinInfo = this.json.JoinInfo;
        this.logsEnabled && console.log('1234: AwsChimeAdapter -> connect -> joinInfo', this.joinInfo);
        this.configuration = new this.awsChime.MeetingSessionConfiguration(this.joinInfo.Meeting, this.joinInfo.Attendee);
        this.logsEnabled && console.log('1234: AwsChimeAdapter -> connect -> configuration', this.configuration);
        this.myAttendeeId = this.joinInfo.Attendee.Attendee.AttendeeId;
        this.externalUserId = this.joinInfo.Attendee.Attendee.ExternalUserId;
        this.logsEnabled && console.log('1234: AwsChimeAdapter -> connect -> this.myAttendeeId', this.myAttendeeId, 'externalUserId', this.externalUserId);
        
        // Initialize Meeting - Device and AudioVideo stuff
        this.deviceController = new this.awsChime.DefaultDeviceController(this.logger);
        this.logsEnabled && console.log('1234: AwsChimeAdapter -> connect -> deviceController', this.deviceController);
        await this.initializeMeetingSession(this.configuration);
        this.logsEnabled && console.log('1234: AwsChimeAdapter -> connect -> initializeMeetingSession done');

        await this.join();
        this.onConnectResult = await this.onConnect();
        this.isMaster = this.onConnectResult.IsMaster;
        this.masterId = this.onConnectResult.MasterAttendeeId;
        this.setupDataMessage();
        this.setupSubscribeToAttendeeIdPresenceHandler();
        this.connectSuccess(this.myAttendeeId);
        this.setupCustomSignaling();
      } catch (error) {
        NAF.log.error(error, error.message)
        // alert(error.message);
        return;
      }    
    });
  }

  async initializeMeetingSession(configuration) {
    this.logsEnabled && console.log('1234: AwsChimeAdapter -> initializeMeetingSession -> initializeMeetingSession');
    
    configuration.enableWebAudio = true;
    configuration.enableUnifiedPlanForChromiumBasedBrowsers = false;
    configuration.attendeePresenceTimeoutMs = 5000;
    configuration.enableSimulcastForUnifiedPlanChromiumBasedBrowsers = false;
    this.meetingSession = new this.awsChime.DefaultMeetingSession(configuration, this.logger, this.deviceController);
    this.audioVideo = this.meetingSession.audioVideo;
    this.audioVideo.addObserver(this);
    this.logsEnabled && console.log('1234 meeting session', this.meetingSession)
    this.logsEnabled && console.log('1234 audioVideo', this.audioVideo)
    // this.audioVideo.addDeviceChangeObserver(this);
    // this.setupDeviceLabelTrigger();
    // await this.populateAllDeviceLists();
    // this.setupMuteHandler();
    // this.setupCanUnmuteHandler();
    // this.setupSubscribeToAttendeeIdPresenceHandler();
    // this.setupDataMessage();
    // this.audioVideo.addContentShareObserver(this);
    // this.initContentShareDropDownItems();
  }
  
  setupCustomSignaling() {
    this.signalingClient = this.audioVideo.audioVideoController.meetingSessionContext.signalingClient;
    this.logsEnabled && console.log('1234  - AwsChimeAdapter  - setupCustomSignaling  - this.signalingClient', this.signalingClient);
    const customObserver = {
      async handleSignalingClientEvent(e) {
        switch(e.type) {
          case awsChime.SignalingClientEventType.WebSocketClosed:
            this.logsEnabled && console.log('1234 WebSocketClosed, disconnecting', this.isDisconnecting);
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
              this.logsEnabled && console.log('1234 WebSocketSkipped');
            break;
          default:
            // this.logsEnabled && console.log('1234 default', e.type);
            // do nothing
            break;
        }
      }
    };
    customObserver.handleSignalingClientEvent = customObserver.handleSignalingClientEvent.bind(this);
    this.signalingClient.registerObserver(customObserver);
  }

  async join() {
    this.logsEnabled && console.log('1234: AwsChimeAdapter -> join -> join');
    await this.openAudioInputFromSelection();
    await this.openAudioOutputFromSelection();
    this.audioVideo.start();
  }
  
  async openAudioInputFromSelection() {
    this.audioInput = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.logsEnabled && console.log('1234: AwsChimeAdapter -> openAudioInputFromSelection -> audioInput', this.audioInput);
    await this.audioVideo.chooseAudioInputDevice(this.audioInput);
  }
  
  async openAudioOutputFromSelection() {
    this.logsEnabled && console.log('1234: AwsChimeAdapter -> openAudioOutputFromSelection');
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
    this.logsEnabled && console.log('1234: AwsChimeAdapter -> setupDataMessage');
    // declare an handler for each topic naf uses
    this.audioVideo.realtimeSubscribeToReceiveDataMessage('u', (dataMessage) => {
      const parsedPayload = JSON.parse(dataMessage.text());
      this.logsEnabled && console.log('1234: on receivedDataMessage -> parsedPayload', parsedPayload);
      this.messageListener(this.name, 'u', parsedPayload)
      this.dataMessageHandler(dataMessage);
    });
    this.audioVideo.realtimeSubscribeToReceiveDataMessage('um', (dataMessage) => {
      const parsedPayload = JSON.parse(dataMessage.text());
      this.logsEnabled && console.log('1234: on receivedDataMessage -> parsedPayload', parsedPayload);
      this.messageListener(this.name, 'um', parsedPayload)
      this.dataMessageHandler(dataMessage);
    });
    this.audioVideo.realtimeSubscribeToReceiveDataMessage('r', (dataMessage) => {
      const parsedPayload = JSON.parse(dataMessage.text());
      this.logsEnabled && console.log('1234: on receivedDataMessage -> parsedPayload', parsedPayload);
      this.messageListener(this.name, 'r', parsedPayload)
      this.dataMessageHandler(dataMessage);
    });

  }

  checkMessageSize(data){
    this.encodedMessage = this.encoder.encode(JSON.stringify(data))
    this.logsEnabled && console.log('1234  - checkMessageSize ', this.encodedMessage.length, data);
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

  sendData(dataType, data) { 
    // safety check in case audioVideo was not ready yet
    if(!this.audioVideo) {
      return;
    }
    new this.awsChime.AsyncScheduler().start(() => {
      // forward naf dataType as topic of the message
      if (this.checkMessageSize(data)){
        // message size is ok
        this.audioVideo.realtimeSendDataMessage(dataType, data, 2000);
        // echo the message to the handler
        this.dataMessageHandler(new this.awsChime.DataMessage(
          Date.now(),
          dataType,
          data,
          this.meetingSession.configuration.credentials.attendeeId,
          this.meetingSession.configuration.credentials.externalUserId
        ));
      } else {
        this.logsEnabled && console.log('1234 NEED TO SPLIT!', dataType, data)
        this.splitMessage(dataType, data).forEach( (message, i) => {
          this.logsEnabled && console.log('1234 sending split message number ', i, message)
          this.audioVideo.realtimeSendDataMessage(dataType, message, 2000);
          // echo the message to the handler
          this.dataMessageHandler(new this.awsChime.DataMessage(
            Date.now(),
            dataType,
            message,
            this.meetingSession.configuration.credentials.attendeeId,
            this.meetingSession.configuration.credentials.externalUserId
          ));
        })
      }
    });
}

dataMessageHandler(dataMessage) {
  // Handles echoing of messages onto console log
  if (!dataMessage.throttled) {
    const isSelf = dataMessage.senderAttendeeId === this.meetingSession.configuration.credentials.attendeeId;
    if (dataMessage.timestampMs <= this.lastReceivedMessageTimestamp) {
      return;
    }
    this.lastReceivedMessageTimestamp = dataMessage.timestampMs;
    if(!isSelf){
      this.logsEnabled && console.log('1234 RECEIVED: ', dataMessage, JSON.parse(dataMessage.text()));
    }
    this.logsEnabled && console.log('1234 RECEIVED: ', dataMessage);
  
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
    this.logsEnabled && console.log('1234: AwsChimeAdapter -> setupSubscribeToAttendeeIdPresenceHandler');
    const handler = (attendeeId, present, externalUserId, dropped) => {
      // delete myself from list
      // delete this.roster[this.myAttendeeId];
      
      if (!present) {
        delete this.roster[attendeeId];
        this.logsEnabled && console.log('1234 on roster delete', attendeeId, this.roster)
        this.closedListener(attendeeId);
        if(this.isMaster){
              // call endpoint to removeParticipant
              this.logsEnabled && console.log('1234 on roster delete -> master manual leave for', attendeeId)
              this.leaveMeeting(attendeeId)
        }
        return;
      }
      
      if (!this.roster[attendeeId]) {
        this.roster[attendeeId] = {
          name: (externalUserId.split('#').slice(-1)[0]),
        };
        this.logsEnabled && console.log('1234 on roster add',attendeeId, this.roster)
        this.openListener(attendeeId);
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
  
  shouldStartConnectionTo(clientId) {return false}
  startStreamConnection(clientId) {}
  closeStreamConnection(clientId) {}
  getConnectStatus(clientId) {return false}
  
  getMediaStream(clientId) { return Promise.reject("Interface method not implemented: getMediaStream")}
  
  async disconnect() {
    this.isDisconnecting = true
    this.logsEnabled && console.log('1234  - AwsChimeAdapter  - disconnect  - disconnect');
    if(this.isMaster){
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
    this.logsEnabled && console.log('1234  - AwsChimeAdapter  - endMeeting  - endMeeting');
    await fetch(`${this.wsUrl}end?title=${encodeURIComponent(this.room)}`, {
      method: 'POST',
    });
  }

  close() {
    this.audioVideo.stop();
    this.roster = {};
    this.participantList = {}; 
    this.isMaster = null;
    this.closedListener(this.myAttendeeId);
  }
  getServerTime() {  return new Date().getTime() }
}

module.exports = AwsChimeAdapter;
