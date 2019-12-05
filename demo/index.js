/* eslint-env browser */

import * as Y from 'yjs'
import { WebrtcProvider } from '../src/y-webrtc.js'

const ydoc = new Y.Doc()
const provider = new WebrtcProvider('prosemirror', ydoc)
const yarray = ydoc.get('prosemirror', Y.XmlFragment)

provider.on('synced', synced => {
  console.log('synced!', synced)
})

yarray.observeDeep(() => {
  console.log('yarray updated: ', yarray.toJSON())
})

// @ts-ignore
window.example = { provider, ydoc, yarray }
