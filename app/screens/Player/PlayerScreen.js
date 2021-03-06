import React from 'react'
import PropTypes from 'prop-types'
import {
  StatusBar,
  StyleSheet,
  ActivityIndicator,
  View,
} from 'react-native'
import RNFS from 'react-native-fs'
import GoogleCast, { CastButton } from 'react-native-google-cast'
import StaticServer from 'react-native-static-server'
import TorrentStreamer from 'react-native-torrent-streamer'
import { utils } from 'popcorn-sdk'
import Orientation from 'react-native-orientation'

import i18n from 'modules/i18n'

import Typography from 'components/Typography'
import Button from 'components/Button'

import VideoAndControls from './VideoAndControls'

export default class VideoPlayer extends React.Component {

  static propTypes = {
    navigation: PropTypes.object.isRequired,
  }

  staticServer = null

  serverUrl = null

  serverDirectory = null

  constructor(props) {
    super(props)

    this.serverDirectory = RNFS.CachesDirectoryPath

    TorrentStreamer.setup(this.serverDirectory, false)
    this.staticServer = new StaticServer(0, this.serverDirectory, { keepAlive: true })

    const { navigation: { state: { params: { item } } } } = props

    this.state = {
      item,
      duration   : 0.0,
      currentTime: 0.0,
      paused     : false,
      loading    : true,
      casting    : false,

      progress     : 0,
      buffer       : 0,
      downloadSpeed: 0,
      doneBuffering: false,
      seeds        : 0,

      loadedMagnet: null,
    }
  }

  componentDidMount() {
    const { navigation: { state: { params: { magnet } } } } = this.props

    GoogleCast.EventEmitter.addListener(GoogleCast.MEDIA_STATUS_UPDATED, this.handleCastMediaUpdate)
    GoogleCast.EventEmitter.addListener(GoogleCast.SESSION_STARTED, this.handleCastSessionStarted)
    GoogleCast.EventEmitter.addListener(GoogleCast.SESSION_ENDED, this.handleCastSessionEnded)

    TorrentStreamer.addEventListener('error', this.handleTorrentError)
    TorrentStreamer.addEventListener('status', this.handleTorrentStatus)
    TorrentStreamer.addEventListener('ready', this.handleTorrentReady)

    // Start
    TorrentStreamer.start(magnet.url)
  }

  playItem = (magnet = null, url = null, item = null) => {
    const { navigation: { state: { params: { magnet: propsMagnet, item: propsItem } } } } = this.props

    this.setState({
      item         : item || propsItem,
      url          : url,
      buffer       : 0,
      doneBuffering: false,
      loading      : true,
      loadedMagnet : magnet || propsMagnet,
    }, () => {
      TorrentStreamer.start(magnet.url)
    })
  }

  componentWillUnmount() {
    Orientation.lockToPortrait()

    GoogleCast.EventEmitter.removeAllListeners(GoogleCast.MEDIA_STATUS_UPDATED)
    GoogleCast.EventEmitter.removeAllListeners(GoogleCast.SESSION_STARTED)
    GoogleCast.EventEmitter.removeAllListeners(GoogleCast.SESSION_ENDED)

    TorrentStreamer.removeEventListener('error', this.handleTorrentError)
    TorrentStreamer.removeEventListener('status', this.handleTorrentStatus)
    TorrentStreamer.removeEventListener('ready', this.handleTorrentReady)

    TorrentStreamer.stop()

    this.staticServer.kill()
  }


  handleCastSessionStarted = () => {
    const { url, doneBuffering } = this.state

    if (doneBuffering) {
      this.startCasting(url)
    }
  }

  handleCastMediaUpdate = ({ mediaStatus, ...rest }) => {
    if (mediaStatus.streamPosition > 0) {
      this.setState({
        currentTime: mediaStatus.streamPosition,
      })
    }
  }

  handleCastSessionEnded = () => {
    this.setState({
      paused : false,
      casting: false,
    })
  }

  handleTorrentStatus = (status) => {
    const { buffer, progress } = this.state

    const nProgress = parseFloat(status.progress)

    if (status.buffer !== buffer || (nProgress > (progress + 1)) || nProgress > 99) {
      this.setState({
        ...status,
        progress     : nProgress > 99 ? 100 : nProgress,
        downloadSpeed: utils.formatKbToString(status.downloadSpeed),
        doneBuffering: status.buffer === '100',
      })
    }
  }

  handleTorrentReady = async(data) => {
    const castState = await GoogleCast.getCastState()

    if (castState.toLowerCase() === 'connected') {
      await this.startCasting(data.url)

    } else {
      this.setState({
        url          : data.url,
        buffer       : '100',
        doneBuffering: true,
        loading      : false,
      })
    }
  }

  handleTorrentError = (e) => {
    // eslint-disable-next-line no-console
    console.log('error', e)
  }

