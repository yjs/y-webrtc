
var SimpleWebRTC = require('simplewebrtc');

function WebRTC(room, webrtc_options){
  if(webrtc_options === undefined){
    webrtc_options = {};
  }

  // connect per default to our server
  if(webrtc_options.url === undefined){
    webrtc_options.url = "https://yatta.ninja:8888";
  }

  var swr = new SimpleWebRTC(webrtc_options);
  this.swr = swr;
  var self = this;

  var channel;

  swr.once('connectionReady',function(user_id){
    // SimpleWebRTC (swr) is initialized
    swr.joinRoom(room);

    swr.once('joinedRoom', function(){
      // the client joined the specified room
      var when_bound_to_y = function(){
        // when the connector is bound to Y,
        // e.g. by creating a new instance of Y,
        // initialize the connector with the required parameters.
        // You always should specify `role`, `syncMethod`, and `user_id`
        self.init({
          role : "slave",
          syncMethod : "syncAll",
          user_id : user_id
        });
        var i;
        // notify the connector class about all the users that already
        // joined the session
        for(i in self.swr.webrtc.peers){
          self.userJoined(self.swr.webrtc.peers[i].id, "slave");
        }
      };

      if(self.is_bound_to_y){
        // The connector is already bound to Y, so we can execute
        // `when_bound_to_y` immediately
        when_bound_to_y();
      } else {
        // The connector has not yet been bound to Y
        self.on_bound_to_y = when_bound_to_y;
      }

      swr.on("channelMessage", function(peer, room, message){
        // The client received a message
        // Check if the connector is already initialized,
        // only then forward the message to the connector class
        if(self.is_initialized && message.type === "yjs"){
          self.receiveMessage(peer.id, message.payload);
        }
      });
    });

    swr.on("createdPeer", function(peer){
      // a new peer/client joined the session.
      // Notify the connector class, if the connector
      // is already initialized
      if(self.is_initialized){
        // note: Since the WebRTC Connector only supports the SyncAll
        // syncmethod, every client is a slave.
        self.userJoined(peer.id, "slave");
      }
    });

    swr.on("peerStreamRemoved",function(peer){
      // a client left the session.
      // Notify the connector class, if the connector
      // is already initialized
      if(self.is_initialized){
        self.userLeft(peer.id);
      }
    });
  });
}

// Specify how to send a message to a specific user (by uid)
WebRTC.prototype.send = function(uid, message){
  var self = this;
  // we have to make sure that the message is sent under all circumstances
  var send = function(){
    // check if the clients still exists
    var peer = self.swr.webrtc.getPeers(uid)[0];
    var success;
    if(peer){
      // success is true, if the message is successfully sent
      success = peer.sendDirectly("simplewebrtc", "yjs", message);
    }
    if(!success){
      // resend the message if it didn't work
      window.setTimeout(send,500);
    }
  };
  // try to send the message
  send();
};

// specify how to broadcast a message to all users
// (it may send the message back to itself).
// The webrtc connecor tries to send it to every single clients directly
WebRTC.prototype.broadcast = function(message){
  this.swr.sendDirectlyToAll("simplewebrtc","yjs",message);
};

if(window !== undefined){
  if(window.Y !== undefined){
    window.Y.WebRTC = WebRTC;
  } else {
    console.err("You must first include Y, and then the WebRTC Connector!");
  }
}
if(module !== undefined){
  module.exports = WebRTC;
}

