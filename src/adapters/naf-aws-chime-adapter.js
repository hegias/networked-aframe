var NafInterface = require('../NafInterface');
const awsChime = require('amazon-chime-sdk-js');

class AwsChimeAdapter extends NafInterface {

  /* Pre-Connect setup methods - Call before `connect` */
  setServerUrl(wsUrl) { 
    this.wsUrl = wsUrl;
    console.log('1234: AwsChimeAdapter -> setServerUrl -> wsUrl', wsUrl);
  
  }
  setApp(app) {
    this.app = app;
    console.log('1234: AwsChimeAdapter -> setApp -> appName', app);
  
  }
  setRoom(roomName) {
    this.room = roomName; 
    // this.room = "test"+Math.random()*1000;
    // this.room = "testfinalsupergreatroom";
    console.log('1234: AwsChimeAdapter -> setRoom -> roomName', this.room);
    
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
        alert(error.message);
      return "us-east-1";
    }
  };

  async connect() {
    this.awsChime = awsChime;
    this.roster = {};
    this.name = 'remoteIDMax'+Math.floor(Math.random()*1000);
    this.topic = 'chat';
    this.logger = {
      info: (data)=>{console.log('log info '+data)},
      warn: (data)=>{console.log('log warn '+data)},
      error: (data)=>{console.log('log error '+data)},
      debug: (data)=>{/* console.log('1234 debug '+data()) */},
    }
    this.textDecoder = new TextDecoder();

    console.log('1234: awsChime', this.awsChime);

    // Fetch Region
    this.region = await this.getRegion();
    console.log('1234 Using region: ', this.region);
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
        console.log('1234: AwsChimeAdapter -> connect -> json', this.json);
        this.joinToken = this.json.JoinInfo.Attendee.Attendee.JoinToken;
        console.log('1234: AwsChimeAdapter -> connect -> joinToken', this.joinToken);
        this.chimeMeetingId = this.json.JoinInfo.Meeting.Meeting.MeetingId;
        this.externalMeetingId = this.json.JoinInfo.Meeting.Meeting.ExternalMeetingId;
        console.log('1234: AwsChimeAdapter -> connect -> chimeMeetingId', this.chimeMeetingId, 'externalMeetingId', this.externalMeetingId);
        this.joinInfo = this.json.JoinInfo;
        console.log('1234: AwsChimeAdapter -> connect -> joinInfo', this.joinInfo);
        this.configuration = new this.awsChime.MeetingSessionConfiguration(this.joinInfo.Meeting, this.joinInfo.Attendee);
        console.log('1234: AwsChimeAdapter -> connect -> configuration', this.configuration);
        this.myAttendeeId = this.joinInfo.Attendee.Attendee.AttendeeId;
        this.externalUserId = this.joinInfo.Attendee.Attendee.ExternalUserId;
        console.log('1234: AwsChimeAdapter -> connect -> this.myAttendeeId', this.myAttendeeId, 'externalUserId', this.externalUserId);
        
        // Initialize Meeting - Device and AudioVideo stuff
        this.deviceController = new this.awsChime.DefaultDeviceController(this.logger);
        console.log('1234: AwsChimeAdapter -> connect -> deviceController', this.deviceController);
        await this.initializeMeetingSession(this.configuration);
        console.log('1234: AwsChimeAdapter -> connect -> initializeMeetingSession done');

        await this.join();
        this.participantList = await this.getParticipantList();
        this.isMaster = this.participantList.IsMaster;
        this.setupDataMessage();
        this.setupSubscribeToAttendeeIdPresenceHandler();
        this.connectSuccess(this.myAttendeeId);
      } catch (error) {
        alert(error.message);
        return;
      }    
    });
  }

  async initializeMeetingSession(configuration) {
    console.log('1234: AwsChimeAdapter -> initializeMeetingSession -> initializeMeetingSession');
    
    configuration.enableWebAudio = true;
    configuration.enableUnifiedPlanForChromiumBasedBrowsers = false;
    configuration.attendeePresenceTimeoutMs = 5000;
    configuration.enableSimulcastForUnifiedPlanChromiumBasedBrowsers = false;
    this.meetingSession = new this.awsChime.DefaultMeetingSession(configuration, this.logger, this.deviceController);
    this.audioVideo = this.meetingSession.audioVideo;
    this.audioVideo.addObserver(this);

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

  async join() {
    console.log('1234: AwsChimeAdapter -> join -> join');
    await this.openAudioInputFromSelection();
    await this.openAudioOutputFromSelection();
    this.audioVideo.start();
  }
  
  async openAudioInputFromSelection() {
    this.audioInput = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    console.log('1234: AwsChimeAdapter -> openAudioInputFromSelection -> audioInput', this.audioInput);
    await this.audioVideo.chooseAudioInputDevice(this.audioInput);
  }
  
  async openAudioOutputFromSelection() {
    console.log('1234: AwsChimeAdapter -> openAudioOutputFromSelection');
    await this.audioVideo.chooseAudioOutputDevice(this.audioInput);
    const audioMix = document.getElementById('meeting-audio');
    await this.audioVideo.bindAudioElement(audioMix);
  }
  async getParticipantList() {
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
        alert(error.message);
      return;
    }  
  }
  setupDataMessage() {
    console.log('1234: AwsChimeAdapter -> setupDataMessage');
    // declare an handler for each topic naf uses
    this.audioVideo.realtimeSubscribeToReceiveDataMessage('u', (dataMessage) => {
      const parsedPayload = JSON.parse(dataMessage.text());
      console.log('1234: on receivedDataMessage -> parsedPayload', parsedPayload);
      this.messageListener(this.name, 'u', parsedPayload)
      this.dataMessageHandler(dataMessage);
    });
    this.audioVideo.realtimeSubscribeToReceiveDataMessage('um', (dataMessage) => {
      const parsedPayload = JSON.parse(dataMessage.text());
      console.log('1234: on receivedDataMessage -> parsedPayload', parsedPayload);
      this.messageListener(this.name, 'um', parsedPayload)
      this.dataMessageHandler(dataMessage);
    });
    this.audioVideo.realtimeSubscribeToReceiveDataMessage('r', (dataMessage) => {
      const parsedPayload = JSON.parse(dataMessage.text());
      console.log('1234: on receivedDataMessage -> parsedPayload', parsedPayload);
      this.messageListener(this.name, 'r', parsedPayload)
      this.dataMessageHandler(dataMessage);
    });

  }

  sendData(dataType, data) { 
    // safety check in case audioVideo was not ready yet
    if(!this.audioVideo) {
      return;
    }
    new this.awsChime.AsyncScheduler().start(() => {
      // forward naf dataType as topic of the message
      this.audioVideo.realtimeSendDataMessage(dataType, data, 2000);
      // echo the message to the handler
      this.dataMessageHandler(new this.awsChime.DataMessage(
        Date.now(),
        dataType,
        data,
        this.meetingSession.configuration.credentials.attendeeId,
        this.meetingSession.configuration.credentials.externalUserId
      ));
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
      console.log('1234 RECEIVED: ', dataMessage, JSON.parse(dataMessage.text()));
    }
  
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
    console.log('1234: AwsChimeAdapter -> setupSubscribeToAttendeeIdPresenceHandler');
    const handler = (attendeeId, present, externalUserId, dropped) => {
      // delete myself from list
      // delete this.roster[this.myAttendeeId];
      
      if (!present) {
        delete this.roster[attendeeId];
        console.log('1234 on roster delete', attendeeId, this.roster)
        this.closedListener(attendeeId);
        return;
      }
      
      if (!this.roster[attendeeId]) {
        this.roster[attendeeId] = {
          name: (externalUserId.split('#').slice(-1)[0]),
        };
        console.log('1234 on roster add',attendeeId, this.roster)
        this.openListener(attendeeId);
      }
      this.occupantListener(this.roster);
    };
    this.audioVideo.realtimeSubscribeToAttendeeIdPresence(handler);
  }
  
  
  shouldStartConnectionTo(clientId) {return false}
  startStreamConnection(clientId) {}
  closeStreamConnection(clientId) {}
  getConnectStatus(clientId) {return false}
  
  getMediaStream(clientId) { return Promise.reject("Interface method not implemented: getMediaStream")}
  
  async disconnect() {
    // await this.endMeeting();
    this.leave(); 
  }

  async endMeeting() {
    await fetch(`${this.wsUrl}end?title=${encodeURIComponent(this.room)}`, {
      method: 'POST',
    });
  }

  leave() {
    this.audioVideo.stop();
    this.roster = {};
    this.participantList = {}; 
    this.closedListener(this.myAttendeeId);
  }
  getServerTime() {  return new Date().getTime() }
}

module.exports = AwsChimeAdapter;
