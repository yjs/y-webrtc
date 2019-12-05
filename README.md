# WebRTC Connector for [Yjs](https://github.com/y-js/yjs)

It propagates document updates directly to all users via WebRTC.

* Fast message propagation
* No setup required, a default signalling server is available
* Very little server load
* Not suited for a large amount of collaborators on a single document (each peer is connected to each other)

## Setup

##### Install

```sh
npm i y-webrtc
```

##### Client code

```js
import * as Y from 'yjs'
import { WebrtcProvider } from '../src/y-webrtc.js'

const ydoc = new Y.Doc()
const provider = new WebrtcProvider('prosemirror', ydoc)
const yarray = ydoc.get('prosemirror', Y.XmlFragment)
```

##### Signalling

The peers find each other by connecting to a signalling server. This package implements a small signalling server in `./bin/server.js`.

```sh
# start signalling server
PORT=4444 node ./bin/server.js
```

Peers using the same signalling server will find each other. You can specify several custom signalling servers like so:

```js
const provider = new WebrtcProvider('prosemirror', ydoc, { signalling: ['wss://y-webrtc-ckynwnzncc.now.sh', 'ws://localhost:4444'] })
```

## License
Yjs is licensed under the [MIT License](./LICENSE).

<kevin.jahns@pm.me>
