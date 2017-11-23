// index.js
// 获取应用实例
const app = getApp()
Page({
  data: {
    scrollTop: 100,
    messages: '',
    currentMsg: '',
    subTopic: '',
    pubTopic: ''
  },

  typeMessageEvent: function(e) {
    this.setData({
      currentMsg: e.detail.value
    })
  },

  typePubTopic: function (e) {
    this.setData({
      pubTopic: e.detail.value
    })
  },

  typeSubTopic: function(e) {
    this.setData({
      subTopic: e.detail.value
    })
  },

  sendMsg: function(e) {
    const currentMsg = this.data.currentMsg

    if (!currentMsg) {
      return
    }

    this.setData({
      messages: this.data.messages + '\n' + 'publishing' + ': ' +currentMsg
    })

    this.setData({
      currentMsg: ''
    })

    app.globalData.socket.emit('publish', {'topic': currentMsg, 'msg': 'hello, Yunba', 'qos': 1})
  },

  Subscribe: function(e) {
    const subTopic = this.data.subTopic

    if (!subTopic) {
      return
    }

    this.setData({
      messages: this.data.messages + '\n' + 'Subcribing' + ': ' +subTopic
    })

    this.setData({
      subTopic: ''
    })

    app.globalData.socket.emit('subscribe', {'topic': subTopic})
  },

  onLoad: function() {
    const that = this
    this.onSocketEvent()
  },

  onSocketEvent: function() {
    const socket = app.globalData.socket
    const self = this
    
    socket.on('suback', function(msg) {
      console.log('=============suback', msg)
      if (msg['success'] = 'true') {
        wx.showToast({
          title: '订阅成功！',
          icon: 'success',
          duration: 1000
        })
      }
    })

    socket.on('puback', function (msg) {
      if (msg['success'] = 'true') {
        wx.showToast({
          title: '订阅成功！',
          icon: 'success',
          duration: 1000
        })
      } else {
        wx.showToast({
          title: '订阅失败',
          duration: 1000
        })
      }
    })

    socket.on('message', function (msg) {
      self.setData({
        messages: self.data.messages + '\n' + msg['topic'] + ': ' + msg['msg']
      })
    })
  }
})
