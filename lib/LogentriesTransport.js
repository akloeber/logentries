'use strict';

var net = require('net');
var tls = require('tls');

var CONNECTING_PHASE = {
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED'
};

var CLOSING_PHASE = {
  CLOSING: 'CLOSING',
  CLOSED: 'CLOSED'
};

var DEFAULT_LE_HOST = 'api.logentries.com';
var DEFAULT_LE_PORT = 10000;
var DEFAULT_LE_PORT_SECURE = 20000;

function createLogLine(item, opts) {
  var logLine = opts.token;
  if (opts.usequotes) {
    logLine += '"' + item.join('" "') + '"\n';
  } else {
    logLine += item.join(' ') + '\n';
  }

  return logLine;
}

function LogentriesTransport(opts, logger) {
  var queue = [];
  var socket = null;

  var connectingPhase = null;
  var closingPhase = null;

  function processItemsInQueue() {
    while (queue.length > 0) {
      var item = queue.shift();

      var logLine = createLogLine(item, opts);

      try {
        logger.emit('log', logLine);
        socket.write(logLine);
      } catch (e) {
        logger.emit('error', e);
        queue.unshift(item);

        closeSocket();
        connectingPhase = CONNECTING_PHASE.DISCONNECTED;
        break;
      }
    }
  }

  function closeSocket() {
    if (socket) {
      try {
        socket.end();
      } catch (e) {
        logger.emit('error', e);
      }
      socket = null;
    }
  }


  function connect() {

    function handleConnection() {
      connectingPhase = CONNECTING_PHASE.CONNECTED;

      processItemsInQueue();

      if (closingPhase) {
        closeSocket();
        closingPhase = CLOSING_PHASE.CLOSED;
      }
    }

    function handleClose() {
      closeSocket();
      connectingPhase = CONNECTING_PHASE.DISCONNECTED;
    }

    function handleError(e) {
      logger.emit('error', e);

      closeSocket();
      connectingPhase = CONNECTING_PHASE.DISCONNECTED;
    }

    function handleSecureConnection() {
      if (!socket.authorized) {
        /*
         * We need to check this as the tls module will accept all
         * certs by default. Nobody likes a man in the middle attack.
         */
        handleError(new Error(socket.authorizationError));
      } else {
        handleConnection();
      }
    }

    connectingPhase = CONNECTING_PHASE.CONNECTING;

    var options = {
      host: opts.host || DEFAULT_LE_HOST,
      port: opts.port || (opts.secure ? DEFAULT_LE_PORT_SECURE : DEFAULT_LE_PORT),
      token: opts.token
    };

    logger.emit('connect', options);

    if (opts.secure) {
      socket = tls.connect(options.port, options.host, handleSecureConnection);
    } else {
      socket = net.createConnection(options.port, options.host);
    }

    socket.on('connect', handleConnection);
    socket.on('error', handleError);
    socket.on('close', handleClose);
  }

  /**
   * Public API
   */

  this.consume = function(items) {
    if (closingPhase) {
      throw new Error('Transport is already closed');
    }

    queue.push(items);

    if (connectingPhase === CONNECTING_PHASE.CONNECTED) {
      processItemsInQueue();
    } else {
      // trigger connect if necessary
      if (connectingPhase !== CONNECTING_PHASE.CONNECTING) {
        connect();
      }
    }
  };

  this.end = function() {
    if (socket) {
      closingPhase = CLOSING_PHASE.CLOSING;

      if (queue.length > 0) {
        // there is data pending
        if (connectingPhase === CONNECTING_PHASE.CONNECTING) {
          console.log('end while still connecting and data pending');
          // await connection establishment
        } else {
          processItemsInQueue();

          closeSocket();
          closingPhase = CLOSING_PHASE.CLOSED;
        }
      } else {
        // no data pending so close directly
        closeSocket();
        closingPhase = CLOSING_PHASE.CLOSED;
      }

      logger.emit('end');
    }
  };
}

module.exports = LogentriesTransport;
