
var SimpleWebRTC = require('simplewebrtc');

function WebRTC(room, webrtc_options){

  var swr = new SimpleWebRTC({
  debug: true
  })
  this.swr = swr;
  var self = this;

  var channel;

  swr.on('createdPeer',function(conn){

    swr.joinRoom(room, function(){
      swr.on("channelOpen", function(){
        var when_bound_to_y = function(){
          self.init({
            role : "slave",
            syncMethod : "syncAll",
            user_id : conn.id
          })
        }

        swr.on("channelMessage", function(peer, room, message){
          if(message.type === "yjs"){
            console.log(message.payload);
          }
          if(this.is_bound_to_y && message.type === "yjs"){
            this.receiveMessage(peer.id, JSON.parse(message.payload))
          }
        })
      })

    })

  })

    

}

WebRTC.prototype.send = function(uid, message){
  var peer = this.swr.webrtc.getPeers(uid)[0];
  peer.sendDirectly("simplewebrtc", "yjs", "message");
}

WebRTC.prototype.broadcast = function(message){
  this.swr.sendDirectlyToAll("simplewebrtc","yjs",message);
}

if(window != null){
  if(window.Y != null){
    window.Y.WebRTC = WebRTC;
  } else {
    // console.err("You must first include Y, and then the WebRTC Connector!")
  }
}
if(module != null){
  module.exports = WebRTC;
}

window.webrtc = new WebRTC("stuffy", {
debug: true
});
