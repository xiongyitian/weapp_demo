import io from './wxsocket.io/index'
// import * as Yunba from './wxsocket.io/-'
console.log('io ---> ' ,io)
// app.js
App({
  onLaunch: function() {
    // create a new socket object
    const socket = io("wss://abj-rest-fc1.yunba.io:3003/")
    this.globalData.socket = socket
  },

  globalData:{
  },
})
