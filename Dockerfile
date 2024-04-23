# syntax=docker/dockerfile:1

# Comments are provided throughout this file to help you get started.
# If you need more help, visit the Dockerfile reference guide at
# https://docs.docker.com/go/dockerfile-reference/

# Want to help us make this template better? Share your feedback here: https://forms.gle/ybq9Krt8jtBL3iCk7

ARG NODE_VERSION=21.7.1

# FROM node:${NODE_VERSION}-alpine
FROM node:18-slim

# Use production node environment by default.
ENV NODE_ENV production

WORKDIR /usr/src/app

USER root

# Copy the rest of the source files into the image.
COPY . .

RUN npm install
RUN npm i -g @mapbox/node-pre-gyp
RUN npm i wrtc

# Expose the port that the application listens on.
# EXPOSE 8000

CMD node server.js