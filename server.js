/* eslint-env browser */

import express from "express";
import * as Y from 'yjs'
import { WebrtcProvider } from './src/y-webrtc.js'

const app = express();

const ydoc = new Y.Doc()
const provider = new WebrtcProvider('kpmsknMCitim2Re65HhGqA', ydoc, { signaling: ['wss://yjs-signaling-server-5fb6d64b3314.herokuapp.com'] })
const yarray = ydoc.getArray()

provider.on('synced', synced => {
  // NOTE: This is only called when a different browser connects to this client
  // Windows of the same browser communicate directly with each other
  // Although this behavior might be subject to change.
  // It is better not to expect a synced event when using y-webrtc
  console.log('synced!', synced)
  const yText = ydoc.getText("codemirror")

  provider.awareness.setLocalStateField("user", {
    name: "Anonymous" + Math.floor(Math.random() * 1000)
  })
  console.log("yText", yText.toString());
  ydoc.on("update", (u, s, ydoc2, _) => {
    console.log(ydoc2.getText("codemirror").toDelta());
  })
})


yarray.observeDeep(() => {
  console.log('yarray updated: ', yarray.toJSON())
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log("Listening on port", PORT));