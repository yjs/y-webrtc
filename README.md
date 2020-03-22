# WebRTC Connector for [Yjs](https://github.com/yjs/yjs)

It propagates document updates directly to all users via WebRTC.

* Fast message propagation
* Encryption and authorization over untrusted signaling server
* No setup required, public signaling servers are available
* Very little server load
* Not suited for a large amount of collaborators on a single document (each peer is connected to each other)

## Setup

### Install

```sh
npm i y-webrtc
```

### Client code

```js
import * as Y from 'yjs'
import { WebrtcProvider } from '../src/y-webrtc.js'

const ydoc = new Y.Doc()
// clients connected to the same room-name share document updates
const provider = new WebrtcProvider('your-room-name', ydoc, { password: 'optional-room-password' })
const yarray = ydoc.get('array', Y.Array)
```

### Signaling

The peers find each other by connecting to a signaling server. This package implements a small signaling server in `./bin/server.js`.

```sh
# start signaling server
PORT=4444 node ./bin/server.js
```

Peers using the same signaling server will find each other. You can specify several custom signaling servers like so:

```js
const provider = new WebrtcProvider('your-room-name', ydoc, { signaling: ['wss://y-webrtc-ckynwnzncc.now.sh', 'ws://localhost:4444'] })
```

### Communication Restrictions

y-webrtc is restricted by the number of peers that the web browser can create. By default, every client is connected to every other client up until the maximum number of conns is reached. The clients will still sync if every client is connected at least indirectly to every other client. Theoretically, y-webrtc allows an unlimited number of users, but at some point it can't be guaranteed anymore that the clients sync any longer**. Because we don't want to be greedy,
y-webrtc has a restriction to connect to a maximum of `20 + math.floor(random.rand() * 15)` peers. The value has a random factor in order to prevent clients to form clusters, that can't connect to other clients. The value can be adjusted using the `maxConn` option. I.e.

```js
const provider = new WebrtcProvider('your-room-name', ydoc, { maxConns: 70 + math.floor(random.rand() * 70) })
```

** A gifted mind could use this as an exercise and calculate the probability of clusters forming depending on the number of peers in the network. The default value was used to connect at least 100 clients at a conference meeting on a bad network connection.

### Use y-webrtc for conferencing solutions

Just listen to the "peers" event from the provider to listen for more incoming WebRTC connections and use the simple-peer API to share streams. More help on this would be welcome. By default, browser windows share data using BroadcastChannel without WebRTC. In order to connect all peers and browser windows with each other, set `maxConns = Number.POSITIVE_INFINITY` and `filterBcConns = true`.


### Logging

`y-webrtc` uses the `lib0/logging.js` logging library. By default this library disables logging. You can enable it by specifying the `log` environment / localStorage variable:

```js
// enable logging for all modules
localStorage.log = 'true'
// enable logging only for y-webrtc
localStorage.log = 'y-webrtc'
// by specifying a regex variables
localStorage.log = '^y.*'
```

```sh
# enable y-webrtc logging in nodejs
LOG='y-webrtc' node index.js
```

## License
Yjs is licensed under the [MIT License](./LICENSE).

<kevin.jahns@pm.me>
