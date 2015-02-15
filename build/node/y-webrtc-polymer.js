var WebRTC = require('./y-webrtc');

new Polymer('y-webrtc',{
  ready: function(){
    this.is_initialized = false;
    this.initialize();
  },
  initialize: function(){
    if(!this.is_initialized && this.room !== undefined){
      this.is_initialized = true;
      this.connector = new WebRTC(this.room);
      if(this.debug !== undefined){
        this.connector.debug = this.debug;
      }
    }
  },
  roomChanged: function(){
    this.initialize();
  }
});
