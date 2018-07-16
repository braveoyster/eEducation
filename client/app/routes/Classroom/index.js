import React from 'react';
import { Button, Input, Tooltip, Spin, message } from 'antd';
import { isEqual } from 'lodash';
import axios from 'axios'
import ipcRenderer from 'electron';

import {
  APP_ID
} from '../../agora.config';
import TitleBar from '../../components/TitleBar';
import { localStorage } from '../../utils/storage'
import './index.scss';

class Classroom extends React.Component {
  constructor(props) {
    super(props);
    this.$client = props.barrel;
    this.$rtc = this.$client.rtcEngine;
    this.subscribeRTCEvents();
    this.state = {
      teacher: '',
      networkQuality: 2,
      isRecording: false,
      recordBtnLoading: false,
      teacherList: new Map(),
      studentList: new Map(),
      messageList: []
    };
    this.isSharing = false;
  }

  componentDidMount() {
    this.$client.join().then(() => {
      this.$client.initDataTunnel()
    })
    this.$client.prepareSharing()
    this.subscribeClientEvents()
  }

  componentWillUnmount() {
    this.$client.stopSharing()
    this.$client.destructSharing()
    this.$client.leave()
  }

  componentDidCatch(err, info) {
    console.error(err);
    window.location.hash = '';
  }

  addStream = (uid, info, streamId) => {
    if(info.role === 'teacher') {
      this.state.teacherList.set(uid, {
        uid, info, streamId
      })
      this.setState({
        teacherList: this.state.teacherList
      })
    } else {
      this.state.studentList.set(uid, {
        uid, info, streamId
      })
      this.setState({
        studentList: this.state.studentList
      })
    }

  }

  removeStream = (uid, role) => {
    let spliceIndex = undefined
    if(role === 'teacher') {
      this.state.teacherList.delete(uid)
      this.setState({
        teacherList: this.state.teacherList
      })
    } else {
      this.state.studentList.delete(uid)
      this.setState({
        studentList: this.state.studentList
      })
    }
  }

  subscribeClientEvents =   () => {
    this.$client.on('teacher-added', (uid, info, streamId) => {
      this.setState({
        teacher: info.username
      })
      this.addStream(uid, info, streamId)
    })
    this.$client.on('student-added', (uid, info, streamId) => {
      this.addStream(uid, info, streamId)
    })
    this.$client.on('teacher-removed', (uid) => {
      this.removeStream(uid, 'teacher')
    })
    this.$client.on('student-removed', (uid) => {
      this.removeStream(uid, 'student')
    })
    this.$client.on('sharing-start', (shareId, sharerUid) => {
      let board = document.querySelector('.board');
      if (board) {
        if(sharerUid === this.$client.uid) {
          this.$rtc.setupLocalVideoSource(board);
        } else {
          this.$rtc.subscribe(2, board);
        }
      }
    })
    this.$client.on('sharing-ended', (shareId, sharerUid) => {
      let board = document.querySelector('.board');
      if(board) {
        board.innerHTML = '';
      }
    })
    this.$client.on('channel-message', (message, uid, userInfo, ts) => {
      let temp = [...this.state.messageList]
      temp.push({
        message, uid, 
        info: userInfo, 
        ts,
        local: uid === this.$client.uid
      })
      this.setState({
        messageList: temp
      })
    })
  }

  handleExit = () => {
    this.$client.leave().then(() => {
      message.info('Left the classroom successfully!');
      window.location.hash = '';
    }).catch(err => {
      message.error('Left the classroom...');
      window.location.hash = '';
    });
  }

  handleKeyPress = e => {
    if (e.key === 'Enter') {
      this.handleSendMsg();
    }
  }

  subscribeRTCEvents = () => {
    this.$rtc.on('error', (err, msg) => {
      console.error(`RtcEngine throw an error: ${err}`);
    });
    this.$rtc.on('lastmilequality', (quality) => {
      // console.log(quality)
      this.setState({
        networkQuality: quality
      });
    });
  }

