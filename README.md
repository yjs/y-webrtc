# yjs webrtc on nodejs

This project is a demo running a yjs webrtc peer on nodejs via Docker using [node-webrtc](https://github.com/node-webrtc/node-webrtc).

## Setting up

- Make sure you have Docker installed on your computer
- Clone the repository and build the docker container by running
```sh
docker build --platform linux/amd64 -t yjswebrtc-node .
```
Replace *yjswebrtc-node* with any name of your choosing.

- Then run the docker container using 
```sh
docker run --platform linux/amd64 -it yjswebrtc-node
```
Again, replacing *yjswebrtc-node* with the name you chosed previously.

You should get an output such as
```sh
Listening on port 3000
synced! { synced: true }
yText 
```
... then the app is working properly!

## Shenanigans

y-webrtc relies on the websockets module in [`lib0`](https://github.com/dmonad/lib0) module which itself depends on `WebSocket` support. 
However, Node does not natively support WebSocket so I ended up publishing a separate version of the module [`lib0-server-ws`](https://www.npmjs.com/package/lib0-server-ws) which includes `WebSocket` from [`ws`](https://www.npmjs.com/package/ws).