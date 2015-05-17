'use strict';

/* eslint no-unused-expressions:0 */

var LogEntriesLogger = require('../lib').LogEntriesLogger;
var sinon = require('sinon');
var _ = require('lodash');

var FIX_TIMESTAMP = 1431876377231;
var FIX_TIMESTAMP_DATE = new Date(FIX_TIMESTAMP);
var FIX_TIMESTAMP_ISO_STRING = FIX_TIMESTAMP_DATE.toISOString();


function StubTransport() {
  var queue = [];

  this.consume = function(item) {
    queue.push(item);
  };

  this.end = function() {};

  this.expect = function(items) {
    items.length.should.eql(queue.length);

    while (queue.length > 0) {
      var entry = queue.shift();
      var item = items.shift();

      entry.should.eql(item);
    }
  };

  this.reset = function() {
    queue = [];
  };
}

function createLogger(transport, opts) {
  var logOpts = _.defaults({}, opts, {
    transport: transport,
    timestamp: function() {
      return FIX_TIMESTAMP_ISO_STRING;
    }
  });

  return new LogEntriesLogger(logOpts);
}


describe('logentries', function() {

  var t;
  var log;

  before(function() {
    t = new StubTransport();
  });

  beforeEach(function() {
    t.reset();
  });

  describe('log levels', function() {

    it('should log to info and close transport', function() {
      log = createLogger(t);
      sinon.spy(t, 'end');
      sinon.spy(t, 'consume');

      try {
        log.info('t1');
        log.end();

        t.expect([
          [FIX_TIMESTAMP_ISO_STRING, 'info', 't1']
        ]);
        sinon.assert.calledOnce(t.consume);
        sinon.assert.calledOn(t.consume, t);
        sinon.assert.calledOnce(t.end);
        sinon.assert.calledOn(t.end, t);
      } finally {
        t.end.restore();
        t.consume.restore();
      }
    });

    it('should log to custom levels', function() {
      log = createLogger(t, {
        levels: {
          foo: 0,
          bar: 1
        }
      });

      log.foo('t1');
      log.log('bar', 't2');

      expect(log.info).to.not.exist;
      t.expect([
        [FIX_TIMESTAMP_ISO_STRING, 'foo', 't1'],
        [FIX_TIMESTAMP_ISO_STRING, 'bar', 't2']
      ]);
    });

    it('should filter based on log level set', function() {
      log = createLogger(t);
      log.level('err');

      log.debug('t0');
      log.info('t1');
      log.notice('t2');
      log.warning('t3');
      log.err('t4');
      log.crit('t5');
      log.alert('t6');
      log.emerg('t7');
      log.level().should.eql('err');

      t.expect([
        [FIX_TIMESTAMP_ISO_STRING, 'err', 't4'],
        [FIX_TIMESTAMP_ISO_STRING, 'crit', 't5'],
        [FIX_TIMESTAMP_ISO_STRING, 'alert', 't6'],
        [FIX_TIMESTAMP_ISO_STRING, 'emerg', 't7']
      ]);
    });

    it('should throw error when trying to set an unknown log level', function() {
      log = createLogger(t);

      expect(function() {
        log.level('invalid');
      }).to.throw('Unknown log level: invalid');
    });

    it('should prepend custom timestamp given as Date object', function() {
      log = createLogger(t, {
        timestamp: function() {
          return FIX_TIMESTAMP_DATE;
        }
      });

      log.info('t1');

      t.expect([
        [FIX_TIMESTAMP_ISO_STRING, 'info', 't1']
      ]);
    });

    it('should prepend custom timestamp given as number', function() {
      log = createLogger(t, {
        timestamp: function() {
          return FIX_TIMESTAMP;
        }
      });

      log.info('t1');

      t.expect([
        [FIX_TIMESTAMP_ISO_STRING, 'info', 't1']
      ]);
    });

    it('should not prepend timestamp', function() {
      log = createLogger(t, {
        timestamp: false
      });

      log.info('t1');

      t.expect([
        ['info', 't1']
      ]);
    });
  });

  describe('types', function() {

    before(function() {
      log = createLogger(t);
    });

    it('should support null', function() {
      log.info(null);

      t.expect([
        [FIX_TIMESTAMP_ISO_STRING, 'info', 'null']
      ]);
    });

    it('should support undefined', function() {
      log.info(undefined);

      t.expect([
        [FIX_TIMESTAMP_ISO_STRING, 'info', 'undefined']
      ]);
    });

    it('should support strings', function() {
      log.info('str');

      t.expect([
        [FIX_TIMESTAMP_ISO_STRING, 'info', 'str']
      ]);
    });

    it('should support booleans', function() {
      log.info(true);
      log.info(false);

      t.expect([
        [FIX_TIMESTAMP_ISO_STRING, 'info', 'true'],
        [FIX_TIMESTAMP_ISO_STRING, 'info', 'false']
      ]);
    });

    it('should support numbers', function() {
      log.info(-1);
      log.info(0);
      log.info(2);
      log.info(3.4);

      t.expect([
        [FIX_TIMESTAMP_ISO_STRING, 'info', '-1'],
        [FIX_TIMESTAMP_ISO_STRING, 'info', '0'],
        [FIX_TIMESTAMP_ISO_STRING, 'info', '2'],
        [FIX_TIMESTAMP_ISO_STRING, 'info', '3.4']
      ]);
    });

    it('should support Date objects', function() {
      var date = new Date();

      log.info(date);

      t.expect([
        [FIX_TIMESTAMP_ISO_STRING, 'info', date.toISOString()]
      ]);
    });

    it('should support flattened objects', function() {
      log.info({
        a: '1',
        b: '2'
      });
      log.info(['a', 'b']);
      log.info({
        a: null
      });
      log.info({
        a: []
      });
      log.info({
        a: [null]
      });

      t.expect([
        [FIX_TIMESTAMP_ISO_STRING, 'info', 'a=1 b=2 '],
        [FIX_TIMESTAMP_ISO_STRING, 'info', '0=a 1=b '],
        [FIX_TIMESTAMP_ISO_STRING, 'info', 'a=null '],
        [FIX_TIMESTAMP_ISO_STRING, 'info', ''],
        [FIX_TIMESTAMP_ISO_STRING, 'info', 'a.0=null ']
      ]);
    });

    it('should replace newlines in strings with unicode line separator', function() {
      log.info('str0\nstr1\nstr2');

      t.expect([
        [FIX_TIMESTAMP_ISO_STRING, 'info', 'str0\u2028str1\u2028str2']
      ]);
    });
  });

  describe('events', function() {

    var errorSpy = sinon.spy();

    before(function() {
      log = createLogger(t);
      log.on('error', errorSpy);
    });

    beforeEach(function() {
      errorSpy.reset();
    });

    it('should emit error if log is called with unknown log level', function() {
      log.log('invalid', 't1');

      sinon.assert.calledOnce(errorSpy);
      sinon.assert.calledWith(errorSpy, new Error('Unknown log level: invalid'));
    });

    it('should emit error if transport emits error in consume()', function() {
      var error = new Error('Some error in consume()');
      sinon.stub(t, 'consume').throws(error);

      try {
        log.log('info', 't1');
        sinon.assert.calledOnce(errorSpy);
        sinon.assert.calledWith(errorSpy, error);
      } finally {
        t.consume.restore();
      }
    });

    it('should emit error if transport emits error in end()', function() {
      var error = new Error('Some error in end()');
      sinon.stub(t, 'end').throws(error);

      try {
        log.log('info', 't1');
        log.end();
        sinon.assert.calledOnce(errorSpy);
        sinon.assert.calledWith(errorSpy, error);
      } finally {
        t.end.restore();
      }
    });
  });
});