  handleSendMsg = () => {
    const msg = document.querySelector('#channelMsg').value;
    if (!msg) {
      return;
    }
    this.$client.broadcastMessage(msg);
    document.querySelector('#channelMsg').value = '';
  }

  handleShareScreen = () => {
    if (!this.isSharing) {
      this.$client.startSharing();
    } else {
      this.$client.stopSharing();
    }
    this.isSharing = !this.isSharing;
  }


  handleStartRecording = () => {
    console.log('Start Recording...');
    this.setState({
      recordBtnLoading: true
    });
    axios.post(`${SERVER_URL}/v1/recording/start`, {
      appid: APP_ID,
      channel: this.$client.channel,
      uid: this.$client.uid
    }).then(res => {
      this.setState({
        recordBtnLoading: false,
        isRecording: true
      });
    }).catch(err => {
      console.error(err);
      this.setState({
        recordBtnLoading: false
      });
    });
  }

  handleStopRecording = () => {
    console.log('Stop Recording...');
    this.setState({
      recordBtnLoading: true
    });
    axios.post(`${SERVER_URL}/v1/recording/stop`, {
      appid: APP_ID,
      channel: this.$client.channel,
      uid: this.$client.uid
    }).then(res => {
      this.setState({
        recordBtnLoading: false,
        isRecording: false
      });
    }).catch(err => {
      console.error(err);
      this.setState({
        recordBtnLoading: false
      });
    });
  }

  render() {
    // get network status
    const profile = {
      0: {
        text: 'unknown', color: '#000', bgColor: '#FFF'
      },
      1: {
        text: 'excellent', color: '', bgColor: ''
      },
      2: {
        text: 'good', color: '#7ED321', bgColor: '#B8E986'
      },
      3: {
        text: 'poor', color: '#F5A623', bgColor: '#F8E71C'
      },
      4: {
        text: 'bad', color: '#FF4D89', bgColor: '#FF9EBF'
      },
      5: {
        text: 'vbad', color: '', bgColor: ''
      },
      6: {
        text: 'down', color: '#4A90E2', bgColor: '#86D9E9'
      }
    };

    const quality = (() => {
      switch (this.state.networkQuality) {
        default:
        case 0:
          return profile[0];
        case 1:
        case 2:
          return profile[2];
        case 3:
          return profile[3];
        case 4:
        case 5:
          return profile[4];
        case 6:
          return profile[6];
      }
    })();

    const teacher = (() => {
      let result = []
      this.state.teacherList.forEach(item => {
        result.push((
          <Window 
            key={item.streamId} 
            uid={item.streamId}
            barrel={this.props.barrel}
            username={item.info.username} 
            role={item.info.role} />
        ))
      })
      return result
    })();

    const students = (() => {
      let result = []
      this.state.studentList.forEach(item => {
        result.push((
          <Window 
            key={item.streamId} 
            uid={item.streamId}
            barrel={this.props.barrel}
            username={item.info.username} 
            role={item.info.role} />
        ))
      })
      return result
    })();

    // recording Button
    let RecordingButton;
    if (this.$client.info && this.$client.info.role === 'teacher') {
      let id,
        content,
        func;
      if (this.state.isRecording) {
        id = 'recordBtn disabled';
        content = 'Stop Recording';
        func = this.handleStopRecording;
      } else {
        id = 'recordBtn';
        content = 'Start Recording';
        func = this.handleStartRecording;
      }
      RecordingButton = (
        <Button loading={this.state.recordBtnLoading} onClick={func} id={id} type="primary">{content}</Button>
      );
    }

    // screen share btn
    let ScreenSharingBtn;
    if (this.$client.info && this.$client.info.role === 'teacher') {
      ScreenSharingBtn = (
        <div onClick={this.handleShareScreen} className="btn board-bar">
          <div>
            <img src={require('../../assets/images/screen share.png')} alt="" />
          </div>
          <div>Screen Share</div>
        </div>
      );
    }

    return (
      <div className="wrapper" id="classroom">
        <header className="title">
          <div className="status-bar">
            <Tooltip title={`Network Status: ${quality.text}`}>
              <span>Network Status: {quality.text}</span>
            </Tooltip>
            <Tooltip title={`Classroom: ${this.$client.channel}`}>
              <span>Classroom: {this.$client.channel}</span>
            </Tooltip>
            <Tooltip title={
              `Teacher: ${this.state.teacher}`
            }>
              <span>
                Teacher: {
                  this.state.teacher
                }
              </span>
            </Tooltip>
          </div>

          <TitleBar>
            {RecordingButton}
            <Button className="btn" ghost icon="logout" onClick={this.handleExit} />
          </TitleBar>

        </header>
        <section className="students-container">{students}</section>
        <section className="board-container">
          <div className="board" />
          {ScreenSharingBtn}
        </section>
        <section className="teacher-container">
          {teacher}
        </section>
        <section className="channel-container">
          <div className="channel">
            <header className="channel-header">Chatroom</header>
            <MessageBox messageList={this.state.messageList} />
            <footer className="channel-input">

              <Input id="channelMsg" placeholder="Input messages..." onKeyPress={this.handleKeyPress} />

              <Button onClick={this.handleSendMsg} type="primary" id="sendBtn">Send</Button>

            </footer>
          </div>
        </section>
      </div>

    );
  }
}

