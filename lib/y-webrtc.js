
var SimpleWebRTC = require('simplewebrtc');

function WebRTC(room, webrtc_options){
  if(webrtc_options === undefined){
    webrtc_options = {}
  }

  if(webrtc_options.url === undefined){
    webrtc_options.url = "http://yatta.ninja:8888"
  }

  var swr = new SimpleWebRTC(webrtc_options);
  this.swr = swr;
  var self = this;

  var channel;

  swr.once('connectionReady',function(user_id){
    swr.joinRoom(room)

    swr.once('joinedRoom', function(){
      swr.once('')
      var when_bound_to_y = function(){
        self.init({
          role : "slave",
          syncMethod : "syncAll",
          user_id : user_id
        });
        for(i in self.swr.webrtc.peers){
          self.userJoined(self.swr.webrtc.peers[i].id, "slave");
        }
      };

      if(self.is_bound_to_y !== undefined && self.is_bound_to_y){
        when_bound_to_y()
      } else {
        self.on_bound_to_y = when_bound_to_y;
      }

      swr.on("channelMessage", function(peer, room, message){
        if(self.is_bound_to_y && message.type === "yjs"){
          self.receiveMessage(peer.id, message.payload);
        }
      });
    });
    swr.on("createdPeer", function(peer){
      if(self.is_initialized){
        self.userJoined(peer.id, "slave");
      }
    });
    swr.on("peerStreamRemoved",function(peer){
      if(self.is_initialized){
        self.userLeft(peer.id);
      }
    })
  })
}

WebRTC.prototype.send = function(uid, message){
  var self = this;
  var send = function(){
    var peer = self.swr.webrtc.getPeers(uid)[0];
    if(peer){
      var success = peer.sendDirectly("simplewebrtc", "yjs", message);
    }
    if(!success){
      window.setTimeout(send,500)
    }
  }
  send()
};

WebRTC.prototype.broadcast = function(message){
  this.swr.sendDirectlyToAll("simplewebrtc","yjs",message);
};

if(window !== undefined){
  if(window.Y !== undefined){
    window.Y.WebRTC = WebRTC;
  } else {
    // console.err("You must first include Y, and then the WebRTC Connector!")
  }
}
if(module !== undefined){
  module.exports = WebRTC;
}

