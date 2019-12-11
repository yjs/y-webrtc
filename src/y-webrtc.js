import * as ws from 'lib0/websocket.js'
import * as map from 'lib0/map.js'
import * as error from 'lib0/error.js'
import * as random from 'lib0/random.js'
import * as encoding from 'lib0/encoding.js'
import * as decoding from 'lib0/decoding.js'
import { Observable } from 'lib0/observable.js'
import * as logging from 'lib0/logging.js'
import * as promise from 'lib0/promise.js'

import * as Y from 'yjs' // eslint-disable-line
import Peer from 'simple-peer/simplepeer.min.js'

import * as syncProtocol from 'y-protocols/sync.js'
import * as awarenessProtocol from 'y-protocols/awareness.js'

import * as cryptoutils from './crypto.js'

const log = logging.createModuleLogger('y-webrtc')

const messageSync = 0
const messageQueryAwareness = 3
const messageAwareness = 1

/**
 * @type {Map<string, SignalingConn>}
 */
const signalingConns = new Map()

/**
 * @type {Map<string,Room>}
 */
const rooms = new Map()

/**
 * @param {Room} room
 */
const checkIsSynced = room => {
  let synced = true
  room.webrtcConns.forEach(peer => {
    if (!peer.synced) {
      synced = false
    }
  })
  if ((!synced && room.synced) || (synced && !room.synced)) {
    room.synced = synced
    room.provider.emit('synced', [{ synced }])
    log('synced ', logging.BOLD, room.name, logging.UNBOLD, ' with all peers')
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
  const room = peerConn.room
  log('received message from ', logging.BOLD, peerConn.remotePeerId, logging.GREY, ' (' + room.name + ')', logging.UNBOLD, logging.UNCOLOR, ' message type: ', logging.BOLD, messageType)
  if (room === undefined) {
    return null
  }
  const provider = room.provider
  const doc = room.doc
  let sendReply = false
  switch (messageType) {
    case messageSync:
      encoding.writeVarUint(encoder, messageSync)
      const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, doc, room.provider)
      if (syncMessageType === syncProtocol.messageYjsSyncStep2 && !room.synced) {
        peerConn.synced = true
        log('synced ', logging.BOLD, room.name, logging.UNBOLD, ' with ', logging.BOLD, peerConn.remotePeerId)
        checkIsSynced(room)
      }
      if (syncMessageType === syncProtocol.messageYjsSyncStep1) {
        sendReply = true
      }
      break
    case messageQueryAwareness:
      encoding.writeVarUint(encoder, messageAwareness)
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
const sendWebrtcConn = (webrtcConn, encoder) => {
  log('send message to ', logging.BOLD, webrtcConn.remotePeerId, logging.UNBOLD, logging.GREY, ' (', webrtcConn.room.name, ')', logging.UNCOLOR)
  try {
    webrtcConn.peer.send(encoding.toUint8Array(encoder))
  } catch (e) {}
}

/**
 * @param {Room} room
 * @param {encoding.Encoder} encoder
 */
const broadcastWebrtcConn = (room, encoder) => {
  log('broadcast message in ', logging.BOLD, room.name, logging.UNBOLD)
  const m = encoding.toUint8Array(encoder)
  room.webrtcConns.forEach(conn => {
    try {
      conn.peer.send(m)
    } catch (e) {}
  })
}

export class WebrtcConn {
  /**
   * @param {SignalingConn} signalingConn
   * @param {boolean} initiator
   * @param {string} remotePeerId
   * @param {Room} room
   */
  constructor (signalingConn, initiator, remotePeerId, room) {
    log('establishing connection to ', logging.BOLD, remotePeerId)
    this.room = room
    this.remotePeerId = remotePeerId
    this.closed = false
    this.connected = false
    this.synced = false
    /**
     * @type {any}
     */
    this.peer = new Peer({ initiator })
    this.peer.on('signal', signal => {
      publishSignalingMessage(signalingConn, room, { to: remotePeerId, from: room.peerId, type: 'signal', signal })
    })
    this.peer.on('connect', () => {
      log('connected to ', logging.BOLD, remotePeerId)
      this.connected = true
      // send sync step 1
      const provider = room.provider
      const doc = provider.doc
      const awareness = provider.awareness
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, messageSync)
      syncProtocol.writeSyncStep1(encoder, doc)
      sendWebrtcConn(this, encoder)
      const awarenessStates = awareness.getStates()
      if (awarenessStates.size > 0) {
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, messageAwareness)
        encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awarenessStates.keys())))
        sendWebrtcConn(this, encoder)
      }
    })
    this.peer.on('close', () => {
      this.connected = false
      this.closed = true
      room.webrtcConns.delete(this.remotePeerId)
      checkIsSynced(room)
      this.peer.destroy()
      log('closed connection to ', logging.BOLD, remotePeerId)
    })
    this.peer.on('error', err => {
      log('error in connection to ', logging.BOLD, remotePeerId, ': ', err)
    })
    this.peer.on('data', data => {
      const answer = readPeerMessage(this, data)
      if (answer !== null) {
        sendWebrtcConn(this, answer)
      }
    })
  }
}

export class Room {
  /**
   * @param {Y.Doc} doc
   * @param {WebrtcProvider} provider
   * @param {string} name
   * @param {CryptoKey|null} key
   */
  constructor (doc, provider, name, key) {
    /**
     * Do not assume that peerId is unique. This is only meant for sending signaling messages.
     *
     * @type {string}
     */
    this.peerId = random.uuidv4()
    this.doc = doc
    this.provider = provider
    this.synced = false
    this.name = name
    this.key = key
    /**
     * @type {Map<string, WebrtcConn>}
     */
    this.webrtcConns = new Map()
  }
}

