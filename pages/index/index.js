// index.js
// 获取应用实例
const app = getApp()
Page({
  data: {
    nickname: '',
  },

  // 事件处理函数
  inputNameEvent: function(event) {
    this.setData({
      nickname: event.detail.value,
    })
  },

  enterRoom: function(event) {
    if (!this.data.nickname) {
      return
    }
    app.globalData.nickname = this.data.nickname

    app.globalData.socket.emit('connect_v2', {'appkey': this.data.nickname, 'customid': 'userid'})
  },

  onLoad: function() {
    const that = this
    this.onSocketEvent()
  },

  onSocketEvent: function() {
    const socket = app.globalData.socket

    socket.on('connack', function (msg) {
      if (msg['success'] = 'true') {
        wx.showToast({
          title: '登录成功',
          icon: 'success',
          duration: 1000
        })

        wx.navigateTo({
          url: '../room/index',
        })
      } else {
        wx.showToast({
          title: 'appkey 错误',
          duration: 1000
        })
      }
    })
  }
})
