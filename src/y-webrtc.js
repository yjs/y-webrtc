import * as ws from 'lib0/websocket.js'
import * as map from 'lib0/map.js'
import * as error from 'lib0/error.js'
import * as random from 'lib0/random.js'
import * as encoding from 'lib0/encoding.js'
import * as decoding from 'lib0/decoding.js'
import { Observable } from 'lib0/observable.js'
import * as Y from 'yjs' // eslint-disable-line
import Peer from 'simple-peer/simplepeer.min.js'

import * as syncProtocol from 'y-protocols/sync.js'
import * as awarenessProtocol from 'y-protocols/awareness.js'

const messageSync = 0
const messageQueryAwareness = 3
const messageAwareness = 1

const peerId = random.uuidv4()

/**
 * @type {Map<string, SignallingConn>}
 */
const signallingConns = new Map()
/**
 * @type {Map<string, WebrtcConn>}
 */
const webrtcConns = new Map()

/**
 * @type {Map<string,WebrtcRoom>}
 */
const webrtcRooms = new Map()

/**
 * @param {WebrtcRoom} webrtcRoom
 */
const checkIsSynced = webrtcRoom => {
  let synced = true
  webrtcRoom.peers.forEach(peer => {
    if (!peer.syncedRooms.has(webrtcRoom.name)) {
      synced = false
    }
  })
  if ((!synced && webrtcRoom.synced) || (synced && !webrtcRoom.synced)) {
    webrtcRoom.synced = synced
    webrtcRoom.provider.emit('synced', [{ synced }])
  }
}

/**
 * @param {WebrtcConn} peerConn
 * @param {Uint8Array} buf
 * @return {encoding.Encoder?}
 */
const readPeerMessage = (peerConn, buf) => {
  const decoder = decoding.createDecoder(buf)
  const encoder = encoding.createEncoder()
  const messageType = decoding.readVarUint(decoder)
  const roomName = decoding.readVarString(decoder)
  const webrtcRoom = webrtcRooms.get(roomName)
  if (webrtcRoom === undefined) {
    return null
  }
  const provider = webrtcRoom.provider
  const doc = webrtcRoom.doc
  let sendReply = false
  switch (messageType) {
    case messageSync:
      encoding.writeVarUint(encoder, messageSync)
      encoding.writeVarString(encoder, roomName)
      const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, doc, webrtcRoom.provider)
      if (syncMessageType === syncProtocol.messageYjsSyncStep2 && !webrtcRoom.synced) {
        peerConn.syncedRooms.add(roomName)
        checkIsSynced(webrtcRoom)
      }
      if (syncMessageType === syncProtocol.messageYjsSyncStep1) {
        sendReply = true
      }
      break
    case messageQueryAwareness:
      encoding.writeVarUint(encoder, messageAwareness)
      encoding.writeVarString(encoder, roomName)
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(provider.awareness, Array.from(provider.awareness.getStates().keys())))
      sendReply = true
      break
    case messageAwareness:
      awarenessProtocol.applyAwarenessUpdate(provider.awareness, decoding.readVarUint8Array(decoder), provider)
      break
    default:
      console.error('Unable to compute message')
      return encoder
  }
  if (!sendReply) {
    // nothing has been written, no answer created
    return null
  }
  return encoder
}

/**
 * @param {WebrtcConn} webrtcConn
 * @param {encoding.Encoder} encoder
 */
const send = (webrtcConn, encoder) => {
  webrtcConn.peer.send(encoding.toUint8Array(encoder))
}

/**
 * @param {WebrtcRoom} webrtcRoom
 * @param {encoding.Encoder} encoder
 */
const broadcast = (webrtcRoom, encoder) => {
  const m = encoding.toUint8Array(encoder)
  webrtcRoom.peers.forEach(peer => peer.peer.send(m))
}

export class WebrtcConn {
  /**
   * @param {SignallingConn} signalingConn
   * @param {boolean} initiator
   * @param {string} remotePeerId
   * @param {Array<string>} announcedTopics
   */
  constructor (signalingConn, initiator, remotePeerId, announcedTopics) {
    this.remotePeerId = remotePeerId
    this.closed = false
    this.connected = false
    /**
     * @type {Set<string>}
     */
    this.syncedRooms = new Set()
    /**
     * @type {any}
     */
    this.peer = new Peer({ initiator })
    this.peer.on('signal', data => {
      signalingConn.send({ type: 'publish', topics: announcedTopics, to: remotePeerId, from: peerId, messageType: 'signal', data })
    })
    this.peer.on('connect', () => {
      this.connected = true
      announcedTopics.forEach(roomName => {
        const room = webrtcRooms.get(roomName)
        if (room) {
          // add peer to room
          room.peers.add(this)
          // send sync step 1
          const provider = room.provider
          const doc = provider.doc
          const awareness = provider.awareness
          const encoder = encoding.createEncoder()
          encoding.writeVarUint(encoder, messageSync)
          encoding.writeVarString(encoder, room.name)
          syncProtocol.writeSyncStep1(encoder, doc)
          send(this, encoder)
          const awarenessStates = awareness.getStates()
          if (awarenessStates.size > 0) {
            const encoder = encoding.createEncoder()
            encoding.writeVarUint(encoder, messageAwareness)
            encoding.writeVarString(encoder, room.name)
            encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awarenessStates.keys())))
            send(this, encoder)
          }
        }
      })
    })
    this.peer.on('close', () => {
      this.connected = false
      this.closed = true
      webrtcConns.delete(this.remotePeerId)
      webrtcRooms.forEach(room => {
        room.peers.delete(this)
        checkIsSynced(room)
      })
      this.peer.destroy()
    })
    this.peer.on('error', () => {
      this.connected = false
      this.closed = true
    })
    this.peer.on('data', data => {
      const answer = readPeerMessage(this, data)
      if (answer !== null) {
        send(this, answer)
      }
    })
  }
}