/**
 * @param {Y.Doc} doc
 * @param {WebrtcProvider} provider
 * @param {string} name
 * @param {CryptoKey|null} key
 * @return {Room}
 */
const openRoom = (doc, provider, name, key) => {
  // there must only be one room
  if (rooms.has(name)) {
    throw error.create(`A Yjs Doc connected to room "${name}" already exists!`)
  }
  const room = new Room(doc, provider, name, key)
  rooms.set(name, /** @type {Room} */ (room))
  // signal through all available signaling connections
  signalingConns.forEach(conn => {
    // only subcribe if connection is established, otherwise the conn automatically subscribes to all rooms
    if (conn.connected) {
      conn.send({ type: 'subscribe', topics: [name] })
      publishSignalingMessage(conn, room, { type: 'announce', from: room.peerId })
    }
  })
  return room
}

/**
 * @param {SignalingConn} conn
 * @param {Room} room
 * @param {any} data
 */
const publishSignalingMessage = (conn, room, data) => {
  if (room.key) {
    cryptoutils.encrypt(data, room.key).then(data => {
      conn.send({ type: 'publish', topic: room.name, data })
    })
  } else {
    conn.send({ type: 'publish', topic: room.name, data })
  }
}

export class SignalingConn extends ws.WebsocketClient {
  constructor (url) {
    super(url)
    /**
     * @type {Set<WebrtcProvider>}
     */
    this.providers = new Set()
    this.on('connect', () => {
      const topics = Array.from(rooms.keys())
      this.send({ type: 'subscribe', topics })
      rooms.forEach(room =>
        publishSignalingMessage(this, room, { type: 'announce', from: room.peerId })
      )
    })
    this.on('message', m => {
      switch (m.type) {
        case 'publish': {
          const roomName = m.topic
          const room = rooms.get(roomName)
          if (room == null || typeof roomName !== 'string') {
            return
          }
          const execMessage = data => {
            const webrtcConns = room.webrtcConns
            const peerId = room.peerId
            if (data == null || data.from === peerId || (data.to !== undefined && data.to !== peerId)) {
              return
            }
            switch (data.type) {
              case 'announce':
                map.setIfUndefined(webrtcConns, data.from, () => new WebrtcConn(this, true, data.from, room))
                break
              case 'signal':
                if (data.to === peerId) {
                  map.setIfUndefined(webrtcConns, data.from, () => new WebrtcConn(this, false, data.from, room)).peer.signal(data.signal)
                }
                break
            }
          }
          if (room.key) {
            cryptoutils.decrypt(m.data, room.key).then(execMessage)
          } else {
            execMessage(m.data)
          }
        }
      }
    })
    this.on('connect', () => log(`connected (${url})`))
    this.on('disconnect', () => log(`disconnect (${url})`))
  }
}

/**
 * @extends Observable<string>
 */
export class WebrtcProvider extends Observable {
  /**
   * @param {string} roomName
   * @param {Y.Doc} doc
   * @param {Object} [opts]
   * @param {Array<string>} [opts.signaling]
   * @param {string?} [opts.password]
   */
  constructor (roomName, doc, { signaling = ['wss://signaling.yjs.dev', 'wss://y-webrtc-uchplqjsol.now.sh', 'wss://y-webrtc-signaling-eu.herokuapp.com', 'wss://y-webrtc-signaling-us.herokuapp.com'], password = null } = {}) {
    super()
    this.roomName = roomName
    this.doc = doc
    this.signalingConns = []
    /**
     * @type {PromiseLike<CryptoKey | null>}
     */
    this.key = password ? cryptoutils.deriveKey(password, roomName) : /** @type {PromiseLike<null>} */ (promise.resolve(null))
    signaling.forEach(url => {
      const signalingConn = map.setIfUndefined(signalingConns, url, () => new SignalingConn(url))
      this.signalingConns.push(signalingConn)
      signalingConn.providers.add(this)
    })
    /**
     * @type {Room|null}
     */
    this.room = null
    this.key.then(key => {
      this.room = openRoom(doc, this, roomName, key)
    })
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
      if (this.room !== null && (origin !== this || origin === null)) {
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, messageSync)
        syncProtocol.writeUpdate(encoder, update)
        broadcastWebrtcConn(this.room, encoder)
      }
    }
    /**
     * Listens to Awareness updates and sends them to remote peers
     *
     * @param {any} changed
     * @param {any} origin
     */
    this._awarenessUpdateHandler = ({ added, updated, removed }, origin) => {
      if (this.room !== null) {
        const changedClients = added.concat(updated).concat(removed)
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, messageAwareness)
        encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients))
        broadcastWebrtcConn(this.room, encoder)
      }
    }
    this.doc.on('update', this._docUpdateHandler)
    this.awareness.on('change', this._awarenessUpdateHandler)
    window.addEventListener('beforeunload', () => {
      awarenessProtocol.removeAwarenessStates(this.awareness, [doc.clientID], 'window unload')
    })
  }
  destroy () {
    super.destroy()
    this.signalingConns.forEach(conn => {
      conn.providers.delete(this)
      if (conn.providers.size === 0) {
        conn.destroy()
        signalingConns.delete(this.roomName)
      } else {
        conn.send({ type: 'unsubscribe', topics: [this.roomName] })
      }
    })
    // need to wait for key before deleting room
    this.key.then(() => {
      rooms.delete(this.roomName)
    })
    this.doc.off('update', this._docUpdateHandler)
    this.awareness.off('change', this._awarenessUpdateHandler)
    super.destroy()
  }
}
