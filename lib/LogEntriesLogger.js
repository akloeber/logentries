'use strict';

var util = require('util');
var events = require('events');
var _ = require('lodash');

var LogEntriesTransport = require('./LogEntriesTransport');

/*
 *  opts:
 *    token:    required; Logentries Destination Token UUID
 *
 *    transport:  LogEntriesTransport; transport object
 *    levels:     syslog-style; custom log levels
 *    printerror: true; print errors to STDERR with console.error
 *    secure: false; Use tls for communication
 *    flatten: true; JSON entries will be flattened.
 */
function LogEntriesLogger(opts) {
  events.EventEmitter.call(this);

  opts = _.defaults({}, opts, {
    printerror: false,
    flatten: true,
    timestamp: true,
    levels: {
      debug: 0,
      info: 1,
      notice: 2,
      warning: 3,
      err: 4,
      crit: 5,
      alert: 6,
      emerg: 7
    }
  });

  // filter reserved methods
  opts.levels = _.omit(
    opts.levels, [
      'log',
      'end',
      'level',
      'levels',
      'on',
      'once'
    ]
  );

  // register at least one listener for 'error' as logging failure should not bring down server
  this.on('error', function(err) {
    if (opts.printerror) {
      console.error(err);
    }
  });

  var transport = opts.transport || new LogEntriesTransport(opts, this);
  var currentLevel = -1;
  var currentLevelName;


  this.log = function() {
    var args = Array.prototype.slice.call(arguments);
    var argLevel = args[0];

    if (opts.levels[argLevel] === undefined) {
      this.emit('error', new Error('Unknown log level: ' + argLevel));
    }

    var levelValue = opts.levels[argLevel];

    if (currentLevel <= levelValue) {

      var data = args[1];
      if (_.isDate(data)) {
        // convert Date object to ISO string
        args[1] = data.toISOString();
      } else if (_.isObject(data) || _.isArray(data)) {
        // convert plain object or Array to string
        args[1] = opts.flatten ? flatten(data, '') : JSON.stringify(data);
      } else {
        // convert anything else to string
        args[1] = '' + data;
      }

      //Replace newlines with unicode line separator
      args[1] = args[1].replace(/\n/g, '\u2028');

      if (opts.timestamp) {
        args.unshift(determineTimestampString(opts));
      }

      try {
        transport.consume(args);
      } catch (err) {
        this.emit('error', err);
      }
    }
  };

  this.end = function() {
    try {
      transport.end();
    } catch (err) {
      this.emit('error', err);
    }
  };

  this.level = function(newLevelName) {
    if (newLevelName) {
      if (opts.levels[newLevelName] !== undefined) {
        currentLevel = opts.levels[newLevelName];
        currentLevelName = newLevelName;
      } else {
        throw new Error('Unknown log level: ' + newLevelName);
      }
    }

    return currentLevelName;
  };

  _.forEach(opts.levels, function(levelValue, levelName) {
    this[levelName] = _.partial(this.log, levelName);
  }, this);
}

util.inherits(LogEntriesLogger, events.EventEmitter);

module.exports = LogEntriesLogger;

/**
 * Private functions
 */

function flatten(data, prefix) {
  var result = '';

  _.forEach(data, function(value, key) {
    if (_.isObject(value) || _.isArray(value)) {
      result += flatten(value, prefix + key + '.');
    } else {
      result += prefix + key + '=' + value + ' ';
    }
  });

  return result;
}

function determineTimestampString(opts) {
  var t;
  if (_.isFunction(opts.timestamp)) {
    t = opts.timestamp();
    if (_.isDate(t)) {
      return dateToTimestampString(t);
    } else if (_.isNumber(t)) {
      return dateToTimestampString(new Date(t));
    } else {
      return '' + t;
    }
  } else {
    return dateToTimestampString(new Date());
  }
}

function dateToTimestampString(date) {
  return date.toISOString();
}