  showCastingControls = () => {
    GoogleCast.launchExpandedControls()
  }

  startCasting = async(url) => {
    const { navigation: { state: { params: { item } } } } = this.props
    // const { currentTime } = this.state

    if (!this.serverUrl) {
      this.serverUrl = await this.staticServer.start()
    }

    GoogleCast.castMedia({
      title   : item.title,
      subtitle: item.summary,
      // studio: video.studio,
      // duration: video.duration,

      // playPosition: currentTime,

      mediaUrl: this.serverUrl + url.replace(this.serverDirectory, ''),

      imageUrl : item.images.fanart.high,
      posterUrl: item.images.poster.high,
    })

    this.setState({
      url,
      buffer       : '100',
      doneBuffering: true,
      loading      : false,
      casting      : true,
    }, () => {
      this.showCastingControls()
    })
  }

  getItemTitle = () => {
    const { item } = this.state

    if (item.showTitle) {
      return `${item.showTitle} - ${item.episode}. ${item.title}`
    }

    return item.title
  }

  renderAdditionalControls = () => {
    const { progress, downloadSpeed, seeds } = this.state

    return (
      <React.Fragment>
        <View style={styles.castButton} pointerEvents={'box-none'}>
          <CastButton style={{ width: 30, height: 30, tintColor: 'white' }} />
        </View>

        <View style={styles.stats}>
          {progress !== 100 && (
            <React.Fragment>
              <View style={styles.statItem}>
                <Typography>{i18n.t('progress')}</Typography>
                <Typography>{progress.toFixed(2)}</Typography>
              </View>

              <View style={styles.statItem}>
                <Typography>{i18n.t('speed')}</Typography>
                <Typography>{downloadSpeed.toString()}</Typography>
              </View>

              <View style={styles.statItem}>
                <Typography>{i18n.t('seeds')}</Typography>
                <Typography>{seeds.toString()}</Typography>
              </View>
            </React.Fragment>
          )}

          {progress === 100 && (
            <Typography>
              {i18n.t('complete')}
            </Typography>
          )}
        </View>
      </React.Fragment>
    )
  }

  render() {
    const { url, casting, paused, loading, showControls, item } = this.state
    const { doneBuffering, buffer, downloadSpeed } = this.state

    return (
      <View style={styles.container}>

        <StatusBar hidden={!paused && !casting && doneBuffering} animated />

        {(loading || casting) && (
          <View style={[styles.fullScreen, styles.loadingContainer]}>

            {loading && (
              <ActivityIndicator size={60} color={'#FFF'} />
            )}

            <Typography
              style={{ marginTop: 10, marginBottom: 20 }}
              variant={'title'}>
              {this.getItemTitle()}
            </Typography>

            {loading || casting && (
              <Button
                variant={'primary'}
                onPress={this.showCastingControls}>
                {i18n.t('Controls')}
              </Button>
            )}

            {buffer !== 0 && !doneBuffering && (
              <React.Fragment>
                <Typography style={{ marginTop: 10 }}>
                  {i18n.t('Buffering')}
                </Typography>

                <Typography variant={'body2'} style={{ marginTop: 5 }}>
                  {buffer}% / {downloadSpeed}
                </Typography>
              </React.Fragment>
            )}

            {buffer === 0 && (
              <Typography style={{ marginTop: 10 }}>
                {i18n.t('Connecting')}
              </Typography>
            )}

          </View>
        )}

        {!loading && !casting && (
          <React.Fragment>

            <VideoAndControls
              item={item}
              url={url}
              toggleControls={this.toggleControls}
              toggleControlsOff={this.toggleControlsOff}
              playItem={this.playItem}
              showControls={showControls}>

              {this.renderAdditionalControls()}

            </VideoAndControls>

          </React.Fragment>
        )}

        {casting && this.renderAdditionalControls()}

      </View>
    )
  }
}

const styles = StyleSheet.create({

  container: {
    flex           : 1,
    backgroundColor: 'black',
  },

  fullScreen: {
    position: 'absolute',
    top     : 0,
    left    : 0,
    bottom  : 0,
    right   : 0,
  },

  loadingContainer: {
    flex          : 1,
    justifyContent: 'center',
    alignItems    : 'center',
  },

  slider: {
    position: 'absolute',
    bottom  : 24,
    width   : '100%',
  },

  castButton: {
    position: 'absolute',
    right   : 24,
    top     : 24,
    width   : 30,
    height  : 30,

    zIndex: 1001,
  },

  stats: {
    display       : 'flex',
    flexDirection : 'row',
    justifyContent: 'space-between',

    position: 'absolute',
    bottom  : 24,
    left    : 16,
    right   : 16,
  },

  statItem: {
    width     : 120,
    alignItems: 'center',
    zIndex    : 1001,
  },

})