class Window extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: true
    };
    this.$rtc = props.barrel.rtcEngine
  }

  shouldComponentUpdate(nextProps, nextState) {
    // always return false in temp
    if(this.state.loading = nextState.loading) {
      return false
    }
    return true
  }

  componentDidMount() {
    const dom = document.querySelector(`#video-${this.props.uid}`);
    if (this.props.uid === this.props.barrel.uid) {
      // local stream
      console.log(`Setup local: ${this.props.uid}`);
      this.$rtc.setupLocalVideo(dom);
    } else {
      // remote stream
      console.log(`Setup remote: ${this.props.uid}`);
      this.$rtc.subscribe(this.props.uid, dom);
    }

    let name = this.props.uid;
    name = this.props.uid === this.$rtc.uid ? 'local' : name;
    
    /**
     * Warning. Here we assume sharing streamID to be 2
     */
    name = this.props.uid === 2 ? 'videosource' : name;

    const render = this.$rtc.streams[name];
    if (render) {
      if (render.firstFrameRender) {
        this.setState({ loading: false });
      } else {
        render.event.on('ready', () => {
          this.setState({ loading: false });
        });
      }
    }
  }

  render() {
    const loaderClass = this.state.loading ? 'loader loading' : 'loader';
    if (this.props.role === 'teacher') {
      return (
        <div className="teacher-window">
          <div className="teacher-video" id={`video-${this.props.uid}`}>
            <Spin className={loaderClass} />
          </div>
          <div className="teacher-bar">Teacher: {this.props.username}</div>
        </div>
      );
    } else if (this.props.role === 'student') {
      return (
        <div className="student-window">
          <div className="student-video" id={`video-${this.props.uid}`}>
            <Spin className={loaderClass} />
          </div>
          <div className="student-bar">{this.props.username}</div>
        </div>
      );
    }
  }
}


class MessageBox extends React.Component {
  componentDidUpdate() {
    const box = document.querySelector('.channel-box');
    box.scrollTop = box.scrollHeight - box.clientHeight;
  }

  render() {
    const messages = this.props.messageList.map(item => (
      <MessageItem 
        key={item.ts} 
        message={item.message}
        username={item.info.username}
        role={item.info.role}
        local={item.local} />
    ));

    return (
      <section className="channel-box">
        {messages}
      </section>
    );
  }
}

function MessageItem(props) {
  const align = props.local ? 'right' : 'left';
  return (
    <div className={`message-item ${align}`}>
      <div className="arrow" style={{ float: align }} />
      <div className="message-content" style={{ textAlign: align, float: align }}>
        {props.message}
      </div>
      <div className="message-sender" style={{ textAlign: align }}>{props.username}</div>
    </div>
  );
}

export default Classroom;
