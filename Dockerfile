FROM mhart/alpine-node:8.7.0

RUN mkdir /conf

# python is required for node-gyp
RUN apk add --no-cache build-base python git curl

# source
COPY . /ravel-app
RUN cd /ravel-app && \
    echo "Installing packages..." && \
    npm install --no-optional && \
    npm cache clear --force && \
    node ./node_modules/gulp/bin/gulp.js build && \
    cd -

WORKDIR /ravel-app/dist
CMD ["node", "app.js"]
