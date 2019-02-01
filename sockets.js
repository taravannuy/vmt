const controllers = require("./controllers");
const _ = require("lodash");
const socketInit = require("./socketInit");
const ObjectId = require("mongoose").Types.ObjectId;

// const io = require('socket.io')(server, {wsEngine: 'ws'});
module.exports = function() {
  const io = socketInit.io;
  io.sockets.on("connection", socket => {
    // console.log(socket.getEventNames())

    socket.on("JOIN_TEMP", async (data, callback) => {
      socket.join(data.roomId, async () => {
        let user;
        let promises = [];
        // If the user is NOT logged in, create a temp user
        if (!data.userId) {
          try {
            user = await controllers.user.post({
              username: data.username,
              accountType: "temp"
            });
          } catch (err) {
            console.log("Error creating user ", err);
          }
        } else {
          user = { _id: data.userId, username: data.username };
        }
        socket.user_id = user._id; // store the user id on the socket so we can tell who comes and who goes
        socket.username = user.username;
        const message = {
          user: { _id: user._id, username: "VMTbot" },
          room: data.roomId,
          text: `${data.username} joined ${data.roomName}`,
          autogenerated: true,
          timestamp: new Date().getTime()
        };
        promises.push(controllers.messages.post(message));
        // If this is the user in the room, update the blank room created from "Try out a Workspace"
        // We will use the existance if the creator field to check if this is firstEntry on the front end
        if (data.firstEntry) {
          promises.push(
            controllers.tabs.put(data.tabId, { tabType: data.roomType })
          );
          promises.push(
            controllers.rooms.put(data.roomId, {
              roomType: data.roomType,
              name: data.roomName,
              members: [{ user: user._id, role: "facilitator" }],
              currentMembers: [user._id],
              creator: user._id
            })
          );
        }
        promises.push(
          controllers.rooms.addCurrentUsers(data.roomId, ObjectId(user._id), {
            user: ObjectId(user._id),
            role: data.firstEntry ? "facilitator" : "participant"
          })
        );
        let results;
        try {
          results = await Promise.all(promises);
          socket
            .to(data.roomId)
            .emit("USER_JOINED", {
              currentMembers: results[results.length - 1].currentMembers,
              message
            });
          callback({ room: results[results.length - 1], message, user }, null);
        } catch (err) {
          console.log(err);
        }
      });
    });

    socket.on("JOIN", async (data, callback) => {
      socket.user_id = data.userId; // store the user id on the socket so we can tell who comes and who goes
      socket.username = data.username;
      let promises = [];
      let user = { _id: data.userId, username: data.username };

      socket.join(data.roomId, async () => {
        // update current users of this room
        let message = {
          user: { _id: data.userId, username: "VMTbot" },
          room: data.roomId,
          text: `${data.username} joined ${data.roomName}`,
          autogenerated: true,
          messageType: "JOINED_ROOM",
          timestamp: new Date().getTime()
        };
        promises.push(controllers.messages.post(message));
        promises.push(
          controllers.rooms.addCurrentUsers(data.roomId, data.userId)
        ); //
        let results;
        try {
          results = await Promise.all(promises);
          socket
            .to(data.roomId)
            .emit("USER_JOINED", {
              currentMembers: results[1].currentMembers,
              message
            });
          callback({ room: results[1], message, user }, null);
        } catch (err) {
          console.log("ERROR: ", err);
          return callback(null, err);
        }
      });
    });

    socket.on("LEAVE_ROOM", cb => {
      rooms = Object.keys(socket.rooms).slice(1);
      controllers.rooms
        .removeCurrentUsers(rooms[0], socket.user_id)
        .then(res => {
          let removedMember = {};
          if (res && res.currentMembers) {
            let currentMembers = res.currentMembers.filter(member => {
              if (socket.user_id.toString() === member._id.toString()) {
                removedMember = member;
                return false;
              }
              return true;
            });
            let message = {
              user: { _id: removedMember._id, username: "VMTBot" },
              room: rooms[0],
              text: `${removedMember.username} left the room`,
              messageType: "LEFT_ROOM",
              autogenerated: true,
              timestamp: new Date().getTime()
            };
            let releasedControl = false;
            // parse to string becayse it is an objectId
            if (
              res.controlledBy &&
              res.controlledBy.toString() === socket.user_id
            ) {
              controllers.rooms.put(rooms[0], { controlledBy: null });
              releasedControl = true;
            }
            controllers.messages.post(message);
            socket
              .to(rooms[0])
              .emit("USER_LEFT", { currentMembers, releasedControl, message });
            return cb("exited!", null);
          } else return cb("no room to leave!", null);
        })
        .catch(err => cb(null, err));
    });

    socket.on("disconnecting", () => {
      if (socket.user_id) {
        // if they joined a room and we assigned the user Id to the sokcet
        let rooms = Object.keys(socket.rooms).slice(1);
        controllers.rooms
          .get({ _id: { $in: rooms }, controlledBy: socket.user_id })
          .then(res => {
            if (res.length === 1) {
              res[0].controlledBy = null;
              res[0].save();
              let message = {
                user: { _id: socket.user_id, username: "VMTBot" },
                room: res[0]._id,
                text: `${socket.username} released control and left`,
                autogenerated: true,
                messageType: "RELEASED_CONTROL",
                timestamp: new Date().getTime()
              };
              controllers.messages.post(message);
              socket.to(res[0]._id).emit("RELEASED_CONTROL", message);
            }
          })
          .catch(err => console.log(err));
        // console.log('socket disconecting', socket.id);
        // CHECK IF THIS USER IS CONTROL OF ANY ROOM...IF THEY ARE REMOVE CONTROL @TODO
        // 1 find the user id that corresponds to this socket id
        // 2 find all the 'rooms'
        // 3 search through the rooms.controlledBy field and compare with userId
        // 4 if match set to null
      }
    });

    socket.on("disconnect", () => {
      console.log("socket disconnect");
    });

    socket.on("CHECK_SOCKET", (data, cb) => {
      let { _id, socketId } = data;

      if (!_id) {
        return;
      }
      if (socketId !== socket.id) {
        // @TODO I DONT THINK WE NEED TO SEND socketID OR DO THIS CHECK NOW THAT WE RE CONNECTING WITH SOCKETPROVIDER
        controllers.user
          .put(_id, { socketId: socket.id })
          .then(() => {
            cb("User socketId updated", null);
          })
          .catch(err => cb(null, err));
      } else {
        cb(`User socket up to date ${socket.id}`, null);
      }
    });

    socket.on("SEND_MESSAGE", (data, callback) => {
      let postData = { ...data };
      postData.user = postData.user._id;
      controllers.messages
        .post(postData)
        .then(res => {
          socket.broadcast.to(data.room).emit("RECEIVE_MESSAGE", data);
          callback("success", null);
        })
        .catch(err => {
          callback("fail", err);
        });
    });

    socket.on("TAKE_CONTROL", async (data, callback) => {
      try {
        await Promise.all([
          controllers.messages.post(data),
          controllers.rooms.put(data.room, { controlledBy: data.user._id })
        ]);
      } catch (err) {
        console.log("ERROR TAKING CONTROL: ", err);
      }
      socket.to(data.room).emit("TOOK_CONTROL", data);
      callback(null, data);
    });

    socket.on("RELEASE_CONTROL", (data, callback) => {
      controllers.messages.post(data);
      controllers.rooms.put(data.room, { controlledBy: null });
      socket.to(data.room).emit("RELEASED_CONTROL", data);
      callback(null, {});
    });

    socket.on("SEND_EVENT", async data => {
      if (typeof data.event !== "string") {
        data.event = JSON.stringify(data.event);
      }
      try {
        await controllers.tabs.put(data.tab, {
          currentState: data.currentState
        });
      } catch (err) {
        console.log("err 1: ", err);
      }
      // Don't save current state on the event
      let currentState = data.currentState;
      delete data.currentState;
      try {
        await controllers.events.post(data);
        data.currentState = currentState;
      } catch (err) {
        console.log("err 2: ", err);
      }
      socket.broadcast.to(data.room).emit("RECEIVE_EVENT", data);
    });

    socket.on("SWITCH_TAB", (data, callback) => {
      let message = {
        user: { _id: data.user._id, username: "VMTBot" },
        text: `${data.user.username} swtiched to ${data.tab.name}`,
        autogenerated: true,
        room: data.room,
        messageType: "SWITCH_TAB",
        timestamp: new Date().getTime()
      };
      controllers.messages
        .post(message)
        .then(res => {
          socket.broadcast.to(data.room).emit("RECEIVE_MESSAGE", message);
          callback({ message }, null);
        })
        .catch(err => {
          callback("fail", err);
        });
    });
  });
};
