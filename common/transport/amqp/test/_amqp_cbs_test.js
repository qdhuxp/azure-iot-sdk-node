var EventEmitter = require('events').EventEmitter;
var uuid = require('uuid');
var assert = require('chai').assert;
var sinon = require('sinon');

var errors = require('azure-iot-common').errors;
var Message = require('azure-iot-common').Message;
var AmqpMessage = require('../lib/amqp_message.js').AmqpMessage;

var CBS = require('../lib/amqp_cbs.js').ClaimsBasedSecurityAgent;

describe('ClaimsBasedSecurityAgent', function() {
  describe('putToken', function() {
    [undefined, null, ''].forEach(function (badAudience){
      /*Tests_SRS_NODE_COMMON_AMQP_06_016: [The `putToken` method shall throw a ReferenceError if the `audience` argument is falsy.]*/
      it('throws if audience is \'' + badAudience +'\'', function () {
        var cbs = new CBS({});
        assert.throws(function () {
          cbs.putToken(badAudience, 'sas', function () {});
        }, ReferenceError, '');
      });
    });

    [undefined, null, ''].forEach(function (badToken){
      /*Tests_SRS_NODE_COMMON_AMQP_06_017: [The `putToken` method shall throw a ReferenceError if the `token` argument is falsy.]*/
      it('throws if sasToken is \'' + badToken +'\'', function () {
        var cbs = new CBS({});
        assert.throws(function () {
          cbs.putToken('audience', badToken, function () {});
        }, ReferenceError, '');
      });
    });

    // it('attaches the CBS links if necessary', function(testCallback) {
    // });

    it('creates a timer if this is the first pending put token operation', function(testCallback) {
      this.clock = sinon.useFakeTimers();
      var fakeReceiver = new EventEmitter();
      var fakeSender = new EventEmitter();
      fakeSender.send = sinon.stub().resolves();

      var fakeAmqpClient = new EventEmitter();
      fakeAmqpClient.connect = sinon.stub().resolves(),
      fakeAmqpClient.createReceiver = sinon.stub().resolves(fakeReceiver),
      fakeAmqpClient.createSender = sinon.stub().resolves(fakeSender)

      var cbs = new CBS(fakeAmqpClient);
      var spyRemoveExpiredPutTokens = sinon.spy(cbs, '_removeExpiredPutTokens');
      cbs.attach(function(err) {
        assert.isNotOk(err, 'initalization passed');
        cbs._putToken.numberOfSecondsToTimeout = 120;
        cbs._putToken.putTokenTimeOutExaminationInterval = 10000;
        cbs.putToken('audience','sasToken', function () {});
        this.clock.tick(9999);
        assert.isTrue(spyRemoveExpiredPutTokens.notCalled, ' removeExpiredPutTokens should not have been called.');
        this.clock.tick(2);
        assert.isTrue(spyRemoveExpiredPutTokens.calledOnce, ' removeExpiredPutTokens should have been called once.');
        clearTimeout(cbs._putToken.timeoutTimer);
        this.clock.restore();
        testCallback();
      }.bind(this));
    });

    it('Two putTokens in succession still causes only one invocation of the timer callback', function(testCallback) {
      this.clock = sinon.useFakeTimers();
      var fakeReceiver = new EventEmitter();
      var fakeSender = new EventEmitter();
      fakeSender.send = sinon.stub().resolves();

      var fakeAmqpClient = new EventEmitter();
      fakeAmqpClient.connect = sinon.stub().resolves(),
      fakeAmqpClient.createReceiver = sinon.stub().resolves(fakeReceiver),
      fakeAmqpClient.createSender = sinon.stub().resolves(fakeSender)

      var cbs = new CBS(fakeAmqpClient);
      var spyRemoveExpiredPutTokens = sinon.spy(cbs, '_removeExpiredPutTokens');
      cbs.attach(function(err) {
        assert.isNotOk(err, 'initalization passed');
        cbs._putToken.numberOfSecondsToTimeout = 120;
        cbs._putToken.putTokenTimeOutExaminationInterval = 10000;
        cbs.putToken('audience','sasToken', function () {});
        this.clock.tick(500);
        assert.isTrue(spyRemoveExpiredPutTokens.notCalled, ' removeExpiredPutTokens should not have been called.');
        cbs.putToken('audience1','sasToken2', function () {});
        this.clock.tick(500);
        assert.isTrue(spyRemoveExpiredPutTokens.notCalled, ' removeExpiredPutTokens should not have been called.');
        this.clock.tick(8999);
        assert.isTrue(spyRemoveExpiredPutTokens.notCalled, ' removeExpiredPutTokens should not have been called.');
        this.clock.tick(6000);
        assert.isTrue(spyRemoveExpiredPutTokens.calledOnce, ' removeExpiredPutTokens should have been called once.');
        clearTimeout(cbs._putToken.timeoutTimer);
        this.clock.restore();
        testCallback();
      }.bind(this));
    });

    /*Tests_SRS_NODE_COMMON_AMQP_06_005: [The `putToken` method shall construct an amqp message that contains the following application properties:
    'operation': 'put-token'
    'type': 'servicebus.windows.net:sastoken'
    'name': <audience>

    and system properties of

    'to': '$cbs'
    'messageId': <uuid>
    'reply_to': 'cbs']

    and a body containing <sasToken>. */
    /*Tests_SRS_NODE_COMMON_AMQP_06_015: [The `putToken` method shall send this message over the `$cbs` sender link.]*/
    it('sends a put token operation', function(testCallback) {
      var fakeUuids = [uuid.v4()];
      var uuidStub = sinon.stub(uuid,'v4');
      uuidStub.onCall(0).returns(fakeUuids[0]);
      var fakeReceiver = new EventEmitter();
      var fakeSender = new EventEmitter();
      fakeSender.send = sinon.stub().resolves();

      var fakeAmqpClient = new EventEmitter();
      fakeAmqpClient.connect = sinon.stub().resolves(),
      fakeAmqpClient.createReceiver = sinon.stub().resolves(fakeReceiver),
      fakeAmqpClient.createSender = sinon.stub().resolves(fakeSender)

      var cbs = new CBS(fakeAmqpClient);
      var spyRemoveExpiredPutTokens = sinon.spy(cbs, '_removeExpiredPutTokens');
      cbs.attach(function(err) {
        assert.isNotOk(err, 'initalization passed');
        cbs.putToken('myaudience', 'my token');
        uuid.v4.restore();
        assert.equal(fakeSender.send.args[0][0].applicationProperties.operation, 'put-token', 'operation application property not equal');
        assert.equal(fakeSender.send.args[0][0].applicationProperties.type, 'servicebus.windows.net:sastoken', 'type application property not equal');
        assert.equal(fakeSender.send.args[0][0].applicationProperties.name, 'myaudience', 'name application property not equal');
        assert.equal(fakeSender.send.args[0][0].properties.to, '$cbs', 'to application property not equal');
        assert.equal(fakeSender.send.args[0][0].properties.messageId, fakeUuids[0], 'messageId n property not equal');
        assert.equal(fakeSender.send.args[0][0].properties.reply_to, 'cbs', 'reply_to property not equal');
        assert.isTrue(fakeSender.send.args[0][0].body === 'my token', 'body of put token not the sas token');
        clearTimeout(cbs._putToken.timeoutTimer);
        testCallback();
      });
    });

    /*Tests_SRS_NODE_COMMON_AMQP_06_006: [The `putToken` method shall call `putTokenCallback` (if supplied) if the `send` generates an error such that no response from the service will be forthcoming.]*/
    it('sends two put tokens erroring the second , ensuring the first remains', function(testCallback) {
      var fakeUuids = [uuid.v4(), uuid.v4()];
      var uuidStub = sinon.stub(uuid,'v4');
      uuidStub.onCall(0).returns(fakeUuids[0]);
      uuidStub.onCall(1).returns(fakeUuids[1]);
      var fakeReceiver = new EventEmitter();
      var fakeSender = new EventEmitter();
      fakeSender.send = sinon.stub().resolves();

      var fakeAmqpClient = new EventEmitter();
      fakeAmqpClient.connect = sinon.stub().resolves(),
      fakeAmqpClient.createReceiver = sinon.stub().resolves(fakeReceiver),
      fakeAmqpClient.createSender = sinon.stub().resolves(fakeSender)

      var cbs = new CBS(fakeAmqpClient);

      cbs.attach(function(err) {
        assert.isNotOk(err, 'initalization passed');
        cbs.putToken('first audience', 'first token', function () {
          assert.fail('This callback for the first put token should not have been called');
        });
        fakeSender.send = sinon.stub().rejects('could not send');
        cbs.putToken('second audience', 'second token', function (err) {
          assert.instanceOf(err, Error);
          //
          // Make sure that the first put token is still outstanding.
          //
          assert.equal(cbs._putToken.outstandingPutTokens.length, 1, 'outstanding token array length' );
          assert.equal(cbs._putToken.outstandingPutTokens[0].correlationId, fakeUuids[0], 'outstanding token correlation id ');
          clearTimeout(cbs._putToken.timeoutTimer);
          testCallback();
        });
        uuid.v4.restore();
      });
    });

    /*Tests_SRS_NODE_COMMON_AMQP_06_007: [ The `putToken` method will time out the put token operation if no response is returned within a configurable number of seconds.]*/
    /*Tests_SRS_NODE_COMMON_AMQP_06_008: [ The `putToken` method will invoke the `putTokenCallback` (if supplied) with an error object if the put token operation timed out. ]*/
    it('Three put tokens, two timeout initially, third later', function(testCallback) {
      this.clock = sinon.useFakeTimers();
      var fakeUuids = [uuid.v4(), uuid.v4(), uuid.v4()];
      var uuidStub = sinon.stub(uuid,'v4');
      uuidStub.onCall(0).returns(fakeUuids[0]);
      uuidStub.onCall(1).returns(fakeUuids[1]);
      uuidStub.onCall(2).returns(fakeUuids[2]);
      var fakeReceiver = new EventEmitter();
      var fakeSender = new EventEmitter();
      fakeSender.send = sinon.stub().resolves();

      var fakeAmqpClient = new EventEmitter();
      fakeAmqpClient.connect = sinon.stub().resolves(),
      fakeAmqpClient.createReceiver = sinon.stub().resolves(fakeReceiver),
      fakeAmqpClient.createSender = sinon.stub().resolves(fakeSender)

      var cbs = new CBS(fakeAmqpClient);

      cbs.attach(function(err) {
        assert.isNotOk(err, 'initalization passed');
        cbs._putToken.numberOfSecondsToTimeout = 120;
        cbs._putToken.putTokenTimeOutExaminationInterval = 10000;
        cbs.putToken('first audience', 'first token', function (err) {
          assert.instanceOf(err, errors.TimeoutError);
          //
          // There should only be one outstanding put token when this first put token is timed out.
          //
          assert.equal(cbs._putToken.outstandingPutTokens.length, 1, 'For the first put token call back invocation outstanding remaining ');
          assert.equal(cbs._putToken.outstandingPutTokens[0].correlationId, fakeUuids[2], 'For the first put token callback the outstanding correlation id. ');
        });
        this.clock.tick(5000); // 5 seconds between first and second
        cbs.putToken('second audience', 'second token', function (err) {
          assert.instanceOf(err, errors.TimeoutError);
          //
          // There should only be one outstanding put token when this second put token is timed out.
          //
          assert.equal(cbs._putToken.outstandingPutTokens.length, 1, 'For the second put token call back invocation outstanding remaining ');
          assert.equal(cbs._putToken.outstandingPutTokens[0].correlationId, fakeUuids[2], 'For the second put token callback the outstanding correlation id. ');
        });
        this.clock.tick(30000); // 30 seconds more till the third
        cbs.putToken('third audience', 'third token', function (err) {
          assert.instanceOf(err, errors.TimeoutError);
          //
          // There should be no outstanding put token when this put token is timed out.
          //
          assert.equal(cbs._putToken.outstandingPutTokens.length, 0, 'For the third put token call back invocation outstanding remaining ');
          this.clock.restore();
          testCallback();
        }.bind(this));
        this.clock.tick(100000); // 100 seconds more should have resulted in timeouts for the first two.
        process.nextTick(function () {
          this.clock.tick(40000); // 40 seconds more should have resulted in timeouts for the third.
        }.bind(this));
        uuid.v4.restore();
      }.bind(this));
    });

    /*Tests_SRS_NODE_COMMON_AMQP_06_013: [A put token response of 200 will invoke `putTokenCallback` with null parameters.]*/
    it('Three put tokens, first and third timeout eventually, second completes successfully', function(testCallback) {
      this.clock = sinon.useFakeTimers();
      var fakeUuids = [uuid.v4(), uuid.v4(), uuid.v4()];
      var uuidStub = sinon.stub(uuid,'v4');
      uuidStub.onCall(0).returns(fakeUuids[0]);
      uuidStub.onCall(1).returns(fakeUuids[1]);
      uuidStub.onCall(2).returns(fakeUuids[2]);
      var responseMessage = new AmqpMessage();
      responseMessage.properties = {};
      responseMessage.applicationProperties = {};
      responseMessage.properties.correlationId = fakeUuids[1];
      responseMessage.applicationProperties['status-code'] = 200;
      var fakeReceiver = new EventEmitter();
      fakeReceiver.accept = sinon.spy();
      var fakeSender = new EventEmitter();
      fakeSender.send = sinon.stub().resolves();

      var fakeAmqpClient = new EventEmitter();
      fakeAmqpClient.connect = sinon.stub().resolves(),
      fakeAmqpClient.createReceiver = sinon.stub().resolves(fakeReceiver),
      fakeAmqpClient.createSender = sinon.stub().resolves(fakeSender)

      var cbs = new CBS(fakeAmqpClient);

      cbs.attach(function(err) {
        assert.isNotOk(err, 'initalization passed');
        cbs._putToken.numberOfSecondsToTimeout = 120;
        cbs._putToken.putTokenTimeOutExaminationInterval = 10000;
        cbs.putToken('first audience', 'first token', function (err) {
          assert.instanceOf(err, errors.TimeoutError);
          //
          // There should only be one outstanding put token when this first put token is timed out.
          //
          assert.equal(cbs._putToken.outstandingPutTokens.length, 1, 'For the first put token call back invocation outstanding remaining ');
          assert.equal(cbs._putToken.outstandingPutTokens[0].correlationId, fakeUuids[2], 'For the second put token callback the first outstanding correlation id. ');
        });
        this.clock.tick(20000); // 20 seconds between first and second
        cbs.putToken('second audience', 'second token', function (err, putTokenResult) {
          assert.isNotOk(err,'The error object passed');
          assert.isNotOk(putTokenResult,'The result object passed');
          //
          // There should be two outstanding put token when this second put token succeeds.
          //
          assert.equal(cbs._putToken.outstandingPutTokens.length, 2, 'For the second put token call back invocation outstanding remaining ');
          assert.equal(cbs._putToken.outstandingPutTokens[0].correlationId, fakeUuids[0], 'For the second put token callback the first outstanding correlation id. ');
          assert.equal(cbs._putToken.outstandingPutTokens[1].correlationId, fakeUuids[2], 'For the second put token callback the second outstanding correlation id. ');
        });
        this.clock.tick(30000); // 30 seconds more till the third.  We are at 50 seconds from the start of the first put token.
        cbs.putToken('third audience', 'third token', function (err) {
          assert.instanceOf(err, errors.TimeoutError);
          //
          // There should be no outstanding put token when this put token is timed out.
          //
          assert.equal(cbs._putToken.outstandingPutTokens.length, 0, 'For the third put token call back invocation outstanding remaining ');
          assert(fakeReceiver.accept.calledOnce);
          this.clock.restore();
          testCallback();
        }.bind(this));
        this.clock.tick(40000); // Let them sit in the outstanding list for a bit.  We should be at 1 minute 30 seconds at this point.
        process.nextTick(function () {
          //
          // Emit a put token response which should complete the second put token.
          //
          fakeReceiver.emit('message', responseMessage);
          this.clock.tick(10000); // Move forward a bit We should be at 1 minute 40 seconds after the start of the first put token.
          process.nextTick(function () {
            assert.equal(cbs._putToken.outstandingPutTokens.length, 2, 'First time stop after completing the second put token');
            assert.equal(cbs._putToken.outstandingPutTokens[0].correlationId, fakeUuids[0], 'First time stop - the first outstanding correlation id. ');
            assert.equal(cbs._putToken.outstandingPutTokens[1].correlationId, fakeUuids[2], 'First time stop - the second outstanding correlation id. ');
            //
            // At this point the second put token is done.  Move forward enough time to complete the first put token
            //
            this.clock.tick(30000); // Move forward 30 seconds. We should be at 2 minutes 20 seconds after the start of the first put token.
            process.nextTick(function () {
              assert.equal(cbs._putToken.outstandingPutTokens.length, 1, 'Second time stop after completing the second put token');
              assert.equal(cbs._putToken.outstandingPutTokens[0].correlationId, fakeUuids[2], 'Second time stop - the third put token should be remaining.');
              //
              // At this point the first put token is done (timed out).  Move forward enough time to complete the third put token.
              //
              this.clock.tick(60000); // Move forward 60 seconds. We should be at 3 minutes 20 seconds after the start of the first put token.  This should time out the third put token
            }.bind(this));
          }.bind(this));
        }.bind(this));
        uuid.v4.restore();
      }.bind(this));
    });

    /*Tests_SRS_NODE_COMMON_AMQP_06_014: [A put token response not equal to 200 will invoke `putTokenCallback` with an error object of UnauthorizedError.]*/
    it('Status result not equal to 200 completes the put token with an error.', function(testCallback) {
      var fakeUuids = [uuid.v4()];
      var uuidStub = sinon.stub(uuid,'v4');
      uuidStub.onCall(0).returns(fakeUuids[0]);
      var responseMessage = new AmqpMessage();
      responseMessage.properties = {};
      responseMessage.applicationProperties = {};
      responseMessage.properties.correlationId = fakeUuids[0];
      responseMessage.applicationProperties['status-code'] = 201;
      responseMessage.applicationProperties['status-description'] = 'cryptic message';
      var fakeReceiver = new EventEmitter();
      fakeReceiver.accept = sinon.stub();
      var fakeSender = new EventEmitter();
      fakeSender.send = sinon.stub().resolves();

      var fakeAmqpClient = new EventEmitter();
      fakeAmqpClient.connect = sinon.stub().resolves(),
      fakeAmqpClient.createReceiver = sinon.stub().resolves(fakeReceiver),
      fakeAmqpClient.createSender = sinon.stub().resolves(fakeSender)

      var cbs = new CBS(fakeAmqpClient);

      cbs.attach(function(err) {
        assert.isNotOk(err, 'initalization passed');
        cbs.putToken('audience', 'token', function (err, putTokenResult) {
          assert.instanceOf(err, errors.UnauthorizedError);
          assert.isNotOk(putTokenResult,'The result object passed');
          assert.equal(cbs._putToken.outstandingPutTokens.length, 0, 'For put token call nothing should be outstanding.');
          assert(fakeReceiver.accept.calledOnce);
          uuid.v4.restore();
          testCallback();
        });
        fakeReceiver.emit('message', responseMessage);
      }.bind(this));
    });

    it('Do a put token with no callback that completes successfully', function(testCallback) {
      var fakeUuids = [uuid.v4()];
      var uuidStub = sinon.stub(uuid,'v4');
      uuidStub.onCall(0).returns(fakeUuids[0]);
      var responseMessage = new AmqpMessage();
      responseMessage.properties = {};
      responseMessage.applicationProperties = {};
      responseMessage.properties.correlationId = fakeUuids[0];
      responseMessage.applicationProperties['status-code'] = 200;

      var fakeReceiver = new EventEmitter();
      fakeReceiver.accept = sinon.stub();
      var fakeSender = new EventEmitter();
      fakeSender.send = sinon.stub().resolves();

      var fakeAmqpClient = new EventEmitter();
      fakeAmqpClient.connect = sinon.stub().resolves(),
      fakeAmqpClient.createReceiver = sinon.stub().resolves(fakeReceiver),
      fakeAmqpClient.createSender = sinon.stub().resolves(fakeSender)

      var cbs = new CBS(fakeAmqpClient);

      cbs.attach(function(err) {
        assert.isNotOk(err, 'initalization passed');
        cbs.putToken('first audience', 'first token');
        assert.equal(cbs._putToken.outstandingPutTokens.length, 1, 'Should be one put token outstanding.');
        //
        // Emit a put token response which should complete the put token.
        //
        fakeReceiver.emit('message',responseMessage);
        process.nextTick(function () {
          assert.equal(cbs._putToken.outstandingPutTokens.length, 0, 'First time stop all should be done');
          assert(fakeReceiver.accept.calledOnce);
          uuid.v4.restore();
          testCallback();
        }.bind(this));
      }.bind(this));
    });
  });
});