export class WebrtcRoom {
  /**
   * @param {Y.Doc} doc
   * @param {WebrtcProvider} provider
   * @param {string} name
   */
  constructor (doc, provider, name) {
    /**
     * @type {Set<WebrtcConn>}
     */
    this.peers = new Set()
    this.doc = doc
    this.provider = provider
    this.synced = false
    this.name = name
  }
}

export class SignallingConn extends ws.WebsocketClient {
  constructor (url) {
    super(url)
    /**
     * @type {Set<WebrtcProvider>}
     */
    this.providers = new Set()
    this.afterOpen.push(() => ({ type: 'subscribe', topics: Array.from(webrtcRooms.keys()) }))
    this.afterOpen.push(() => ({ type: 'publish', messageType: 'announce', topics: Array.from(webrtcRooms.keys()), from: peerId }))
    this.on('message', m => {
      if (m.from === peerId || (m.to !== undefined && m.to !== peerId)) {
        return
      }
      switch (m.type) {
        case 'publish': {
          switch (m.messageType) {
            case 'announce':
              map.setIfUndefined(webrtcConns, m.from, () => new WebrtcConn(this, true, m.from, m.topics))
              break
            case 'signal':
              if (m.to === peerId) {
                map.setIfUndefined(webrtcConns, m.from, () => new WebrtcConn(this, false, m.from, m.topics)).peer.signal(m.data)
              }
              break
          }
        }
      }
    })
  }
  /**
   * @param {Array<string>} rooms
   */
  subscribe (rooms) {
    // only subcribe if connection is established, otherwise the conn automatically subscribes to all webrtcRooms
    if (this.connected) {
      this.send({ type: 'subscribe', topics: rooms })
      this.send({ type: 'publish', messageType: 'announce', topics: Array.from(webrtcRooms.keys()), from: peerId })
    }
  }
}

/**
 * @extends Observable<string>
 */
export class WebrtcProvider extends Observable {
  /**
   * @param {string} room
   * @param {Y.Doc} doc
   * @param {Object} [opts]
   * @param {Array<string>} [opts.signalling]
   */
  constructor (room, doc, { signalling = ['wss://y-webrtc-hrxsloqrim.now.sh'] } = {}) {
    super()
    this.room = room
    this.doc = doc
    this.signallingConns = []
    signalling.forEach(url => {
      const signallingConn = map.setIfUndefined(signallingConns, url, () => new SignallingConn(url))
      this.signallingConns.push(signallingConn)
      signallingConn.providers.add(this)
      signallingConn.subscribe([this.room])
    })
    if (webrtcRooms.has(room)) {
      throw error.create('A Yjs Doc connected to that room already exists!')
    }
    const webrtcRoom = new WebrtcRoom(doc, this, room)
    webrtcRooms.set(room, webrtcRoom)
    /**
     * @type {awarenessProtocol.Awareness}
     */
    this.awareness = new awarenessProtocol.Awareness(doc)
    /**
     * Listens to Yjs updates and sends them to remote peers
     *
     * @param {Uint8Array} update
     * @param {any} origin
     */
    this._docUpdateHandler = (update, origin) => {
      if (origin !== this || origin === null) {
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, messageSync)
        encoding.writeVarString(encoder, room)
        syncProtocol.writeUpdate(encoder, update)
        broadcast(webrtcRoom, encoder)
      }
    }
    /**
     * Listens to Awareness updates and sends them to remote peers
     *
     * @param {any} changed
     * @param {any} origin
     */
    this._awarenessUpdateHandler = ({ added, updated, removed }, origin) => {
      const changedClients = added.concat(updated).concat(removed)
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, messageAwareness)
      encoding.writeVarString(encoder, room)
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients))
      broadcast(webrtcRoom, encoder)
    }
    this.doc.on('update', this._docUpdateHandler)
    this.awareness.on('change', this._awarenessUpdateHandler)
    window.addEventListener('beforeunload', () => {
      awarenessProtocol.removeAwarenessStates(this.awareness, [doc.clientID], 'window unload')
    })
  }
  destroy () {
    this.signallingConns.forEach(conn => {
      conn.providers.delete(this)
      if (conn.providers.size === 0) {
        conn.destroy()
        signallingConns.delete(this.room)
      } else {
        conn.send({ type: 'unsubscribe', topics: [this.room] })
      }
    })
    webrtcRooms.delete(this.room)
    this.doc.off('update', this._docUpdateHandler)
    this.awareness.off('change', this._awarenessUpdateHandler)
    super.destroy()
  }
}
