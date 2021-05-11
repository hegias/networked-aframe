// Load required modules
const http = require("http"); // http server core module
const path = require("path");
const express = require("express"); // web framework external module
const fetch = require("node-fetch");
// Set process name
process.title = "networked-aframe-server";

// Get port or default to 8080
const port = process.env.PORT || 8080;

// Setup and configure Express http server.
const app = express();
app.use(express.static(path.resolve(__dirname, "..", "examples")));

// Serve the example and build the bundle in development.
if (process.env.NODE_ENV === "development") {
  const webpackMiddleware = require("webpack-dev-middleware");
  const webpack = require("webpack");
  const config = require("../webpack.dev");

  app.use(
    webpackMiddleware(webpack(config), {
      publicPath: "/dist/"
    })
  );
}

// Start Express http server
const webServer = http.createServer(app);
const io = require("socket.io")(webServer, {
  cors: {
    origin: "http://localhost:8080",
    methods: ["GET", "POST"],
  },
  transports: ["websocket"],
});
var isFirstU = true;
const rooms = {};
io.on("connection", socket => {
  console.log("user connected", socket.id);
  
  let curRoom = 'default';
  socket.on("handshake", (callback) => {
    console.log('handshake, clients are',Object.keys(rooms[curRoom].occupants).length, rooms[curRoom].occupants );
    callback({
      status: "ok handshake",
      isFirst : Object.keys(rooms[curRoom].occupants).length === 1 // true if 1, false otherwise
    });
  });

  socket.on("r", data => {
    // console.log('1234  - r broadcast', data, curRoom);
    socket.to(curRoom).emit("um", data);
  });
  
  socket.on("um", data => {
    // console.log('1234  - um broadcast', data, curRoom);
    socket.to(curRoom).emit("um", data);
  });

  socket.on("u", (payload, callback) => {
    console.log('u', payload);
    // hack to test ack..
    // if(isFirstU === true){
    //   console.log('1234 isFirstU ignoring', payload.data.networkId)
    //   isFirstU = false;
    //   return;
    // }
    // if(payload.broadcasting){

    // } else if (payload.sending){

    // }
    if(rooms[curRoom].entities[payload.data.networkId]){
      if(callback){
        callback({
          status: `ok u. already received entity ${payload.data.networkId}`
        });
      }
      //update local entity list with new owner/data
    } else {
      if(callback){
        callback({
          status: `ok u ${payload.data.networkId}`
        });
      }
      // TODO : if entity's owner/creator is master, do not add entity to current client's entities
      rooms[curRoom].entities[payload.data.networkId] = payload.data;
      if(payload.data.owner === payload.data.creator === 'master'){
        if(!rooms[curRoom].clients[payload.from].entitiesForMaster){
          rooms[curRoom].clients[payload.from].entitiesForMaster = [];
        }
        rooms[curRoom].clients[payload.from].entitiesForMaster.push(payload.data.networkId)
      } else {
        rooms[curRoom].clients[payload.from].entities.push(payload.data.networkId);
      }
      rooms[curRoom].clients[payload.from].entitiesReceived++;
      console.log('u for client', payload.from, 'received',  rooms[curRoom].clients[payload.from].entitiesReceived, 'total', rooms[curRoom].clients[payload.from].entitiesCount);
      if(rooms[curRoom].clients[payload.from].entitiesReceived ===  rooms[curRoom].clients[payload.from].entitiesCount){
        console.log('received all for', payload.from, 'sending entities');
        io.to(payload.from).emit("entities", rooms[curRoom].entities);
      }
    }
    socket.to(curRoom).emit("u", payload);
  });

  socket.on("entitiesCount", (data, callback) =>{
    rooms[curRoom].clients[data.from] = {
      entitiesCount : data.data.entitiesCount,
      entitiesReceived : 0,
      entities : [],
    }
    console.log('1234 received entitiesCount ', data, data.data.entitiesCount, 'result', rooms[curRoom].clients[data.from]);
    callback({
      status: "ok entitiesCount"
    });
  })

  socket.on("joinRoom", data => {
    const { room, wsUrl } = data;
    console.log('1234 joinRoom ', data);
    if (!rooms[room]) {
      rooms[room] = {
        name: room,
        occupants: {},
        wsUrl: wsUrl,
        entities: {},
        clients: {},
      };
    }

    const joinedTime = Date.now();
    rooms[room].occupants[socket.id] = joinedTime;
    curRoom = room;

    console.log(`${socket.id} joined room ${room}`);
    socket.join(room);

    socket.emit("connectSuccess", { joinedTime });
    const occupants = rooms[room].occupants;
    io.in(curRoom).emit("occupantsChanged", { occupants });
  });


  socket.on("send", data => {
    io.to(data.to).emit("send", data);
  });

  socket.on("broadcast", data => {
    console.log('1234  - broadcast', data, curRoom);
    socket.to(curRoom).emit("broadcast", data);
  });
  socket.on("disconnect", async () => {
    console.log('disconnected: ', socket.id, curRoom);
    if (rooms[curRoom]) {
      console.log("user disconnected", socket.id);

      delete rooms[curRoom].occupants[socket.id];
      const occupants = rooms[curRoom].occupants;
      socket.to(curRoom).emit("occupantsChanged", { occupants });
      if(rooms[curRoom].clients[socket.id]){
        console.log("client is leaving ",socket.id, rooms[curRoom].clients[socket.id]);
        rooms[curRoom].clients[socket.id].entities.forEach((e)=>{
          console.log("DELETING entity ",e);
          delete rooms[curRoom].entities[e];
        })
        delete rooms[curRoom].clients[socket.id];
        console.log("deleting client from clients list ", rooms[curRoom].clients);
        console.log("entities are now", rooms[curRoom].entities);

      }
      console.log("remaining occupants are", occupants);
      if (Object.keys(occupants).length === 0) {
        console.log("everybody left room. call endMeetingCallback and delete room");
        // end chime meeting
        try {
          await endMeetingCallback(rooms[curRoom].wsUrl, curRoom);
        } catch (error) {
          console.log('error ending meeting ', curRoom, error)
        }
        delete rooms[curRoom];
      }
    }

  });
});

async function endMeetingCallback (wsUrl, room)  {
  console.log('end chime meeting ', room)
  await fetch(`${wsUrl}end?title=${encodeURIComponent(room)}`, {
    method: 'POST',
  });
};

webServer.listen(port, () => {
  console.log("listening on http://localhost:" + port);
});
